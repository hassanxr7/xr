import "reflect-metadata";
import * as argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { parseFlags, promptHidden, promptPlain } from "./cli-args.util";

// Creates the single owner account. Public registration is disabled by
// design; this script is the only way to create an owner, and it refuses to
// run a second time so an already-deployed instance can't be re-seeded.
async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const prisma = new PrismaClient();

  const existing = await prisma.owner.count();
  if (existing > 0) {
    console.error(
      "An owner account already exists. Use `npm run owner:reset-password` for account recovery.",
    );
    process.exit(1);
  }

  const email =
    flags.email ?? process.env.SMSBRIDGE_OWNER_EMAIL ?? (await promptPlain("Owner email: "));
  const password =
    flags.password ??
    process.env.SMSBRIDGE_OWNER_PASSWORD ??
    (await promptHidden("Owner password (min 10 chars): "));

  if (!email.includes("@")) {
    console.error("Invalid email address.");
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("Password must be at least 10 characters.");
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password);
  const owner = await prisma.owner.create({
    data: { email, passwordHash },
  });

  console.log(`Owner account created: ${owner.email} (id: ${owner.id})`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
