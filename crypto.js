/**
 * Quiz Mais Saúde — Web Crypto module for at-rest encryption of localStorage data.
 *
 * Strategy:
 *   1. Derive a 256-bit AES-GCM key from PIN + birth year via PBKDF2 (100 000 iterations)
 *   2. Encrypt sensitive data with a fresh random IV per write
 *   3. Store ciphertext + IV (base64) under the same localStorage key, prefixed "enc:v1:"
 *   4. The CryptoKey lives only in memory during the user session
 *   5. On logout, the key is dropped — ciphertext remains but is undecryptable
 *
 * Backward compatibility:
 *   secureGet() falls back to plaintext JSON.parse if the value lacks the "enc:v1:" prefix.
 *   The first secureSet() after the update will rewrite the value in encrypted form.
 *   No explicit migration step needed — happens transparently on first save.
 *
 * Threat model — see ARCHITECTURE.md
 */

const ENC_PREFIX = 'enc:v1:';
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 256;          // AES-256

// Session crypto key — set on login, cleared on logout. Never persisted.
let sessionKey = null;

// ============================================================
// Public API
// ============================================================

/**
 * Derive a CryptoKey from PIN + birth year using PBKDF2.
 * Called once at login, after verify_beneficiary returns success.
 *
 * @param {string} pin   — the user's alphanumeric access token (e.g. "AB12345")
 * @param {number|string} year — year of birth
 * @returns {Promise<CryptoKey>}
 */
export async function deriveSessionKey(pin, year) {
  if (!pin || !year) throw new Error('PIN and year required');
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(pin) + ':' + String(year)),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  // Salt is unique per user (derived from PIN) but stable across sessions
  // — this gives us per-user key separation while remaining deterministic
  const salt = enc.encode('quiz-mais-saude-v1-' + String(pin));
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,                           // not extractable — security best practice
    ['encrypt', 'decrypt']
  );
  sessionKey = key;
  return key;
}

/**
 * Encrypt a value and store it in localStorage under `key`.
 * The value is serialized to JSON before encryption.
 *
 * @param {string} key  — localStorage key
 * @param {*} value     — anything JSON-serializable
 */
export async function secureSet(key, value) {
  if (!sessionKey) throw new Error('No session crypto key — call deriveSessionKey first');
  const iv = crypto.getRandomValues(new Uint8Array(12));  // 96-bit IV recommended for GCM
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    enc.encode(JSON.stringify(value))
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  const b64 = bytesToBase64(combined);
  localStorage.setItem(key, ENC_PREFIX + b64);
}

/**
 * Read a value from localStorage and decrypt it.
 * Backward compatible: if the stored value is plaintext JSON (legacy), returns parsed JSON.
 *
 * @param {string} key
 * @returns {Promise<any>} the value, or null if not present
 */
export async function secureGet(key) {
  const stored = localStorage.getItem(key);
  if (stored === null) return null;

  // Backward compatibility — accept legacy plaintext JSON
  if (!stored.startsWith(ENC_PREFIX)) {
    try {
      return JSON.parse(stored);
    } catch {
      return stored;                 // legacy string value
    }
  }

  if (!sessionKey) throw new Error('No session crypto key — call deriveSessionKey first');

  const b64 = stored.slice(ENC_PREFIX.length);
  const combined = base64ToBytes(b64);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      sessionKey,
      ciphertext
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch (err) {
    // Authentication tag failed — wrong key, or tampered ciphertext
    console.error('secureGet decryption failed for', key, err);
    return null;
  }
}

/**
 * Delete a value from localStorage.
 * (No crypto needed, but exported for API symmetry.)
 */
export function secureDelete(key) {
  localStorage.removeItem(key);
}

/**
 * Lock the session: drop the in-memory crypto key.
 * Call this on logout. Ciphertext in localStorage becomes undecryptable.
 */
export function lockSession() {
  sessionKey = null;
}

/**
 * Check if the session is currently unlocked (key derived and in memory).
 */
export function isUnlocked() {
  return sessionKey !== null;
}

/**
 * Migrate plaintext localStorage data to encrypted form.
 * Call this once after deriveSessionKey on first login post-update.
 * Idempotent — safe to call multiple times.
 *
 * @param {string[]} keys — list of localStorage keys to migrate
 */
export async function migrateToEncrypted(keys) {
  if (!sessionKey) throw new Error('No session crypto key');
  let migrated = 0;
  for (const key of keys) {
    const stored = localStorage.getItem(key);
    if (stored === null) continue;
    if (stored.startsWith(ENC_PREFIX)) continue;  // already encrypted
    try {
      const value = JSON.parse(stored);
      await secureSet(key, value);
      migrated++;
    } catch (e) {
      // Not valid JSON — wrap as string
      try {
        await secureSet(key, stored);
        migrated++;
      } catch (e2) {
        console.warn('Could not migrate key', key, e2);
      }
    }
  }
  return migrated;
}

// ============================================================
// Internal helpers
// ============================================================

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
