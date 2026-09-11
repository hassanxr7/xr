import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

// Generates a large synthetic dataset (default 100,000 messages) to exercise
// search/pagination/export at scale. Dev/test tool only; gated the same way
// as seed-demo so it can never run against a production instance by accident.
const TOTAL = Number(process.env.SEED_PERF_COUNT ?? 100_000);
const BATCH_SIZE = 2000;
const SENDERS = ["+15551230001", "+15551230002", "AMAZON", "BANK-ALERT", "22300", "+252611234567"];

function randomBody(i: number): string {
  const bodies = [
    `Your verification code is ${(1000 + (i % 9000)).toString()}.`,
    "Waan ku faraxsanahay inaan kula shaqeeyo mustaqbalka.",
    "Your package has shipped and will arrive within 3-5 business days.",
    "تنبيه أمني: تم تسجيل الدخول من جهاز جديد.",
    `Payment of $${(i % 500) + 1}.00 received, thank you.`,
  ];
  return bodies[i % bodies.length];
}

async function main() {
  if (process.env.SEED_DEMO_DATA !== "true") {
    console.error("Refusing to seed perf data: set SEED_DEMO_DATA=true to run this script.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  let owner = await prisma.owner.findFirst();
  if (!owner) {
    console.error("No owner exists yet. Run `npm run owner:create` first.");
    process.exit(1);
  }

  const device = await prisma.device.create({
    data: { ownerId: owner.id, name: "Perf Test Device", model: "Synthetic", androidVersion: "14" },
  });

  const start = Date.now();
  const baseTime = Date.now() - TOTAL * 60_000;

  for (let batchStart = 0; batchStart < TOTAL; batchStart += BATCH_SIZE) {
    const count = Math.min(BATCH_SIZE, TOTAL - batchStart);
    const rows = Array.from({ length: count }, (_, j) => {
      const i = batchStart + j;
      const receivedAt = new Date(baseTime + i * 60_000);
      return {
        ownerId: owner!.id,
        deviceId: device.id,
        clientUuid: randomUUID(),
        sender: SENDERS[i % SENDERS.length],
        body: randomBody(i),
        observedAt: receivedAt,
        receivedAt,
        sourceCategory: "LIVE" as const,
        isRead: i % 4 !== 0,
      };
    });
    await prisma.message.createMany({ data: rows });
    if (batchStart % (BATCH_SIZE * 10) === 0) {
      console.log(`Inserted ${batchStart + count}/${TOTAL}...`);
    }
  }

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Seeded ${TOTAL} synthetic messages on device "${device.name}" in ${elapsedSec}s.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
