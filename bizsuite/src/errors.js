export class AppError extends Error {
  constructor(status, code, message, params = {}) { super(message || code); this.status = status; this.code = code; this.params = params; }
}
export const bad = (code, message, params) => new AppError(400, code, message, params);
export const forbidden = (message = 'Not permitted', code = 'forbidden') => new AppError(403, code, message);
export const notFound = (what = 'record') => new AppError(404, 'not_found', `${what} not found`, { what });
export const conflict = (code, message, params) => new AppError(409, code, message, params);
