"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, type Owner } from "@/lib/api";
import { useOwner } from "@/lib/owner-context";
import { BRAND_NAME } from "@/lib/branding";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { setOwner } = useOwner();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ owner: Owner }>("/api/auth/login", { email, password });
      setOwner(res.owner);
      router.replace("/overview");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>
            {BRAND_NAME}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Sign in to your dashboard
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border p-6 space-y-4"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", boxShadow: "var(--shadow-card)" }}
        >
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ background: "var(--color-bg)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ background: "var(--color-bg)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
            />
          </div>
          {error && (
            <p className="text-sm rounded-md px-3 py-2" style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md py-2 text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs" style={{ color: "var(--color-text-muted)" }}>
          Public registration is disabled. Lost access? See the operator guide for
          the account-recovery command.
        </p>
      </div>
    </div>
  );
}
