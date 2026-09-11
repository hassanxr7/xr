"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useOwner } from "@/lib/owner-context";
import { Card, Toast, useToast } from "@/components/ui";

const TIMEZONES = [
  "Africa/Mogadishu",
  "UTC",
  "Africa/Nairobi",
  "Africa/Cairo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Karachi",
];

export default function SettingsPage() {
  const { owner, refresh } = useOwner();
  const { message: toast, show: showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  if (!owner) return null;

  async function updateSettings(patch: Record<string, unknown>) {
    try {
      await api.patch("/api/auth/me", patch);
      await refresh();
      showToast("Saved.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Save failed.");
    }
  }

  async function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setChangingPassword(true);
    try {
      await api.post("/api/auth/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      showToast("Password changed. Other sessions were signed out.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Password change failed.");
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card className="space-y-3">
        <h2 className="text-sm font-medium">Account</h2>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {owner.email}
        </p>
        <form onSubmit={submitPasswordChange} className="space-y-2 pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
          <label className="block text-xs font-medium">Current password</label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-sm"
            style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
          />
          <label className="block text-xs font-medium">New password (min 10 characters)</label>
          <input
            type="password"
            required
            minLength={10}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-sm"
            style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
          />
          <button
            type="submit"
            disabled={changingPassword}
            className="text-sm px-3 py-1.5 rounded-md font-medium disabled:opacity-60"
            style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}
          >
            Change password
          </button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-medium">Preferences</h2>
        <div>
          <label className="block text-xs font-medium mb-1">Timezone</label>
          <select
            value={owner.timezone}
            onChange={(e) => updateSettings({ timezone: e.target.value })}
            className="w-full rounded-md border px-3 py-1.5 text-sm"
            style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Theme</label>
          <div className="flex gap-2">
            {(["system", "light", "dark"] as const).map((t) => (
              <button
                key={t}
                onClick={() => updateSettings({ theme: t })}
                className="flex-1 text-sm px-3 py-1.5 rounded-md border capitalize"
                style={{
                  borderColor: owner.theme === t ? "var(--color-accent)" : "var(--color-border)",
                  color: owner.theme === t ? "var(--color-accent)" : "var(--color-text)",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={owner.notificationSound}
            onChange={(e) => updateSettings({ notificationSound: e.target.checked })}
          />
          Play a sound when a new message arrives
        </label>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-medium">Retention</h2>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Leave this blank to keep messages forever (the default — nothing is deleted
          automatically until you set a value). Setting a number of days runs a daily
          cleanup that removes server copies older than that window from every dashboard
          view and export. It never touches the SMS app or its local queue on the phone,
          and a later historical import covering the same dates can bring a message back.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={3650}
            placeholder="Keep forever"
            defaultValue={owner.retentionDays ?? ""}
            onBlur={(e) => updateSettings({ retentionDays: e.target.value ? Number(e.target.value) : null })}
            className="w-32 rounded-md border px-3 py-1.5 text-sm"
            style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
          />
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            days
          </span>
        </div>
      </Card>
      <Toast message={toast} />
    </div>
  );
}
