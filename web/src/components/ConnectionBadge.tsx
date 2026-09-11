"use client";

import { useLiveEventsStatus } from "@/lib/live-events-context";

const CONFIG: Record<string, { label: string; color: string; pulse?: boolean }> = {
  open: { label: "Live", color: "var(--color-success)" },
  connecting: { label: "Connecting…", color: "var(--color-warning)", pulse: true },
  reconnecting: { label: "Reconnecting…", color: "var(--color-warning)", pulse: true },
  closed: { label: "Disconnected", color: "var(--color-danger)" },
};

export function ConnectionBadge() {
  const status = useLiveEventsStatus();
  const cfg = CONFIG[status];
  return (
    <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
      <span
        className={cfg.pulse ? "animate-pulse" : ""}
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: cfg.color,
        }}
      />
      {cfg.label}
    </div>
  );
}
