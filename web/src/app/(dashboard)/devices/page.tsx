"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type DeviceView } from "@/lib/api";
import { useLiveEventsSubscription } from "@/lib/live-events-context";
import { Badge, Card, ConfirmDialog, EmptyState, Spinner, Toast, useToast } from "@/components/ui";
import { formatDateTime, lastSeenLabel } from "@/lib/format";
import { useOwner } from "@/lib/owner-context";

interface PairingCodeResult {
  code: string;
  qrDataUrl: string;
  expiresAt: string;
}

export default function DevicesPage() {
  const { owner } = useOwner();
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairing, setPairing] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState("");
  const [pairingResult, setPairingResult] = useState<PairingCodeResult | null>(null);
  const [renaming, setRenaming] = useState<DeviceView | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [revoking, setRevoking] = useState<DeviceView | null>(null);
  const [editingSim, setEditingSim] = useState<{ deviceId: string; slotIndex: number; label: string; phoneNumber: string } | null>(null);
  const { message: toast, show: showToast } = useToast();

  const load = useCallback(async () => {
    const res = await api.get<{ devices: DeviceView[] }>("/api/devices");
    setDevices(res.devices);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveEventsSubscription({ onDeviceUpdated: () => void load() });

  async function submitPairing(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await api.post<PairingCodeResult>("/api/devices/pairing-codes", { deviceName: newDeviceName });
      setPairingResult(res);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to create pairing code.");
    }
  }

  function closePairingModal() {
    setPairing(false);
    setPairingResult(null);
    setNewDeviceName("");
    void load();
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming) return;
    try {
      await api.patch(`/api/devices/${renaming.id}`, { name: renameValue });
      setRenaming(null);
      void load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Rename failed.");
    }
  }

  async function confirmRevoke() {
    if (!revoking) return;
    try {
      await api.delete(`/api/devices/${revoking.id}`);
      showToast(`${revoking.name} disconnected.`);
      void load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Revoke failed.");
    } finally {
      setRevoking(null);
    }
  }

  async function submitSimSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSim) return;
    try {
      await api.put(`/api/devices/${editingSim.deviceId}/sim-slots/${editingSim.slotIndex}`, {
        label: editingSim.label,
        phoneNumber: editingSim.phoneNumber,
      });
      setEditingSim(null);
      void load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not save SIM label.");
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Devices</h1>
        <button
          onClick={() => setPairing(true)}
          className="text-sm px-3 py-1.5 rounded-md font-medium"
          style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}
        >
          Add device
        </button>
      </div>

      {devices.length === 0 ? (
        <EmptyState title="No devices paired yet" hint='Click "Add device" to generate a pairing code or QR.' />
      ) : (
        <div className="space-y-3">
          {devices.map((d) => {
            const seen = lastSeenLabel(d.lastContactAt);
            return (
              <Card key={d.id}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-medium">{d.name}</h2>
                      {d.status === "REVOKED" ? (
                        <Badge tone="danger">Revoked</Badge>
                      ) : d.syncPaused ? (
                        <Badge tone="warning">Sync paused</Badge>
                      ) : (
                        <Badge tone={seen.tone === "ok" ? "success" : seen.tone === "warning" ? "warning" : "neutral"}>
                          {seen.label}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                      {d.model ?? "Unknown model"} · Android {d.androidVersion ?? "?"} · App v{d.appVersion ?? "?"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setRenaming(d);
                        setRenameValue(d.name);
                      }}
                      className="text-xs px-2.5 py-1 rounded-md border"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      Rename
                    </button>
                    {d.status === "ACTIVE" && (
                      <button
                        onClick={() => setRevoking(d)}
                        className="text-xs px-2.5 py-1 rounded-md border"
                        style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  <div>
                    <div className="font-medium" style={{ color: "var(--color-text)" }}>
                      Last successful sync
                    </div>
                    {formatDateTime(d.lastSyncAt, owner?.timezone ?? "UTC")}
                  </div>
                  <div>
                    <div className="font-medium" style={{ color: "var(--color-text)" }}>
                      Queue size
                    </div>
                    {d.lastQueueSize ?? "—"}
                  </div>
                  <div>
                    <div className="font-medium" style={{ color: "var(--color-text)" }}>
                      Battery
                    </div>
                    {d.batteryPercent != null ? `${d.batteryPercent}%` : "—"}
                  </div>
                  <div>
                    <div className="font-medium" style={{ color: "var(--color-text)" }}>
                      Permissions
                    </div>
                    {d.permissions
                      ? Object.entries(d.permissions)
                          .filter(([, v]) => v === false)
                          .map(([k]) => k)
                          .join(", ") || "OK"
                      : "Unknown"}
                  </div>
                </div>

                {d.importInProgress && (
                  <div className="mt-2 text-xs" style={{ color: "var(--color-accent)" }}>
                    Importing history: {d.importProgress ?? 0}
                    {d.importTotal ? ` / ${d.importTotal}` : ""}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {[0, 1].map((slotIndex) => {
                    const slot = d.simSlots.find((s) => s.slotIndex === slotIndex);
                    return (
                      <button
                        key={slotIndex}
                        onClick={() =>
                          setEditingSim({
                            deviceId: d.id,
                            slotIndex,
                            label: slot?.label ?? "",
                            phoneNumber: slot?.phoneNumber ?? "",
                          })
                        }
                        className="text-xs px-2 py-1 rounded-md border"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        SIM {slotIndex}: {slot?.label ?? "Set label"}
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {pairing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
          <Card className="w-full max-w-sm">
            {!pairingResult ? (
              <form onSubmit={submitPairing} className="space-y-3">
                <h2 className="font-medium">Add a device</h2>
                <input
                  autoFocus
                  required
                  placeholder='e.g. "Home Phone"'
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setPairing(false)} className="px-3 py-1.5 rounded-md text-sm border" style={{ borderColor: "var(--color-border)" }}>
                    Cancel
                  </button>
                  <button type="submit" className="px-3 py-1.5 rounded-md text-sm font-medium" style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}>
                    Generate code
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 text-center">
                <h2 className="font-medium">Scan on your phone</h2>
                <img src={pairingResult.qrDataUrl} alt="Pairing QR code" className="mx-auto rounded-md border" style={{ borderColor: "var(--color-border)" }} />
                <p className="text-sm font-mono tracking-wider">{pairingResult.code}</p>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  Expires {formatDateTime(pairingResult.expiresAt, owner?.timezone ?? "UTC")}. Open the SMSBridge app,
                  scan this QR (or enter the code manually), and confirm the server address it shows.
                </p>
                <button onClick={closePairingModal} className="w-full px-3 py-1.5 rounded-md text-sm font-medium" style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}>
                  Done
                </button>
              </div>
            )}
          </Card>
        </div>
      )}

      {renaming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
          <Card className="w-full max-w-sm">
            <form onSubmit={submitRename} className="space-y-3">
              <h2 className="font-medium">Rename device</h2>
              <input
                autoFocus
                required
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setRenaming(null)} className="px-3 py-1.5 rounded-md text-sm border" style={{ borderColor: "var(--color-border)" }}>
                  Cancel
                </button>
                <button type="submit" className="px-3 py-1.5 rounded-md text-sm font-medium" style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}>
                  Save
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {editingSim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
          <Card className="w-full max-w-sm">
            <form onSubmit={submitSimSlot} className="space-y-3">
              <h2 className="font-medium">SIM slot {editingSim.slotIndex}</h2>
              <input
                placeholder="Label, e.g. Office SIM"
                value={editingSim.label}
                onChange={(e) => setEditingSim({ ...editingSim, label: e.target.value })}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
              />
              <input
                placeholder="Phone number (optional)"
                value={editingSim.phoneNumber}
                onChange={(e) => setEditingSim({ ...editingSim, phoneNumber: e.target.value })}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingSim(null)} className="px-3 py-1.5 rounded-md text-sm border" style={{ borderColor: "var(--color-border)" }}>
                  Cancel
                </button>
                <button type="submit" className="px-3 py-1.5 rounded-md text-sm font-medium" style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}>
                  Save
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={!!revoking}
        title={`Revoke ${revoking?.name}?`}
        description="This immediately invalidates the device's credentials. It will stop syncing until it's paired again with a new code."
        confirmLabel="Revoke"
        danger
        onConfirm={confirmRevoke}
        onCancel={() => setRevoking(null)}
      />
      <Toast message={toast} />
    </div>
  );
}
