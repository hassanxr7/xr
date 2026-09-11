"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type OverviewData } from "@/lib/api";
import { useOwner } from "@/lib/owner-context";
import { useLiveEventsSubscription } from "@/lib/live-events-context";
import { Card, EmptyState, Spinner, StatTile, Badge } from "@/components/ui";
import { formatRelative, lastSeenLabel } from "@/lib/format";

export default function OverviewPage() {
  const { owner } = useOwner();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await api.get<OverviewData>("/api/overview");
    setData(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates: any created/updated/deleted message or device change can
  // shift these counts, so just refetch the lightweight overview endpoint
  // rather than trying to reason about every counter delta client-side.
  useLiveEventsSubscription({
    onMessageCreated: () => void load(),
    onMessageUpdated: () => void load(),
    onMessageDeleted: () => void load(),
    onDeviceUpdated: () => void load(),
    onReconcile: (messages) => {
      if (messages.length > 0) void load();
    },
  });

  if (loading || !data) return <Spinner />;

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-xl font-semibold">Overview</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Total messages" value={data.totalMessages.toLocaleString()} />
        <StatTile label="Today" value={data.todayMessages.toLocaleString()} />
        <StatTile label="Unread" value={data.unreadMessages.toLocaleString()} />
        <StatTile label="Paired devices" value={data.pairedDeviceCount} />
      </div>

      {data.syncWarnings.length > 0 && (
        <Card>
          <h2 className="text-sm font-medium mb-2">Sync warnings</h2>
          <ul className="space-y-2">
            {data.syncWarnings.map((w) => (
              <li key={w.deviceId} className="flex items-center justify-between text-sm">
                <span>{w.name}</span>
                <Badge tone="warning">
                  {w.reason === "paused" ? "Sync paused" : `No contact — ${lastSeenLabel(w.lastContactAt).label}`}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium">Recent messages</h2>
          <Link href="/inbox" className="text-xs" style={{ color: "var(--color-accent)" }}>
            View inbox →
          </Link>
        </div>
        {data.recentMessages.length === 0 ? (
          <EmptyState title="No messages yet" hint="Pair a device to start receiving SMS." />
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {data.recentMessages.map((m) => (
              <li key={m.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {!m.isRead && (
                      <span
                        style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-unread-dot)", display: "inline-block" }}
                      />
                    )}
                    <span className="text-sm font-medium">{m.sender}</span>
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {m.deviceName}
                    </span>
                  </div>
                  <p className="text-sm truncate" style={{ color: "var(--color-text-muted)", maxWidth: 480 }}>
                    {m.preview}
                  </p>
                </div>
                <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
                  {formatRelative(m.receivedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        Timezone: {owner?.timezone}
      </p>
    </div>
  );
}
