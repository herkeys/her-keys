const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function tokenKey(): Promise<CryptoKey> {
  const encoded = Deno.env.get('EXTERNAL_TOKEN_ENCRYPTION_KEY_B64');
  if (!encoded) throw new Error('EXTERNAL_TOKEN_ENCRYPTION_KEY_B64 is unavailable');
  const raw = bytesFromBase64(encoded);
  if (raw.byteLength !== 32) throw new Error('EXTERNAL_TOKEN_ENCRYPTION_KEY_B64 must decode to exactly 32 bytes');
  return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(value: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(), encoder.encode(value));
  return { ciphertext: base64FromBytes(new Uint8Array(encrypted)), iv: base64FromBytes(iv) };
}

export async function decryptSecret(ciphertext: string, iv: string): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytesFromBase64(iv) },
    await tokenKey(),
    bytesFromBase64(ciphertext),
  );
  return decoder.decode(plain);
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return base64FromBytes(digest).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function randomUrlSafe(bytes = 32): string {
  return base64FromBytes(crypto.getRandomValues(new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
