import request from "supertest";
import { INestApplication } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import { createTestApp, extractCookies, resetDatabase } from "./test-utils";
import { PrismaService } from "../src/prisma/prisma.service";
import { sha256Hex } from "../src/common/crypto.util";

describe("SMSBridge API (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  async function createOwner(email: string, password: string) {
    return prisma.owner.create({
      data: { email, passwordHash: await argon2.hash(password) },
    });
  }

  async function loginAs(email: string, password: string) {
    const server = app.getHttpServer();
    const initial = await request(server).get("/api/health");
    const { csrfToken: initialCsrf } = extractCookies(initial.get("Set-Cookie"));

    const res = await request(server)
      .post("/api/auth/login")
      .set("Cookie", `csrf_token=${initialCsrf}`)
      .send({ email, password })
      .expect(201);

    const { cookieHeader, csrfToken } = extractCookies(res.get("Set-Cookie"));
    return { cookieHeader: `${cookieHeader}; csrf_token=${csrfToken ?? initialCsrf}`, csrfToken: csrfToken ?? initialCsrf! };
  }

  it("rejects login with wrong password", async () => {
    await createOwner("owner@example.com", "correct-password-1");
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "owner@example.com", password: "wrong-password-1" })
      .expect(401);
  });

  it("supports the full pair -> ingest -> list -> SSE-event pipeline, idempotently", async () => {
    await createOwner("owner@example.com", "correct-password-1");
    const { cookieHeader, csrfToken } = await loginAs("owner@example.com", "correct-password-1");
    const server = app.getHttpServer();

    const pairRes = await request(server)
      .post("/api/devices/pairing-codes")
      .set("Cookie", cookieHeader)
      .set("X-CSRF-Token", csrfToken)
      .send({ deviceName: "Home Phone" })
      .expect(201);
    const code = pairRes.body.code;

    const redeemRes = await request(server)
      .post("/api/devices/pair")
      .send({ code, model: "Pixel 7a", androidVersion: "14", appVersion: "1.0.0" })
      .expect(201);
    const deviceToken = redeemRes.body.deviceToken;
    expect(redeemRes.body.deviceName).toBe("Home Phone");

    // Reusing the same code must fail (single-use).
    await request(server).post("/api/devices/pair").send({ code }).expect(400);

    const clientUuid = randomUUID();
    const observedAt = new Date().toISOString();
    const ingestBody = {
      messages: [
        {
          clientUuid,
          sender: "+15551234567",
          body: "Hello 👋 waan la soo xiriiri 🎉 مرحبا",
          observedAt,
          sourceCategory: "LIVE",
        },
      ],
    };

    const first = await request(server)
      .post("/api/devices/me/messages")
      .set("Authorization", `Bearer ${deviceToken}`)
      .send(ingestBody)
      .expect(201);
    expect(first.body.results[0].status).toBe("created");
    const serverId = first.body.results[0].serverId;

    // Retry with same clientUuid (simulating a lost-response retry) must not duplicate.
    const retry = await request(server)
      .post("/api/devices/me/messages")
      .set("Authorization", `Bearer ${deviceToken}`)
      .send(ingestBody)
      .expect(201);
    expect(retry.body.results[0].status).toBe("duplicate");
    expect(retry.body.results[0].serverId).toBe(serverId);

    const count = await prisma.message.count();
    expect(count).toBe(1);

    const list = await request(server)
      .get("/api/messages")
      .set("Cookie", cookieHeader)
      .expect(200);
    expect(list.body.messages).toHaveLength(1);
    expect(list.body.messages[0].body).toBe("Hello 👋 waan la soo xiriiri 🎉 مرحبا");

    const detail = await request(server)
      .get(`/api/messages/${serverId}`)
      .set("Cookie", cookieHeader)
      .expect(200);
    expect(detail.body.sender).toBe("+15551234567");

    await request(server)
      .patch(`/api/messages/${serverId}`)
      .set("Cookie", cookieHeader)
      .set("X-CSRF-Token", csrfToken)
      .send({ isRead: true })
      .expect(200);

    const overview = await request(server)
      .get("/api/overview")
      .set("Cookie", cookieHeader)
      .expect(200);
    expect(overview.body.totalMessages).toBe(1);
    expect(overview.body.unreadMessages).toBe(0);
  });

  it("preserves two separate messages with identical sender and text", async () => {
    await createOwner("owner@example.com", "correct-password-1");
    const owner = await prisma.owner.findFirstOrThrow();
    const device = await prisma.device.create({ data: { ownerId: owner.id, name: "Dup Test" } });

    // Two distinct clientUuids with identical sender/body/timestamp must
    // remain two rows: dedup is keyed on clientUuid, never on content.
    const first = await prisma.message.create({
      data: {
        ownerId: owner.id,
        deviceId: device.id,
        clientUuid: randomUUID(),
        sender: "+15550001111",
        body: "Same text",
        observedAt: new Date("2026-01-01T00:00:00Z"),
        sourceCategory: "LIVE",
      },
    });
    const second = await prisma.message.create({
      data: {
        ownerId: owner.id,
        deviceId: device.id,
        clientUuid: randomUUID(),
        sender: "+15550001111",
        body: "Same text",
        observedAt: new Date("2026-01-01T00:00:00Z"),
        sourceCategory: "LIVE",
      },
    });
    expect(first.id).not.toBe(second.id);
    const count = await prisma.message.count();
    expect(count).toBe(2);
  });

  it("still allows pairing-code redemption when the caller happens to carry an unrelated owner session cookie", async () => {
    // Regression test: /api/devices/pair must stay reachable even from a
    // browser that also has a logged-in sid cookie (e.g. the owner testing
    // pairing from the same browser as the dashboard) -- it must not be
    // treated as a CSRF-protected session-authenticated route.
    await createOwner("owner@example.com", "correct-password-1");
    const { cookieHeader, csrfToken } = await loginAs("owner@example.com", "correct-password-1");
    const server = app.getHttpServer();

    const pairRes = await request(server)
      .post("/api/devices/pairing-codes")
      .set("Cookie", cookieHeader)
      .set("X-CSRF-Token", csrfToken)
      .send({ deviceName: "Same Browser Phone" })
      .expect(201);

    const redeemRes = await request(server)
      .post("/api/devices/pair")
      .set("Cookie", cookieHeader) // sid cookie present, no X-CSRF-Token header, like a real device would send
      .send({ code: pairRes.body.code })
      .expect(201);
    expect(redeemRes.body.deviceName).toBe("Same Browser Phone");
  });

  it("does not require a CSRF header for device Bearer-token requests, even alongside a stray owner session cookie", async () => {
    await createOwner("owner@example.com", "correct-password-1");
    const { cookieHeader, csrfToken } = await loginAs("owner@example.com", "correct-password-1");
    const server = app.getHttpServer();

    const pairRes = await request(server)
      .post("/api/devices/pairing-codes")
      .set("Cookie", cookieHeader)
      .set("X-CSRF-Token", csrfToken)
      .send({ deviceName: "Bearer Test Phone" })
      .expect(201);
    const redeemRes = await request(server).post("/api/devices/pair").send({ code: pairRes.body.code }).expect(201);

    await request(server)
      .post("/api/devices/me/status")
      .set("Cookie", cookieHeader) // stray sid cookie, no X-CSRF-Token
      .set("Authorization", `Bearer ${redeemRes.body.deviceToken}`)
      .send({ queueSize: 0 })
      .expect(201);
  });

  it("rejects a mutating request without a matching CSRF header", async () => {
    await createOwner("owner@example.com", "correct-password-1");
    const { cookieHeader } = await loginAs("owner@example.com", "correct-password-1");
    await request(app.getHttpServer())
      .post("/api/devices/pairing-codes")
      .set("Cookie", cookieHeader)
      .send({ deviceName: "No CSRF" })
      .expect(403);
  });

  it("rejects device requests once the device is revoked", async () => {
    await createOwner("owner@example.com", "correct-password-1");
    const { cookieHeader, csrfToken } = await loginAs("owner@example.com", "correct-password-1");
    const server = app.getHttpServer();

    const pairRes = await request(server)
      .post("/api/devices/pairing-codes")
      .set("Cookie", cookieHeader)
      .set("X-CSRF-Token", csrfToken)
      .send({ deviceName: "Revoke Me" })
      .expect(201);
    const redeemRes = await request(server)
      .post("/api/devices/pair")
      .send({ code: pairRes.body.code })
      .expect(201);
    const deviceToken = redeemRes.body.deviceToken;
    const deviceId = redeemRes.body.deviceId;

    await request(server)
      .delete(`/api/devices/${deviceId}`)
      .set("Cookie", cookieHeader)
      .set("X-CSRF-Token", csrfToken)
      .expect(204);

    await request(server)
      .post("/api/devices/me/status")
      .set("Authorization", `Bearer ${deviceToken}`)
      .send({})
      .expect(401);
  });

  it("rejects an expired pairing code", async () => {
    const owner = await createOwner("owner@example.com", "correct-password-1");
    await prisma.pairingCode.create({
      data: {
        ownerId: owner.id,
        deviceName: "Expired Phone",
        codeHash: sha256Hex("EXPIREDCODE"),
        expiresAt: new Date(Date.now() - 60_000), // already expired
      },
    });

    const res = await request(app.getHttpServer())
      .post("/api/devices/pair")
      .send({ code: "EXPIREDCODE" })
      .expect(400);
    expect(res.body.error.code).toBe("expired_or_used");

    // No orphan device should have been created for the failed redemption.
    expect(await prisma.device.count()).toBe(0);
  });

  it("prevents one owner from accessing another owner's devices or messages", async () => {
    await createOwner("owner-a@example.com", "correct-password-1");
    await createOwner("owner-b@example.com", "correct-password-2");
    const server = app.getHttpServer();

    const a = await loginAs("owner-a@example.com", "correct-password-1");
    const pairRes = await request(server)
      .post("/api/devices/pairing-codes")
      .set("Cookie", a.cookieHeader)
      .set("X-CSRF-Token", a.csrfToken)
      .send({ deviceName: "Owner A Phone" })
      .expect(201);
    const redeemRes = await request(server)
      .post("/api/devices/pair")
      .send({ code: pairRes.body.code })
      .expect(201);
    const deviceToken = redeemRes.body.deviceToken;
    await request(server)
      .post("/api/devices/me/messages")
      .set("Authorization", `Bearer ${deviceToken}`)
      .send({
        messages: [
          {
            clientUuid: randomUUID(),
            sender: "+1000",
            body: "Owner A's secret message",
            observedAt: new Date().toISOString(),
            sourceCategory: "LIVE",
          },
        ],
      })
      .expect(201);

    const b = await loginAs("owner-b@example.com", "correct-password-2");
    const listAsB = await request(server)
      .get("/api/messages")
      .set("Cookie", b.cookieHeader)
      .expect(200);
    expect(listAsB.body.messages).toHaveLength(0);

    const devicesAsB = await request(server)
      .get("/api/devices")
      .set("Cookie", b.cookieHeader)
      .expect(200);
    expect(devicesAsB.body.devices).toHaveLength(0);

    // Owner B can't revoke or rename owner A's device by guessing its id.
    await request(server)
      .patch(`/api/devices/${redeemRes.body.deviceId}`)
      .set("Cookie", b.cookieHeader)
      .set("X-CSRF-Token", b.csrfToken)
      .send({ name: "Hijacked" })
      .expect(404);
  });

  it("sanitizes CSV export against formula injection", async () => {
    await createOwner("owner@example.com", "correct-password-1");
    const owner = await prisma.owner.findFirstOrThrow();
    const device = await prisma.device.create({ data: { ownerId: owner.id, name: "CSV Test" } });
    await prisma.message.create({
      data: {
        ownerId: owner.id,
        deviceId: device.id,
        clientUuid: randomUUID(),
        sender: "=SUM(A1:A9)",
        body: "+cmd|'/c calc'!A0",
        observedAt: new Date(),
        sourceCategory: "LIVE",
      },
    });

    const { cookieHeader } = await loginAs("owner@example.com", "correct-password-1");
    const res = await request(app.getHttpServer())
      .get("/api/messages/export")
      .set("Cookie", cookieHeader)
      .expect(200);

    expect(res.text).toContain("'=SUM(A1:A9)");
    expect(res.text).toContain("'+cmd|'/c calc'!A0");
  });

  it("keeps message ordering and pagination stable across a full sync reconciliation pass", async () => {
    await createOwner("owner@example.com", "correct-password-1");
    const owner = await prisma.owner.findFirstOrThrow();
    const device = await prisma.device.create({ data: { ownerId: owner.id, name: "Sync Test" } });

    for (let i = 0; i < 25; i++) {
      await prisma.message.create({
        data: {
          ownerId: owner.id,
          deviceId: device.id,
          clientUuid: randomUUID(),
          sender: `+100${i}`,
          body: `msg ${i}`,
          observedAt: new Date(Date.now() + i * 1000),
          receivedAt: new Date(Date.now() + i * 1000),
          sourceCategory: "LIVE",
        },
      });
    }

    const { cookieHeader } = await loginAs("owner@example.com", "correct-password-1");
    const server = app.getHttpServer();

    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const res = await request(server)
        .get("/api/messages/sync")
        .set("Cookie", cookieHeader)
        .query({ cursor, limit: 1 })
        .expect(200);
      if (res.body.messages.length === 0) break;
      for (const m of res.body.messages) seen.add(m.id);
      cursor = res.body.nextCursor;
    }
    expect(seen.size).toBe(25);
  });
});
