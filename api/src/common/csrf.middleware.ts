import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { generateOpaqueToken } from "./crypto.util";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
const EXEMPT_PATHS = ["/api/auth/login", "/api/devices/pair"];

// Double-submit-cookie CSRF protection for the browser session (cookie) auth path.
// Device-token (Authorization: Bearer) requests are not exempt-checked here because
// browsers never attach Authorization headers automatically, so CSRF doesn't apply to them.
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    let token = req.cookies?.[CSRF_COOKIE];
    if (!token) {
      token = generateOpaqueToken(24);
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    }

    const hasSessionCookie = Boolean(req.cookies?.sid);
    const isMutating = MUTATING_METHODS.has(req.method);
    const isExempt = EXEMPT_PATHS.some((p) => req.path === p);

    if (hasSessionCookie && isMutating && !isExempt) {
      const header = req.header(CSRF_HEADER);
      if (!header || header !== token) {
        res.status(403).json({
          error: {
            code: "csrf_invalid",
            message: "Missing or invalid CSRF token.",
            path: req.path,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }
    }

    next();
  }
}
