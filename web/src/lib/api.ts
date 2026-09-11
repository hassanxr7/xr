"use client";

// Thin fetch wrapper for the SMSBridge API. All calls are same-origin
// relative paths (proxied to the API in dev, reverse-proxied by Caddy in
// prod), so the browser attaches the session cookie automatically; we only
// need to read the CSRF cookie and echo it back on mutating requests.

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (MUTATING.has(method)) {
    const csrf = readCookie("csrf_token");
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  const res = await fetch(path, { ...init, method, headers, credentials: "include" });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => undefined) : undefined;

  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(res.status, err?.code ?? "unknown", err?.message ?? res.statusText, err?.details);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PUT", body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// --- Domain types, mirroring the API's response shapes exactly. ---

export interface Owner {
  id: string;
  email: string;
  timezone: string;
  theme: "light" | "dark" | "system";
  notificationSound: boolean;
  retentionDays: number | null;
}

export interface SimSlotView {
  id: string;
  slotIndex: number;
  subscriptionId: string | null;
  label: string | null;
  phoneNumber: string | null;
  isManual: boolean;
}

export interface DevicePermissions {
  receiveSms?: boolean;
  readSms?: boolean;
  notificationsEnabled?: boolean;
}

export interface DeviceView {
  id: string;
  name: string;
  model: string | null;
  androidVersion: string | null;
  appVersion: string | null;
  status: "ACTIVE" | "REVOKED";
  createdAt: string;
  lastContactAt: string | null;
  lastSyncAt: string | null;
  lastQueueSize: number | null;
  permissions: DevicePermissions | null;
  batteryPercent: number | null;
  syncPaused: boolean;
  importInProgress: boolean;
  importProgress: number | null;
  importTotal: number | null;
  simSlots: SimSlotView[];
}

export interface MessageView {
  id: string;
  deviceId: string;
  clientUuid: string;
  simSlotId: string | null;
  simSlotIndex: number | null;
  simLabel: string | null;
  sender: string;
  body: string;
  senderTimestamp: string | null;
  observedAt: string;
  receivedAt: string;
  sourceCategory: "LIVE" | "HISTORICAL_IMPORT" | "RECOVERY";
  partCount: number;
  isRead: boolean;
  isArchived: boolean;
  deviceName?: string;
}

export interface OverviewData {
  totalMessages: number;
  todayMessages: number;
  unreadMessages: number;
  pairedDeviceCount: number;
  recentMessages: Array<{
    id: string;
    deviceName: string;
    sender: string;
    preview: string;
    receivedAt: string;
    isRead: boolean;
  }>;
  syncWarnings: Array<{
    deviceId: string;
    name: string;
    reason: "paused" | "no_recent_contact";
    lastContactAt: string | null;
  }>;
}

export interface MessageListQuery {
  deviceId?: string;
  simSlotId?: string;
  q?: string;
  isRead?: boolean;
  isArchived?: boolean;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}

export function buildQuery(query: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
