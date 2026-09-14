import "reflect-metadata";
import * as argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

// Synthetic demo dataset for local development/UI walkthroughs only. Never
// runs unless SEED_DEMO_DATA=true is set explicitly, and production compose
// files do not set that variable, so a real deployment starts empty.
const SAMPLE_MESSAGES: Array<{ sender: string; body: string }> = [
  { sender: "+252611234567", body: "Fadlan xaqiiji lacag bixinta 12,000 SLSH ee aad dirtay." },
  { sender: "AMAZON", body: "Your order #112-4483921 has shipped and will arrive tomorrow." },
  { sender: "+15551234567", body: "Hey, are we still meeting at 6pm today? 😊" },
  { sender: "BANK-ALERT", body: "تنبيه: تم إجراء عملية شراء بقيمة 45.00 دولار على بطاقتك." },
  { sender: "22300", body: "Your OTP is 483920. Do not share this code with anyone." },
  { sender: "+252907654321", body: "Waan ku faraxsanahay inaan kula shaqeeyo mustaqbalka 🎉" },
  { sender: "DHL", body: "Your parcel is out for delivery and should arrive by 5:00 PM." },
  { sender: "+447911123456", body: "Reminder: rent is due on the 1st. Let me know if you need an extension." },
];

async function main() {
  if (process.env.SEED_DEMO_DATA !== "true") {
    console.error("Refusing to seed demo data: set SEED_DEMO_DATA=true to run this script.");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  let owner = await prisma.owner.findFirst();
  if (!owner) {
    owner = await prisma.owner.create({
      data: {
        email: "demo@smsbridge.local",
        passwordHash: await argon2.hash("DemoPassword123!"),
      },
    });
    console.log(`Created demo owner demo@smsbridge.local / DemoPassword123! (id: ${owner.id})`);
  }

  const device = await prisma.device.create({
    data: { ownerId: owner.id, name: "Demo Phone", model: "Pixel 7a", androidVersion: "14", appVersion: "1.0.0" },
  });
  await prisma.simSlot.create({
    data: { deviceId: device.id, slotIndex: 0, label: "Demo SIM", isManual: true },
  });

  const now = Date.now();
  for (let i = 0; i < SAMPLE_MESSAGES.length; i++) {
    const sample = SAMPLE_MESSAGES[i];
    const receivedAt = new Date(now - i * 15 * 60_000);
    await prisma.message.create({
      data: {
        ownerId: owner.id,
        deviceId: device.id,
        clientUuid: randomUUID(),
        sender: sample.sender,
        body: sample.body,
        observedAt: receivedAt,
        receivedAt,
        sourceCategory: "LIVE",
        simLabelSnapshot: "Demo SIM",
        simSlotIndexRaw: 0,
        isRead: i % 3 === 0,
      },
    });
  }

  console.log(`Seeded demo device "${device.name}" with ${SAMPLE_MESSAGES.length} messages.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
