import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

export const CurrentOwner = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.owner!;
});
