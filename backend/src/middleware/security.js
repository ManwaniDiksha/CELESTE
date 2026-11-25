import cors from 'cors';
import {
  getAllowedCorsOrigins,
  isProductionRuntime,
  isVercelRuntime,
  normalizeOrigin,
} from '../config/env.js';

function isSameOriginRequest(req, normalizedOrigin) {
  const hostHeader = isVercelRuntime()
    ? req.get('x-forwarded-host') || req.get('host')
    : req.get('host');

  if (!hostHeader) {
    return false;
  }

  const requestHost = hostHeader.split(',')[0].trim();
  const protocol = isVercelRuntime()
    ? (req.get('x-forwarded-proto') || 'https').split(',')[0].trim()
    : req.protocol;

  const serverOrigin = normalizeOrigin(`${protocol}://${requestHost}`);
  return Boolean(serverOrigin && normalizedOrigin === serverOrigin);
}

/**
 * Configures CORS with explicit allowed origins and credentials: true
 * so HttpOnly session cookies work across the local Vite/Express origins.
 */
export function createCorsMiddleware() {
  return cors((req, callback) => {
    const requestOrigin = req.get('origin');

    // Allow requests without an Origin header (curl, server-to-server, Vercel cron).
    if (!requestOrigin) {
      return callback(null, { origin: false });
    }

    const normalizedOrigin = normalizeOrigin(requestOrigin);
    const allowedOrigins = getAllowedCorsOrigins();

    if (
      normalizedOrigin &&
      (isSameOriginRequest(req, normalizedOrigin) || allowedOrigins.has(normalizedOrigin))
    ) {
      return callback(null, {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      });
    }

    const corsError = new Error(`Origin ${requestOrigin} not allowed by CORS`);
    corsError.status = 403;
    return callback(corsError);
  });
}

/**
 * Adds baseline HTTP security headers across all API responses.
 */
export function securityHeadersMiddleware(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');

  const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  if (isProductionRuntime() || req.secure || forwardedProto === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}
