export function formatDateTime(iso: string | null, timezone: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}d ago`;
}

export function lastSeenLabel(lastContactAt: string | null): {
  label: string;
  tone: "ok" | "warning" | "unknown";
} {
  if (!lastContactAt) return { label: "Status unknown", tone: "unknown" };
  const diffMs = Date.now() - new Date(lastContactAt).getTime();
  if (diffMs < 20 * 60 * 1000) return { label: `Recently seen (${formatRelative(lastContactAt)})`, tone: "ok" };
  return { label: `Last seen ${formatRelative(lastContactAt)}`, tone: "warning" };
}
