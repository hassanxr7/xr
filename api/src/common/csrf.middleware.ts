import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { generateOpaqueToken } from "./crypto.util";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
// /api/auth/login has no session yet to protect, and /api/devices/pair
// authenticates with the pairing code itself, not ambient cookies.
const EXEMPT_PATHS = ["/api/auth/login", "/api/devices/pair"];

// Double-submit-cookie CSRF protection for the browser session (cookie) auth
// path. A request authenticating via `Authorization: Bearer` (every device
// endpoint) is exempt regardless of any cookies it happens to also carry:
// CSRF only works because browsers auto-attach cookies to a cross-site
// request, and they never auto-attach an Authorization header, so a device
// token can't be forged that way even if a stray owner session cookie is
// present in the same browser (e.g. someone testing the API by hand).
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
    const isBearerAuthed = Boolean(req.header("authorization")?.startsWith("Bearer "));
    const isMutating = MUTATING_METHODS.has(req.method);
    // req.path is relative to wherever Nest happens to mount this
    // middleware internally (it comes out as "/" for every request here
    // because of how the global prefix router is mounted) -- originalUrl is
    // always the real incoming path, so use that for the exempt check.
    const requestPath = req.originalUrl.split("?")[0];
    const isExempt = isBearerAuthed || EXEMPT_PATHS.some((p) => requestPath === p);

    if (hasSessionCookie && isMutating && !isExempt) {
      const header = req.header(CSRF_HEADER);
      if (!header || header !== token) {
        res.status(403).json({
          error: {
            code: "csrf_invalid",
            message: "Missing or invalid CSRF token.",
            path: requestPath,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }
    }

    next();
  }
}
