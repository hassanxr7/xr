import "reflect-metadata";
import * as argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { parseFlags, promptHidden } from "./cli-args.util";

// Documented account-recovery path for the self-hosted single-owner model:
// whoever can run a command against the API container (i.e. controls the
// server) can reset the owner's password. This intentionally requires
// server access rather than email, since a self-hosted single-owner
// instance may have no outbound mail configured.
async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const prisma = new PrismaClient();

  const owner = await prisma.owner.findFirst();
  if (!owner) {
    console.error("No owner account exists yet. Run `npm run owner:create` first.");
    process.exit(1);
  }

  const password =
    flags.password ??
    process.env.SMSBRIDGE_OWNER_PASSWORD ??
    (await promptHidden("New password (min 10 chars): "));

  if (password.length < 10) {
    console.error("Password must be at least 10 characters.");
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password);
  await prisma.$transaction([
    prisma.owner.update({
      where: { id: owner.id },
      data: { passwordHash, passwordChangedAt: new Date() },
    }),
    // All existing browser sessions are invalidated so a compromised/stale
    // session can't outlive the reset.
    prisma.session.updateMany({
      where: { ownerId: owner.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.auditEvent.create({
      data: { ownerId: owner.id, type: "auth.password_reset_via_cli" },
    }),
  ]);

  console.log(`Password reset for ${owner.email}. All browser sessions were signed out.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
