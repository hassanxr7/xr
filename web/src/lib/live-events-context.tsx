"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api, type MessageView } from "./api";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface LiveEventHandlers {
  onMessageCreated?: (message: MessageView) => void;
  onMessageUpdated?: (message: MessageView) => void;
  onMessageDeleted?: (id: string) => void;
  onDeviceUpdated?: (device: { id: string } & Record<string, unknown>) => void;
  // Fired with every message a reconciliation pass turns up, on first
  // connect and after every reconnect. This is the actual source of truth:
  // SSE events are a convenience push only, so a dropped connection or a
  // missed event can never permanently hide a stored message.
  onReconcile?: (messages: MessageView[]) => void;
}

const CURSOR_STORAGE_KEY = "smsbridge.sync.cursor";

interface LiveEventsContextValue {
  status: ConnectionStatus;
  subscribe: (handlers: LiveEventHandlers) => () => void;
}

const LiveEventsContext = createContext<LiveEventsContextValue | null>(null);

export function LiveEventsProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const subscribersRef = useRef<Set<LiveEventHandlers>>(new Set());
  const cursorRef = useRef<string | null>(
    typeof window !== "undefined" ? window.localStorage.getItem(CURSOR_STORAGE_KEY) : null,
  );
  const hasConnectedBeforeRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;

    function persistCursor(cursor: string | null) {
      cursorRef.current = cursor;
      if (cursor && typeof window !== "undefined") {
        window.localStorage.setItem(CURSOR_STORAGE_KEY, cursor);
      }
    }

    async function reconcile() {
      try {
        for (;;) {
          const qs = cursorRef.current
            ? `?cursor=${encodeURIComponent(cursorRef.current)}&limit=200`
            : "?limit=200";
          const page = await api.get<{ messages: MessageView[]; nextCursor: string | null }>(
            `/api/messages/sync${qs}`,
          );
          if (page.messages.length > 0) {
            for (const sub of subscribersRef.current) sub.onReconcile?.(page.messages);
          }
          if (!page.nextCursor || page.nextCursor === cursorRef.current || page.messages.length === 0) {
            if (page.nextCursor) persistCursor(page.nextCursor);
            break;
          }
          persistCursor(page.nextCursor);
        }
      } catch {
        // Retried on the next reconnect/backoff cycle.
      }
    }

    function connect() {
      if (cancelled) return;
      setStatus(hasConnectedBeforeRef.current ? "reconnecting" : "connecting");
      source = new EventSource("/api/events");

      source.addEventListener("open", () => {
        setStatus("open");
        retryDelay = 1000;
        void reconcile();
        hasConnectedBeforeRef.current = true;
      });

      source.addEventListener("message.created", (e: MessageEvent) => {
        const message = JSON.parse(e.data) as MessageView;
        for (const sub of subscribersRef.current) sub.onMessageCreated?.(message);
      });
      source.addEventListener("message.updated", (e: MessageEvent) => {
        const message = JSON.parse(e.data) as MessageView;
        for (const sub of subscribersRef.current) sub.onMessageUpdated?.(message);
      });
      source.addEventListener("message.deleted", (e: MessageEvent) => {
        const { id } = JSON.parse(e.data) as { id: string };
        for (const sub of subscribersRef.current) sub.onMessageDeleted?.(id);
      });
      source.addEventListener("device.updated", (e: MessageEvent) => {
        const device = JSON.parse(e.data);
        for (const sub of subscribersRef.current) sub.onDeviceUpdated?.(device);
      });

      source.onerror = () => {
        source?.close();
        setStatus("reconnecting");
        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 1.7, 20_000);
          connect();
        }, retryDelay);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, []);

  function subscribe(handlers: LiveEventHandlers) {
    subscribersRef.current.add(handlers);
    return () => {
      subscribersRef.current.delete(handlers);
    };
  }

  return <LiveEventsContext.Provider value={{ status, subscribe }}>{children}</LiveEventsContext.Provider>;
}

export function useLiveEventsStatus(): ConnectionStatus {
  const ctx = useContext(LiveEventsContext);
  if (!ctx) throw new Error("useLiveEventsStatus must be used within LiveEventsProvider");
  return ctx.status;
}

export function useLiveEventsSubscription(handlers: LiveEventHandlers) {
  const ctx = useContext(LiveEventsContext);
  if (!ctx) throw new Error("useLiveEventsSubscription must be used within LiveEventsProvider");
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    // Stable wrapper so re-renders of the calling component (new handler
    // closures each render) don't churn the subscriber set.
    const stable: LiveEventHandlers = {
      onMessageCreated: (m) => handlersRef.current.onMessageCreated?.(m),
      onMessageUpdated: (m) => handlersRef.current.onMessageUpdated?.(m),
      onMessageDeleted: (id) => handlersRef.current.onMessageDeleted?.(id),
      onDeviceUpdated: (d) => handlersRef.current.onDeviceUpdated?.(d),
      onReconcile: (m) => handlersRef.current.onReconcile?.(m),
    };
    return ctx.subscribe(stable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
