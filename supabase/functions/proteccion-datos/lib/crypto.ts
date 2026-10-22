/**
 * Cifrado de datos personales para Edge Functions (Deno / Web Crypto).
 * Ley N° 21.719 — deber de seguridad.
 *
 * Envelope encryption:
 *   - DEK aleatoria por dato, cifra el valor con AES-256-GCM.
 *   - La DEK se envuelve (cifra) con la KEK maestra (secreto del proyecto).
 *   - En la base se guarda solo el sobre {v, edek, data}. Sin la KEK es inútil.
 *
 * Búsqueda sin descifrar: índice ciego = HMAC-SHA256(valor normalizado, BLIND_KEY).
 *
 * Claves (secretos de Supabase, base64 de 32 bytes):
 *   PD_KEK_MASTER_KEY, PD_BLIND_INDEX_KEY
 *   Generá cada una con:  openssl rand -base64 32
 */

export interface Envelope {
  v: number;
  edek: string; // base64(iv | ciphertext+tag) de la DEK cifrada con la KEK
  data: string; // base64(iv | ciphertext+tag) del dato cifrado con la DEK
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64encode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function requireKeyBytes(name: string): Uint8Array {
  const raw = Deno.env.get(name);
  if (!raw) throw new Error(`Falta el secreto ${name} (openssl rand -base64 32)`);
  const bytes = b64decode(raw);
  if (bytes.length !== 32) throw new Error(`${name} debe ser 32 bytes en base64`);
  return bytes;
}

async function importAes(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function aesEncrypt(key: CryptoKey, plaintext: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return b64encode(packed);
}

async function aesDecrypt(key: CryptoKey, packedB64: string): Promise<Uint8Array> {
  const packed = b64decode(packedB64);
  const iv = packed.subarray(0, 12);
  const ct = packed.subarray(12);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
}

const KEK_VERSION = Number(Deno.env.get('PD_KEK_ACTIVE_VERSION') ?? '1');

/** Cifra un valor y devuelve el sobre a guardar como JSONB. */
export async function encrypt(value: string): Promise<Envelope> {
  const kek = await importAes(requireKeyBytes('PD_KEK_MASTER_KEY'));
  const dekBytes = crypto.getRandomValues(new Uint8Array(32));
  const dek = await importAes(dekBytes);
  const data = await aesEncrypt(dek, enc.encode(value));
  const edek = await aesEncrypt(kek, dekBytes);
  dekBytes.fill(0);
  return { v: KEK_VERSION, edek, data };
}

/** Descifra un sobre y devuelve el valor original. */
export async function decrypt(envlp: Envelope | null | undefined): Promise<string | null> {
  if (!envlp) return null;
  const kek = await importAes(requireKeyBytes('PD_KEK_MASTER_KEY'));
  const dekBytes = await aesDecrypt(kek, envlp.edek);
  const dek = await importAes(dekBytes);
  const plain = await aesDecrypt(dek, envlp.data);
  dekBytes.fill(0);
  return dec.decode(plain);
}

/** Índice ciego determinista para búsqueda por igualdad sin descifrar. */
export async function blindIndex(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', requireKeyBytes('PD_BLIND_INDEX_KEY'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value.trim().toLowerCase()));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hash SHA-256 hex (para huellas de textos de consentimiento, tokens). */
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
