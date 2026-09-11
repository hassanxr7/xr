import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  return app;
}

export async function resetDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.$transaction([
    prisma.auditEvent.deleteMany(),
    prisma.message.deleteMany(),
    prisma.simSlot.deleteMany(),
    prisma.deviceCredential.deleteMany(),
    prisma.pairingCode.deleteMany(),
    prisma.device.deleteMany(),
    prisma.session.deleteMany(),
    prisma.owner.deleteMany(),
  ]);
}

// Parses `Set-Cookie` response headers into a `key=value; key2=value2` string
// suitable for the next request's Cookie header, and separately returns the
// csrf token value so callers can set X-CSRF-Token.
export function extractCookies(setCookieHeaders: string[] | undefined): {
  cookieHeader: string;
  csrfToken?: string;
} {
  const jar: Record<string, string> = {};
  for (const raw of setCookieHeaders ?? []) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    jar[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return {
    cookieHeader: Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; "),
    csrfToken: jar["csrf_token"],
  };
}
