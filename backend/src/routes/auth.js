import { Router } from 'express';
import { getDemoConfig, getPinAuthConfig, isProductionRuntime, isSupabaseConfigured } from '../config/env.js';
import { createAuthSupabaseClient, getSupabaseClient } from '../config/supabase.js';
import { requireOwnerAuth } from '../middleware/auth.js';
import {
  clearPinSessionCookie,
  readPinSessionFromRequest,
  setPinSessionCookie,
} from '../utils/cookies.js';
import { isValidPinHashFormat, verifyPin } from '../utils/pinCrypto.js';
import { getClientIpKey, validateDemoPinLoginBody, validatePinLoginBody } from '../utils/validation.js';

const router = Router();

function formatRetryAfterSeconds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 900;
}

/**
 * POST /api/auth/pin/login
 * Authenticates Reception or Staff using the shared scrypt PIN hash and
 * PostgreSQL atomic lockout RPCs (Migration 005).
 */
router.post('/pin/login', async (req, res) => {
  const { pinHash, sessionSecret } = getPinAuthConfig();
  if (!isSupabaseConfigured() || !isValidPinHashFormat(pinHash) || sessionSecret.length < 32) {
    return res.status(503).json({
      success: false,
      error: 'PIN authentication is not properly configured.',
    });
  }

  const parsedBody = validatePinLoginBody(req.body);
  if (!parsedBody.ok) {
    return res.status(400).json({
      success: false,
      error: parsedBody.error,
    });
  }

  const { pin, scope, staffSlug } = parsedBody.value;
  const ipKey = getClientIpKey(req, sessionSecret);
  const supabaseAdmin = getSupabaseClient();

  try {
    // 1. Check lockout status before running scrypt. Fail closed on RPC error.
    const { data: lockoutRes, error: lockoutError } = await supabaseAdmin.rpc(
      'check_pin_auth_lockout',
      { p_ip_key: ipKey }
    );

    if (lockoutError || typeof lockoutRes?.data?.is_locked !== 'boolean') {
      console.error('[CELESTE auth] Lockout check RPC failed:', lockoutError?.message || 'Malformed RPC response');
      return res.status(503).json({
        success: false,
        error: 'Unable to verify authentication rate limits right now.',
      });
    }

    if (lockoutRes.data.is_locked) {
      const retryAfter = formatRetryAfterSeconds(lockoutRes.data.retry_after_seconds);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: 'Too many failed PIN attempts. Please try again later.',
        data: {
          is_locked: true,
          failed_count: lockoutRes.data.failed_count,
          max_attempts: lockoutRes.data.max_attempts,
          remaining_attempts: 0,
          locked_until: lockoutRes.data.locked_until,
          retry_after_seconds: retryAfter,
        },
      });
    }

    // 2. Constant-time scrypt PIN verification (plus local-only demo PIN hash when DEMO_ACCESS_ENABLED=true).
    const demo = getDemoConfig();
    let isPinValid = await verifyPin(pin, pinHash);
    if (!isPinValid && demo.enabled && isValidPinHashFormat(demo.demoPinHash)) {
      isPinValid = await verifyPin(pin, demo.demoPinHash);
    }

    if (!isPinValid) {
      const { data: failureRes, error: failureError } = await supabaseAdmin.rpc(
        'record_pin_auth_failure',
        { p_ip_key: ipKey }
      );

      if (failureError || typeof failureRes?.data?.is_locked !== 'boolean') {
        console.error('[CELESTE auth] Record failure RPC failed:', failureError?.message || 'Malformed RPC response');
        return res.status(503).json({
          success: false,
          error: 'Unable to process PIN attempt right now.',
        });
      }

      if (failureRes.data.is_locked) {
        const retryAfter = formatRetryAfterSeconds(failureRes.data.retry_after_seconds);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
          success: false,
          error: 'Too many failed PIN attempts. Locked for 15 minutes.',
          data: {
            is_locked: true,
            failed_count: failureRes.data.failed_count,
            max_attempts: failureRes.data.max_attempts,
            remaining_attempts: 0,
            locked_until: failureRes.data.locked_until,
            retry_after_seconds: retryAfter,
          },
        });
      }

      return res.status(401).json({
        success: false,
        error: 'Invalid PIN.',
        data: {
          is_locked: false,
          failed_count: failureRes.data.failed_count,
          max_attempts: failureRes.data.max_attempts,
          remaining_attempts: failureRes.data.remaining_attempts,
        },
      });
    }

    // 3. For Staff scope, confirm staffSlug exists in public.staff before resetting/minting.
    let staffProfile = null;
    if (scope === 'staff') {
      const { data: staff, error: staffError } = await supabaseAdmin
        .from('staff')
        .select('id, slug, name_en, name_gu')
        .eq('slug', staffSlug)
        .maybeSingle();

      if (staffError) {
        console.error('[CELESTE auth] Staff slug check failed:', staffError.message);
        return res.status(503).json({
          success: false,
          error: 'Unable to verify staff profile right now.',
        });
      }

      if (!staff) {
        return res.status(404).json({
          success: false,
          error: 'Selected staff member was not found.',
        });
      }

      staffProfile = staff;
    }

    // 4. Reset attempt state & verify no concurrent lockout took effect.
    const { data: resetRes, error: resetError } = await supabaseAdmin.rpc(
      'reset_pin_auth_attempts',
      { p_ip_key: ipKey }
    );

    if (resetError || typeof resetRes?.data?.is_locked !== 'boolean') {
      console.error('[CELESTE auth] Reset attempts RPC failed:', resetError?.message || 'Malformed RPC response');
      return res.status(503).json({
        success: false,
        error: 'Unable to complete authentication right now.',
      });
    }

    if (resetRes.data.is_locked) {
      const retryAfter = formatRetryAfterSeconds(resetRes.data.retry_after_seconds);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: 'PIN authentication is temporarily locked due to concurrent failed attempts.',
        data: {
          is_locked: true,
          failed_count: resetRes.data.failed_count,
          locked_until: resetRes.data.locked_until,
          retry_after_seconds: retryAfter,
        },
      });
    }

    // 5. Issue signed HttpOnly session cookie (12-hour TTL).
    setPinSessionCookie(
      req,
      res,
      {
        scope,
        staffSlug: scope === 'staff' ? staffProfile.slug : null,
      },
      sessionSecret
    );

    return res.status(200).json({
      success: true,
      data: {
        authenticated: true,
        scope,
        staffSlug: scope === 'staff' ? staffProfile.slug : null,
        staff: staffProfile,
      },
      message: 'PIN authentication succeeded.',
    });
  } catch (err) {
    console.error('[CELESTE auth] Unexpected login error:', err?.message || 'Unknown error');
    return res.status(500).json({
      success: false,
      error: 'Authentication failed due to a server error.',
    });
  }
});

