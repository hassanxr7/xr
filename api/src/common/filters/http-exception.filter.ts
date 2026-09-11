import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

// Consistent error envelope for every failure, and never leaks stack traces,
// SMS bodies, or credentials into the response or logs.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpException");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "internal_error";
    let message = "An unexpected error occurred.";
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
      } else if (typeof body === "object" && body !== null) {
        const b = body as Record<string, unknown>;
        message = typeof b.message === "string" ? b.message : message;
        details = Array.isArray(b.message) ? b.message : undefined;
        code = typeof b.code === "string" ? b.code : this.codeFromStatus(status);
      } else {
        code = this.codeFromStatus(status);
      }
      if (!details) code = code ?? this.codeFromStatus(status);
    } else {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.path}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      error: {
        code,
        message,
        details,
        path: request.path,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case 400:
        return "bad_request";
      case 401:
        return "unauthorized";
      case 403:
        return "forbidden";
      case 404:
        return "not_found";
      case 409:
        return "conflict";
      case 422:
        return "unprocessable";
      case 429:
        return "rate_limited";
      default:
        return "internal_error";
    }
  }
}
