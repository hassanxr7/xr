"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, buildQuery, type DeviceView, type MessageView } from "@/lib/api";
import { useOwner } from "@/lib/owner-context";
import { useLiveEventsSubscription } from "@/lib/live-events-context";
import { Badge, Card, ConfirmDialog, EmptyState, Spinner, Toast, useToast } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

type ArchivedFilter = "active" | "archived" | "all";

interface Filters {
  deviceId?: string;
  simSlotId?: string;
  q?: string;
  isRead?: boolean;
  archived: ArchivedFilter;
  dateFrom?: string;
  dateTo?: string;
}

const DEFAULT_FILTERS: Filters = { archived: "active" };

function isArchivedParam(archived: ArchivedFilter): boolean | undefined {
  if (archived === "active") return false;
  if (archived === "archived") return true;
  return undefined;
}

function matchesFilters(m: MessageView, f: Filters): boolean {
  if (f.deviceId && m.deviceId !== f.deviceId) return false;
  if (f.simSlotId && m.simSlotId !== f.simSlotId) return false;
  if (f.isRead !== undefined && m.isRead !== f.isRead) return false;
  const archivedParam = isArchivedParam(f.archived);
  if (archivedParam !== undefined && m.isArchived !== archivedParam) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!m.sender.toLowerCase().includes(q) && !m.body.toLowerCase().includes(q)) return false;
  }
  if (f.dateFrom && new Date(m.receivedAt) < new Date(f.dateFrom)) return false;
  if (f.dateTo && new Date(m.receivedAt) > new Date(f.dateTo)) return false;
  return true;
}