/**
 * POST /api/auth/pin/logout
 * Clears the HttpOnly PIN session cookie.
 */
router.post('/pin/logout', (req, res) => {
  clearPinSessionCookie(req, res);
  return res.status(200).json({
    success: true,
    data: {
      authenticated: false,
      scope: null,
      staffSlug: null,
    },
    message: 'Signed out successfully.',
  });
});

/**
 * GET /api/auth/pin/session
 * Returns current PIN session state without exposing secrets or raw tokens.
 */
router.get('/pin/session', async (req, res) => {
  const { sessionSecret } = getPinAuthConfig();
  if (!sessionSecret || sessionSecret.length < 32) {
    return res.status(503).json({
      success: false,
      error: 'PIN session authentication is not configured.',
    });
  }

  const { present, session } = readPinSessionFromRequest(req, sessionSecret);
  if (!session) {
    if (present) {
      clearPinSessionCookie(req, res);
    }
    return res.status(200).json({
      success: true,
      data: {
        authenticated: false,
        scope: null,
        staffSlug: null,
      },
    });
  }

  let staffProfile = null;
  if (session.scope === 'staff') {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Unable to verify staff session right now.',
      });
    }

    try {
      const supabaseAdmin = getSupabaseClient();
      const { data: staff, error } = await supabaseAdmin
        .from('staff')
        .select('id, slug, name_en, name_gu')
        .eq('slug', session.staffSlug)
        .maybeSingle();

      if (error) {
        console.error('[CELESTE auth] Session staff lookup failed:', error.message);
        return res.status(503).json({
          success: false,
          error: 'Unable to verify staff session right now.',
        });
      }

      if (!staff) {
        clearPinSessionCookie(req, res);
        return res.status(200).json({
          success: true,
          data: {
            authenticated: false,
            scope: null,
            staffSlug: null,
          },
        });
      }

      staffProfile = staff;
    } catch (err) {
      console.error('[CELESTE auth] Session verification exception:', err?.message || 'Unknown error');
      return res.status(503).json({
        success: false,
        error: 'Unable to verify staff session right now.',
      });
    }
  }

  return res.status(200).json({
    success: true,
    data: {
      authenticated: true,
      scope: session.scope,
      staffSlug: session.staffSlug,
      staff: staffProfile,
      expiresAt: new Date(session.exp * 1000).toISOString(),
    },
  });
});

/**
 * GET /api/auth/owner/session
 * Verifies Supabase Owner Bearer JWT (app_metadata.role === 'owner').
 */
router.get('/owner/session', requireOwnerAuth, (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      authenticated: true,
      role: 'owner',
      user: {
        id: req.ownerAuth.userId,
        email: req.ownerAuth.email,
      },
    },
  });
});

/**
 * GET /api/auth/demo-config
 * Returns whether local Demo Prefill is enabled (booleans only, zero credentials).
 */
