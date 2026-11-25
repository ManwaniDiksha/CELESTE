import crypto from 'node:crypto';
import { getCronSecret, getPinAuthConfig, isSupabaseConfigured } from '../config/env.js';
import { getSupabaseClient } from '../config/supabase.js';
import { readPinSessionFromRequest } from '../utils/cookies.js';
import { extractBearerToken, isValidStaffSlug } from '../utils/validation.js';

function timingSafeStringMatch(provided, expected) {
  const providedDigest = crypto.createHash('sha256').update(String(provided), 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(String(expected), 'utf8').digest();
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

/**
 * Authorizes Supabase Auth owner requests via Authorization: Bearer <token>.
 * Trusts ONLY user.app_metadata.role === 'owner' (never user_metadata).
 */
export async function requireOwnerAuth(req, res, next) {
  const token = extractBearerToken(req.get('authorization'));
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Owner authentication required.',
    });
  }

  if (!isSupabaseConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Authentication service is not configured.',
    });
  }

  try {
    const supabaseAdmin = getSupabaseClient();
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired owner session.',
      });
    }

    if (data.user.app_metadata?.role !== 'owner') {
      return res.status(403).json({
        success: false,
        error: 'Owner role is required to access this resource.',
      });
    }

    req.ownerAuth = {
      userId: data.user.id,
      email: data.user.email || null,
      role: 'owner',
    };

    return next();
  } catch (err) {
    console.error('[CELESTE auth] Owner verification failed:', err?.message || 'Unknown error');
    return res.status(503).json({
      success: false,
      error: 'Unable to verify owner session right now.',
    });
  }
}

/**
 * Authorizes requests holding a valid Reception-scoped PIN session cookie.
 */
export function requireReceptionAuth(req, res, next) {
  const { sessionSecret } = getPinAuthConfig();
  if (!sessionSecret) {
    return res.status(503).json({
      success: false,
      error: 'PIN session authentication is not configured.',
    });
  }

  const { session } = readPinSessionFromRequest(req, sessionSecret);
  if (!session) {
    return res.status(401).json({
      success: false,
      error: 'Reception PIN authentication required.',
    });
  }

  if (session.scope !== 'reception') {
    return res.status(403).json({
      success: false,
      error: 'Reception scope is required.',
    });
  }

  req.pinAuth = session;
  return next();
}

/**
 * Authorizes requests holding a valid Staff-scoped PIN session cookie
 * bound to an existing staff slug in public.staff.
 */
export async function requireStaffAuth(req, res, next) {
  const { sessionSecret } = getPinAuthConfig();
  if (!sessionSecret || !isSupabaseConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Staff PIN authentication is not configured.',
    });
  }

  const { session } = readPinSessionFromRequest(req, sessionSecret);
  if (!session) {
    return res.status(401).json({
      success: false,
      error: 'Staff PIN authentication required.',
    });
  }

  if (session.scope !== 'staff') {
    return res.status(403).json({
      success: false,
      error: 'Staff scope is required.',
    });
  }

  const targetSlug = typeof req.params?.slug === 'string'
    ? req.params.slug.trim().toLowerCase()
    : session.staffSlug;

  if (!isValidStaffSlug(targetSlug)) {
    return res.status(404).json({
      success: false,
      error: 'Staff member not found.',
    });
  }

  try {
    const supabaseAdmin = getSupabaseClient();
    const { data: staff, error } = await supabaseAdmin
      .from('staff')
      .select('id, slug, name_en, name_gu, is_on_duty, availability_status')
      .eq('slug', targetSlug)
      .maybeSingle();

    if (error) {
      console.error('[CELESTE auth] Staff lookup failed:', error.message);
      return res.status(503).json({
        success: false,
        error: 'Unable to verify staff profile right now.',
      });
    }

    if (!staff) {
      return res.status(404).json({
        success: false,
        error: 'Staff member not found.',
      });
    }

    if (session.staffSlug !== staff.slug) {
      return res.status(403).json({
        success: false,
        error: 'Access denied for this staff profile.',
      });
    }

    req.pinAuth = session;
    req.staffMember = staff;
    return next();
  } catch (err) {
    console.error('[CELESTE auth] Staff verification exception:', err?.message || 'Unknown error');
    return res.status(503).json({
      success: false,
      error: 'Unable to verify staff profile right now.',
    });
  }
}

/**
 * Authorizes Vercel Cron or scheduled backend calls using Bearer CRON_SECRET.
 */
export function requireCronAuth(req, res, next) {
  const cronSecret = getCronSecret();
  if (!cronSecret) {
    return res.status(503).json({
      success: false,
      error: 'Cron authentication is not configured.',
    });
  }

  const token = extractBearerToken(req.get('authorization'));
  if (!token || !timingSafeStringMatch(token, cronSecret)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized cron request.',
    });
  }

  return next();
}