export default function InboxPage() {
  const { owner } = useOwner();
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<MessageView | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MessageView | null>(null);
  const [newAvailable, setNewAvailable] = useState(0);
  const hasPagedRef = useRef(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const { message: toast, show: showToast } = useToast();

  useEffect(() => {
    api.get<{ devices: DeviceView[] }>("/api/devices").then((res) => setDevices(res.devices));
  }, []);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    hasPagedRef.current = false;
    setNewAvailable(0);
    const res = await api.get<{ messages: MessageView[]; nextCursor: string | null }>(
      `/api/messages${buildQuery({
        deviceId: f.deviceId,
        simSlotId: f.simSlotId,
        q: f.q,
        isRead: f.isRead,
        isArchived: isArchivedParam(f.archived),
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
        limit: 50,
      })}`,
    );
    setMessages(res.messages);
    setNextCursor(res.nextCursor);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  // Debounce free-text search.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, q: searchInput || undefined }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function loadMore() {
    if (!nextCursor) return;
    hasPagedRef.current = true;
    setLoadingMore(true);
    const f = filters;
    const res = await api.get<{ messages: MessageView[]; nextCursor: string | null }>(
      `/api/messages${buildQuery({
        deviceId: f.deviceId,
        simSlotId: f.simSlotId,
        q: f.q,
        isRead: f.isRead,
        isArchived: isArchivedParam(f.archived),
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
        cursor: nextCursor,
        limit: 50,
      })}`,
    );
    setMessages((prev) => [...prev, ...res.messages]);
    setNextCursor(res.nextCursor);
    setLoadingMore(false);
  }

  useLiveEventsSubscription({
    onMessageCreated: (m) => {
      if (!matchesFilters(m, filtersRef.current)) return;
      if (hasPagedRef.current) {
        setNewAvailable((n) => n + 1);
        return;
      }
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
    },
    onMessageUpdated: (m) => {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      setSelected((sel) => (sel?.id === m.id ? m : sel));
    },
    onMessageDeleted: (id) => {
      setMessages((prev) => prev.filter((x) => x.id !== id));
      setSelected((sel) => (sel?.id === id ? null : sel));
    },
    onReconcile: (msgs) => {
      const relevant = msgs.filter((m) => matchesFilters(m, filtersRef.current));
      if (relevant.length === 0) return;
      if (hasPagedRef.current) {
        setNewAvailable((n) => n + relevant.length);
        return;
      }
      setMessages((prev) => {
        const byId = new Map(prev.map((x) => [x.id, x]));
        for (const m of relevant) byId.set(m.id, m);
        return Array.from(byId.values()).sort(
          (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
        );
      });
    },
  });

  const simSlots = useMemo(() => {
    const device = devices.find((d) => d.id === filters.deviceId);
    return device ? device.simSlots : devices.flatMap((d) => d.simSlots);
  }, [devices, filters.deviceId]);

  async function toggleRead(m: MessageView) {
    const updated = await api.patch<MessageView>(`/api/messages/${m.id}`, { isRead: !m.isRead });
    setMessages((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
    setSelected((sel) => (sel?.id === m.id ? updated : sel));
  }

  async function toggleArchive(m: MessageView) {
    const updated = await api.patch<MessageView>(`/api/messages/${m.id}`, { isArchived: !m.isArchived });
    setMessages((prev) => prev.filter((x) => x.id !== m.id || filters.archived === "all"));
    setSelected((sel) => (sel?.id === m.id ? updated : sel));
    showToast(updated.isArchived ? "Archived" : "Unarchived");
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await api.delete(`/api/messages/${pendingDelete.id}`);
      setMessages((prev) => prev.filter((x) => x.id !== pendingDelete.id));
      setSelected((sel) => (sel?.id === pendingDelete.id ? null : sel));
      showToast("Message deleted from the server.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Delete failed.");
    } finally {
      setPendingDelete(null);
    }
  }

  function copyText(text: string) {
    navigator.clipboard?.writeText(text).then(() => showToast("Copied."));
  }

  const exportHref = `/api/messages/export${buildQuery({
    deviceId: filters.deviceId,
    simSlotId: filters.simSlotId,
    q: filters.q,
    isRead: filters.isRead,
    isArchived: isArchivedParam(filters.archived),
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <a
          href={exportHref}
          className="text-sm px-3 py-1.5 rounded-md border"
          style={{ borderColor: "var(--color-border)" }}
        >
          Export CSV
        </a>
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <input
            placeholder="Search sender or message text…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1 min-w-[180px] rounded-md border px-3 py-1.5 text-sm outline-none"
            style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
          />
          <select
            value={filters.deviceId ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, deviceId: e.target.value || undefined, simSlotId: undefined }))}
            className="rounded-md border px-2 py-1.5 text-sm"
            style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
          >
            <option value="">All devices</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={filters.simSlotId ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, simSlotId: e.target.value || undefined }))}
            className="rounded-md border px-2 py-1.5 text-sm"
            style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
          >
            <option value="">All SIMs</option>
            {simSlots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label ?? `Slot ${s.slotIndex}`}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            value={filters.dateFrom ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
            className="rounded-md border px-2 py-1.5 text-sm"
            style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
          />
          <input
            type="datetime-local"
            value={filters.dateTo ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
            className="rounded-md border px-2 py-1.5 text-sm"
            style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["active", "archived", "all"] as ArchivedFilter[]).map((a) => (
            <button
              key={a}
              onClick={() => setFilters((f) => ({ ...f, archived: a }))}
              className="px-2.5 py-1 rounded-full text-xs capitalize"
              style={{
                background: filters.archived === a ? "var(--color-accent)" : "var(--color-bg)",
                color: filters.archived === a ? "var(--color-accent-contrast)" : "var(--color-text-muted)",
              }}
            >
              {a}
            </button>
          ))}
          <span className="w-px" style={{ background: "var(--color-border)" }} />
          {[
            { label: "All", value: undefined },
            { label: "Unread", value: true },
            { label: "Read", value: false },
          ].map((opt) => (
            <button
              key={opt.label}
              onClick={() => setFilters((f) => ({ ...f, isRead: opt.value }))}
              className="px-2.5 py-1 rounded-full text-xs"
              style={{
                background: filters.isRead === opt.value ? "var(--color-accent)" : "var(--color-bg)",
                color: filters.isRead === opt.value ? "var(--color-accent-contrast)" : "var(--color-text-muted)",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Card>

      {newAvailable > 0 && (
        <button
          onClick={() => void load(filters)}
          className="w-full text-sm rounded-md py-2 border"
          style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
        >
          {newAvailable} new message{newAvailable > 1 ? "s" : ""} — click to refresh
        </button>
      )}

      <div className="grid md:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <Card className="p-0 overflow-hidden">
          {loading ? (
            <Spinner />
          ) : messages.length === 0 ? (
            <EmptyState title="No messages match these filters" />
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {messages.map((m) => (
                <li
                  key={m.id}
                  onClick={() => setSelected(m)}
                  className="px-4 py-3 cursor-pointer flex items-start gap-3"
                  style={{ background: selected?.id === m.id ? "var(--color-bg)" : "transparent" }}
                >
                  {!m.isRead ? (
                    <span
                      style={{ width: 6, height: 6, marginTop: 6, borderRadius: "50%", background: "var(--color-unread-dot)", flexShrink: 0 }}
                    />
                  ) : (
                    <span style={{ width: 6, flexShrink: 0 }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{m.sender}</span>
                      <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
                        {formatDateTime(m.receivedAt, owner?.timezone ?? "UTC")}
                      </span>
                    </div>
                    <p className="text-sm truncate" style={{ color: "var(--color-text-muted)" }}>
                      {m.body}
                    </p>
                    <div className="flex gap-1.5 mt-1">
                      <Badge>{devices.find((d) => d.id === m.deviceId)?.name ?? m.deviceId.slice(0, 8)}</Badge>
                      {m.simLabel && <Badge>{m.simLabel}</Badge>}
                      {m.sourceCategory !== "LIVE" && <Badge tone="accent">{m.sourceCategory}</Badge>}
                      {m.isArchived && <Badge tone="warning">Archived</Badge>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {nextCursor && (
            <div className="p-3 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-sm px-3 py-1.5 rounded-md border"
                style={{ borderColor: "var(--color-border)" }}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </Card>

        <Card className="h-fit sticky top-4">
          {!selected ? (
            <EmptyState title="Select a message" hint="Its full text and timestamps will appear here." />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">{selected.sender}</h2>
                <button onClick={() => copyText(selected.sender)} className="text-xs underline" style={{ color: "var(--color-text-muted)" }}>
                  Copy sender
                </button>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">{selected.body}</p>
              <button onClick={() => copyText(selected.body)} className="text-xs underline" style={{ color: "var(--color-text-muted)" }}>
                Copy message
              </button>
              <dl className="text-xs space-y-1 pt-2 border-t" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
                <div className="flex justify-between">
                  <dt>Device</dt>
                  <dd>{devices.find((d) => d.id === selected.deviceId)?.name ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>SIM</dt>
                  <dd>{selected.simLabel ?? "Unknown"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Captured on phone</dt>
                  <dd>{formatDateTime(selected.observedAt, owner?.timezone ?? "UTC")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Stored on server</dt>
                  <dd>{formatDateTime(selected.receivedAt, owner?.timezone ?? "UTC")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Source</dt>
                  <dd>{selected.sourceCategory}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2 pt-2">
                <button onClick={() => void toggleRead(selected)} className="text-xs px-2.5 py-1 rounded-md border" style={{ borderColor: "var(--color-border)" }}>
                  Mark {selected.isRead ? "unread" : "read"}
                </button>
                <button onClick={() => void toggleArchive(selected)} className="text-xs px-2.5 py-1 rounded-md border" style={{ borderColor: "var(--color-border)" }}>
                  {selected.isArchived ? "Unarchive" : "Archive"}
                </button>
                <button
                  onClick={() => setPendingDelete(selected)}
                  className="text-xs px-2.5 py-1 rounded-md border"
                  style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this message?"
        description="This removes the server copy for every dashboard view and export. It does not touch the SMS app on the phone. If a historical import later covers the same date range on the same device, this exact message can reappear."
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      <Toast message={toast} />
    </div>
  );
}
