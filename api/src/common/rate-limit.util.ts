// Centralized, env-overridable request limits for the two unauthenticated
// endpoints that must resist guessing (login, pairing-code redemption).
// Defaults are tuned for real usage; tests raise them via .env.test so
// sequential e2e runs against one shared in-memory throttler don't trip on
// their own login calls.
export function loginRateLimit(): number {
  return Number(process.env.LOGIN_RATE_LIMIT ?? 5);
}

export function pairRateLimit(): number {
  return Number(process.env.PAIR_RATE_LIMIT ?? 10);
}
