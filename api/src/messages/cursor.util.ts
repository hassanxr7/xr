// Opaque keyset-pagination cursor: (receivedAt, id). Keyset pagination (vs.
// OFFSET/LIMIT) stays fast at 100k+ rows because it always seeks from an
// index position instead of counting/skipping rows.
export interface Cursor {
  receivedAt: string;
  id: string;
}

export function encodeCursor(receivedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ receivedAt: receivedAt.toISOString(), id })).toString(
    "base64url",
  );
}

export function decodeCursor(raw: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed.receivedAt !== "string" || typeof parsed.id !== "string") {
      throw new Error("malformed");
    }
    return parsed;
  } catch {
    throw new Error("Invalid cursor.");
  }
}
