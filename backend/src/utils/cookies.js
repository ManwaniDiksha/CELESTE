import crypto from 'node:crypto';
import { PIN_SESSION_TTL_SECONDS, isProductionRuntime, isVercelRuntime } from '../config/env.js';

export const PIN_SESSION_COOKIE_NAME = 'celeste_staff_session';

const STAFF_SLUG_REGEX = /^[a-z0-9-]+$/;
const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;
const MAX_CLOCK_SKEW_SECONDS = 60;

function signPayload(encodedPayload, sessionSecret) {
  return crypto
    .createHmac('sha256', sessionSecret)
    .update(encodedPayload)
    .digest();
}

export function parseCookieHeader(cookieHeader) {
  const cookies = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return cookies;
  }

  for (const part of cookieHeader.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }

    const name = part.slice(0, eqIndex).trim();
    const rawValue = part.slice(eqIndex + 1).trim();
    if (!name) {
      continue;
    }

    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }

  return cookies;
}

/**
 * Creates an HMAC-SHA256 signed session cookie value with 12-hour expiry.
 */
export function createPinSessionToken({ scope, staffSlug = null, nowSeconds }, sessionSecret) {
  if (!sessionSecret || typeof sessionSecret !== 'string') {
    throw new Error('PIN_SESSION_SECRET is required to sign session cookies.');
  }

  if (scope !== 'reception' && scope !== 'staff') {
    throw new Error('Invalid PIN session scope.');
  }

  if (scope === 'reception' && staffSlug !== null) {
    throw new Error('Reception session must have staffSlug set to null.');
  }

  if (scope === 'staff' && (typeof staffSlug !== 'string' || !STAFF_SLUG_REGEX.test(staffSlug))) {
    throw new Error('Staff session requires a valid staffSlug.');
  }

  const iat = Number.isInteger(nowSeconds) ? nowSeconds : Math.floor(Date.now() / 1000);
  const exp = iat + PIN_SESSION_TTL_SECONDS;
  const payload = {
    scope,
    staffSlug: scope === 'staff' ? staffSlug : null,
    iat,
    exp,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signPayload(encodedPayload, sessionSecret).toString('base64url');
  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies signature, structure, and 12-hour expiry of a PIN session cookie value.
 * Returns the validated payload or null if invalid/expired/tampered.
 */
export function verifyPinSessionToken(token, sessionSecret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!token || typeof token !== 'string' || !sessionSecret || typeof sessionSecret !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, encodedSig] = parts;
  if (!BASE64URL_REGEX.test(encodedPayload) || !BASE64URL_REGEX.test(encodedSig)) {
    return null;
  }

  const expectedSigBuf = signPayload(encodedPayload, sessionSecret);
  let actualSigBuf;
  try {
    actualSigBuf = Buffer.from(encodedSig, 'base64url');
  } catch {
    return null;
  }

  if (actualSigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(actualSigBuf, expectedSigBuf)) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const { scope, staffSlug, iat, exp } = parsed;
  if (scope !== 'reception' && scope !== 'staff') {
    return null;
  }

  if (scope === 'reception' && staffSlug !== null) {
    return null;
  }

  if (scope === 'staff' && (typeof staffSlug !== 'string' || !STAFF_SLUG_REGEX.test(staffSlug))) {
    return null;
  }

  if (!Number.isInteger(iat) || !Number.isInteger(exp)) {
    return null;
  }

  if (exp <= iat || exp - iat > PIN_SESSION_TTL_SECONDS) {
    return null;
  }

  if (iat > nowSeconds + MAX_CLOCK_SKEW_SECONDS || nowSeconds >= exp) {
    return null;
  }

  return { scope, staffSlug, iat, exp };
}

function isLoopbackHttpRequest(req) {
  if (!req || req.secure) {
    return false;
  }

  const forwardedProto = (req?.get?.('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  if (forwardedProto === 'https') {
    return false;
  }

  const rawHost = (req?.get?.('x-forwarded-host') || req?.get?.('host') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();

  if (!rawHost) {
    return false;
  }

  const hostname = rawHost.startsWith('[')
    ? rawHost.slice(0, rawHost.indexOf(']') + 1)
    : rawHost.split(':')[0];

  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function shouldUseSecureCookies(req) {
  const forwardedProto = (req?.get?.('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  if (isVercelRuntime() || req?.secure || forwardedProto === 'https') {
    return true;
  }

  return Boolean(isProductionRuntime() && !isLoopbackHttpRequest(req));
}

export function getPinSessionCookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: shouldUseSecureCookies(req),
    maxAge: PIN_SESSION_TTL_SECONDS * 1000,
  };
}

export function setPinSessionCookie(req, res, sessionInput, sessionSecret) {
  const token = createPinSessionToken(sessionInput, sessionSecret);
  res.cookie(PIN_SESSION_COOKIE_NAME, token, getPinSessionCookieOptions(req));
  return token;
}

export function clearPinSessionCookie(req, res) {
  const { maxAge: _maxAge, ...clearOptions } = getPinSessionCookieOptions(req);
  res.clearCookie(PIN_SESSION_COOKIE_NAME, clearOptions);
}

export function readPinSessionFromRequest(req, sessionSecret) {
  const cookies = parseCookieHeader(req?.headers?.cookie);
  const rawToken = cookies[PIN_SESSION_COOKIE_NAME];
  if (!rawToken) {
    return { present: false, session: null };
  }

  return {
    present: true,
    session: verifyPinSessionToken(rawToken, sessionSecret),
  };
}
