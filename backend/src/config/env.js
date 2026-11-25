export const DEFAULT_LOCAL_PORT = 5187;
export const PIN_SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours
export const MIN_PIN_SESSION_SECRET_LENGTH = 32;

const PIN_HASH_FORMAT_REGEX = /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/i;

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(origin.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isVercelRuntime() {
  return Boolean(process.env.VERCEL);
}

export function isProductionRuntime() {
  return Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');
}

/**
 * Resolves the local Express port. Defaults to 5187 when PORT is unset.
 * Throws a clear error if PORT is malformed. Never used on Vercel serverless.
 */
export function getLocalServerPort() {
  const rawPort = (process.env.PORT || '').trim();
  if (!rawPort) {
    return DEFAULT_LOCAL_PORT;
  }

  if (!/^\d+$/.test(rawPort)) {
    throw new Error(`Invalid PORT environment variable "${rawPort}". Expected an integer between 1 and 65535.`);
  }

  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT environment variable "${rawPort}". Expected an integer between 1 and 65535.`);
  }

  return parsed;
}

/**
 * Returns the explicit list of allowed cross-origin frontend URLs.
 */
export function getAllowedCorsOrigins() {
  const configuredOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);

  const defaultLocalOrigins = isProductionRuntime()
    ? []
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  return new Set([...defaultLocalOrigins, ...configuredOrigins]);
}

export function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY || '').trim();
  return { url, secretKey };
}

export function isSupabaseConfigured() {
  const { url, secretKey } = getSupabaseConfig();
  return Boolean(url && secretKey);
}

export function getPinAuthConfig() {
  const pinHash = (process.env.RECEPTION_STAFF_PIN_HASH || '').trim();
  const sessionSecret = (process.env.PIN_SESSION_SECRET || '').trim();
  return { pinHash, sessionSecret };
}

export function getCronSecret() {
  return (process.env.CRON_SECRET || '').trim();
}

/**
 * Returns explicit Demo Access configuration.
 * Disabled by default and ALWAYS disabled in production (VERCEL or NODE_ENV=production).
 */
export function getDemoConfig() {
  const enabled =
    !isProductionRuntime() &&
    (process.env.DEMO_ACCESS_ENABLED || '').trim().toLowerCase() === 'true';
  const configuredSalonPin = (process.env.RECEPTION_STAFF_PIN || '').trim();
  const demoPin = configuredSalonPin || (process.env.DEMO_RECEPTION_STAFF_PIN || '').trim();
  const demoPinHash = (process.env.DEMO_RECEPTION_STAFF_PIN_HASH || '').trim();
  const demoOwnerEmail = (process.env.DEMO_OWNER_EMAIL || '').trim();
  const demoOwnerPassword = process.env.DEMO_OWNER_PASSWORD || '';
  return {
    enabled,
    demoPin,
    demoPinHash,
    demoOwnerEmail,
    demoOwnerPassword,
    hasPinDemo: Boolean(enabled && demoPin && (configuredSalonPin || PIN_HASH_FORMAT_REGEX.test(demoPinHash))),
    hasOwnerDemo: Boolean(enabled && demoOwnerEmail && demoOwnerPassword),
  };
}

export function isTrustProxyEnabled() {
  return isVercelRuntime() || (process.env.TRUST_PROXY || '').trim().toLowerCase() === 'true';
}

/**
 * Validates environment variables at startup without printing any secret values.
 * Throws immediately when a configured variable has an invalid format.
 * Logs missing required variable names clearly (or throws when strict=true).
 */
export function validateStartupEnv({ strict = false, logger = console } = {}) {
  if (!isVercelRuntime()) {
    getLocalServerPort();
  }

  const { url: supabaseUrl, secretKey: supabaseSecretKey } = getSupabaseConfig();
  if (supabaseUrl && !isValidHttpUrl(supabaseUrl)) {
    throw new Error('Invalid SUPABASE_URL format. Expected a valid http:// or https:// URL.');
  }

  const rawCors = (process.env.CORS_ORIGIN || '').trim();
  if (rawCors) {
    for (const entry of rawCors.split(',')) {
      const trimmed = entry.trim();
      if (trimmed && !normalizeOrigin(trimmed)) {
        throw new Error(`Invalid CORS_ORIGIN entry "${trimmed}". Expected an http:// or https:// origin.`);
      }
    }
  }

  const { pinHash, sessionSecret } = getPinAuthConfig();
  if (pinHash && !PIN_HASH_FORMAT_REGEX.test(pinHash)) {
    throw new Error(
      'Invalid RECEPTION_STAFF_PIN_HASH format. Expected scrypt:<32-char-hex-salt>:<128-char-hex-hash>.'
    );
  }

  if (sessionSecret && sessionSecret.length < MIN_PIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      `PIN_SESSION_SECRET must be at least ${MIN_PIN_SESSION_SECRET_LENGTH} characters long.`
    );
  }

  const cronSecret = getCronSecret();
  const missing = [];
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseSecretKey) missing.push('SUPABASE_SECRET_KEY');
  if (!pinHash) missing.push('RECEPTION_STAFF_PIN_HASH');
  if (!sessionSecret) missing.push('PIN_SESSION_SECRET');
  if (!cronSecret) missing.push('CRON_SECRET');

  if (missing.length > 0) {
    const message = `Missing required backend environment variable(s): ${missing.join(', ')}.`;
    if (strict) {
      throw new Error(message);
    }
    if (logger && typeof logger.warn === 'function') {
      logger.warn(`[CELESTE env] ${message}`);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    isVercel: isVercelRuntime(),
    isProduction: isProductionRuntime(),
  };
}