router.get('/demo-config', (_req, res) => {
  const demo = getDemoConfig();
  return res.status(200).json({
    success: true,
    data: {
      enabled: demo.enabled,
      hasPinDemo: demo.hasPinDemo,
      hasOwnerDemo: demo.hasOwnerDemo,
    },
  });
});

function isLoopbackAddress(req) {
  const remote = (req?.socket?.remoteAddress || req?.ip || '').trim().toLowerCase();
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
}

/**
 * GET /api/auth/demo-prefill
 * Narrowly scoped local-evaluation-only prefill endpoint for original login forms.
 * Strictly returns 403 in production, when DEMO_ACCESS_ENABLED != true, or from non-loopback hosts.
 */
router.get('/demo-prefill', (req, res) => {
  const demo = getDemoConfig();
  if (isProductionRuntime() || !demo.enabled || !isLoopbackAddress(req)) {
    return res.status(403).json({
      success: false,
      error: 'Demo prefill is disabled in this environment.',
    });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    success: true,
    data: {
      pin: demo.hasPinDemo ? demo.demoPin : null,
      ownerEmail: demo.hasOwnerDemo ? demo.demoOwnerEmail : null,
      ownerPassword: demo.hasOwnerDemo ? demo.demoOwnerPassword : null,
    },
  });
});

/**
 * POST /api/auth/demo/pin-login
 * Issues a standard signed HttpOnly PIN session cookie for Reception or Staff
 * ONLY when DEMO_ACCESS_ENABLED=true and non-production, verifying against DEMO_RECEPTION_STAFF_PIN_HASH.
 */
router.post('/demo/pin-login', async (req, res) => {
  const demo = getDemoConfig();
  const { sessionSecret } = getPinAuthConfig();

  if (!demo.enabled || !demo.hasPinDemo || !isSupabaseConfigured() || sessionSecret.length < 32) {
    return res.status(403).json({
      success: false,
      error: 'Demo access is disabled or not configured in this environment.',
    });
  }

  const parsed = validateDemoPinLoginBody(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ success: false, error: parsed.error });
  }

  const providedPin = typeof req.body?.pin === 'string' && req.body.pin.trim()
    ? req.body.pin.trim()
    : demo.demoPin;
  const pinOk = await verifyPin(providedPin, demo.demoPinHash);
  if (!pinOk) {
    return res.status(401).json({ success: false, error: 'Invalid demo PIN.' });
  }

  const { scope, staffSlug } = parsed.value;
  let staffProfile = null;

  if (scope === 'staff') {
    try {
      const supabaseAdmin = getSupabaseClient();
      const { data: staff, error } = await supabaseAdmin
        .from('staff')
        .select('id, slug, name_en, name_gu')
        .eq('slug', staffSlug)
        .maybeSingle();

      if (error) {
        return res.status(503).json({ success: false, error: 'Unable to verify staff profile right now.' });
      }
      if (!staff) {
        return res.status(404).json({ success: false, error: 'Selected staff member was not found.' });
      }
      staffProfile = staff;
    } catch {
      return res.status(503).json({ success: false, error: 'Unable to verify staff profile right now.' });
    }
  }

  setPinSessionCookie(
    req,
    res,
    {
      scope,
      staffSlug: scope === 'staff' ? staffProfile.slug : null,
    },
    sessionSecret
  );

  return res.status(200).json({
    success: true,
    data: {
      authenticated: true,
      demo: true,
      scope,
      staffSlug: scope === 'staff' ? staffProfile.slug : null,
      staff: staffProfile,
    },
    message: 'Demo PIN session activated.',
  });
});

/**
 * POST /api/auth/demo/owner-login
 * Signs in the dedicated demo Owner Supabase Auth account server-side
 * ONLY when DEMO_ACCESS_ENABLED=true and DEMO_OWNER_EMAIL/PASSWORD are configured.
 */
router.post('/demo/owner-login', async (_req, res) => {
  const demo = getDemoConfig();
  if (!demo.enabled || !demo.hasOwnerDemo || !isSupabaseConfigured()) {
    return res.status(403).json({
      success: false,
      error: 'Owner demo access is disabled or not configured in this environment.',
    });
  }

  try {
    const authClient = createAuthSupabaseClient();
    const { data, error } = await authClient.auth.signInWithPassword({
      email: demo.demoOwnerEmail,
      password: demo.demoOwnerPassword,
    });

    if (error || !data?.session || !data?.user) {
      return res.status(401).json({
        success: false,
        error: 'Demo Owner authentication failed.',
      });
    }

    if (data.user.app_metadata?.role !== 'owner') {
      return res.status(403).json({
        success: false,
        error: 'Configured demo account does not have owner role privileges.',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: {
          id: data.user.id,
          email: data.user.email || null,
        },
      },
      message: 'Demo Owner session activated.',
    });
  } catch (err) {
    console.error('[CELESTE auth] Demo owner login failed:', err?.message || 'Unknown error');
    return res.status(503).json({
      success: false,
      error: 'Unable to sign in with demo Owner account right now.',
    });
  }
});

export default router;
