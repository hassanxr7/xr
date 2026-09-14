import { createHash, randomBytes } from "crypto";

// Opaque bearer/session/pairing secrets are random and never reused; only their
// SHA-256 hash is persisted, so a database leak alone can't be replayed as a login.
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// Pairing codes are short and human-typeable (QR scanning covers the common
// case), so they use a restricted alphabet without ambiguous characters.
const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePairingCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PAIRING_ALPHABET[bytes[i] % PAIRING_ALPHABET.length];
  }
  return out;
}
