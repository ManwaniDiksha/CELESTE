import crypto from 'node:crypto';

export const SCRYPT_SALT_BYTES = 16; // 32 hex chars
export const SCRYPT_KEY_LENGTH = 64; // 128 hex chars
export const SCRYPT_OPTIONS = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
});

export const PIN_HASH_REGEX = /^scrypt:([0-9a-f]{32}):([0-9a-f]{128})$/i;
export const MAX_PIN_LENGTH = 64;

function scryptAsync(pin, salt, keyLength, options) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pin, salt, keyLength, options, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });
}

/**
 * Returns true if the stored hash matches scrypt:<32-hex>:<128-hex>.
 */
export function isValidPinHashFormat(storedHash) {
  return typeof storedHash === 'string' && PIN_HASH_REGEX.test(storedHash.trim());
}

/**
 * Hashes a plaintext PIN using crypto.scrypt and a 16-byte random salt.
 * Format: scrypt:<32-character-hex-salt>:<128-character-hex-hash>
 */
export async function hashPin(pin) {
  if (typeof pin !== 'string' || pin.trim().length === 0 || pin.length > MAX_PIN_LENGTH) {
    throw new Error(`PIN must be a non-empty string of at most ${MAX_PIN_LENGTH} characters.`);
  }

  const saltHex = crypto.randomBytes(SCRYPT_SALT_BYTES).toString('hex');
  const derivedKey = await scryptAsync(pin, saltHex, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt:${saltHex}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a candidate PIN against a stored scrypt hash using timingSafeEqual.
 */
export async function verifyPin(pin, storedHash) {
  if (typeof pin !== 'string' || pin.trim().length === 0 || pin.length > MAX_PIN_LENGTH) {
    return false;
  }

  if (typeof storedHash !== 'string') {
    return false;
  }

  const match = PIN_HASH_REGEX.exec(storedHash.trim());
  if (!match) {
    return false;
  }

  const saltHex = match[1].toLowerCase();
  const expectedHex = match[2].toLowerCase();
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const derivedKey = await scryptAsync(pin, saltHex, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);

  if (derivedKey.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedKey, expectedBuf);
}
