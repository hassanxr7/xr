import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { AuditModule } from "./audit/audit.module";
import { EventsModule } from "./events/events.module";
import { AuthModule } from "./auth/auth.module";
import { DevicesModule } from "./devices/devices.module";
import { MessagesModule } from "./messages/messages.module";
import { OverviewModule } from "./overview/overview.module";
import { HealthModule } from "./health/health.module";
import { RetentionModule } from "./retention/retention.module";
import { CsrfMiddleware } from "./common/csrf.middleware";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      // Global safety-net limit for every route (the login/pairing
      // endpoints layer a much stricter limit on top via @Throttle()).
      // Configurable because a single dashboard actively polling/paginating
      // a 100k+ message inbox, or a load test, can legitimately exceed a
      // low default; the /auth/login and /devices/pair limits are what
      // actually matter for resisting credential/code guessing.
      throttlers: [{ ttl: 60_000, limit: Number(process.env.GLOBAL_RATE_LIMIT ?? 120) }],
    }),
    PrismaModule,
    AuditModule,
    EventsModule,
    AuthModule,
    DevicesModule,
    MessagesModule,
    OverviewModule,
    HealthModule,
    RetentionModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes("*");
  }
}
