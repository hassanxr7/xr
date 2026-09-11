"use client";

import { useEffect, useState } from "react";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border p-4 ${className}`}
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", boxShadow: "var(--shadow-card)" }}
    >
      {children}
    </div>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <div className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
          {sub}
        </div>
      )}
    </Card>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
}) {
  const map: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: "var(--color-bg)", fg: "var(--color-text-muted)" },
    success: { bg: "var(--color-success-bg)", fg: "var(--color-success)" },
    warning: { bg: "var(--color-warning-bg)", fg: "var(--color-warning)" },
    danger: { bg: "var(--color-danger-bg)", fg: "var(--color-danger)" },
    accent: { bg: "var(--color-accent)", fg: "var(--color-accent-contrast)" },
  };
  const c = map[tone];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-sm font-medium">{title}</p>
      {hint && (
        <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div
        className="animate-spin rounded-full h-6 w-6 border-2 border-t-transparent"
        style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
      />
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border p-5"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm mt-2" style={{ color: "var(--color-text-muted)" }}>
          {description}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-md text-sm border" style={{ borderColor: "var(--color-border)" }}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-md text-sm font-medium"
            style={{
              background: danger ? "var(--color-danger)" : "var(--color-accent)",
              color: "var(--color-accent-contrast)",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(t);
  }, [message]);
  return { message, show: setMessage };
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="fixed bottom-4 right-4 z-50 rounded-md px-4 py-2 text-sm shadow-lg"
      style={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-border)" }}
    >
      {message}
    </div>
  );
}
