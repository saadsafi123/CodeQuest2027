// Purpose: typed errors that routes translate into HTTP responses (so routes stay thin).
export type ErrorCode = "bad_request" | "unauthorized" | "forbidden" | "not_found" | "conflict" | "unavailable";

const STATUS: Record<ErrorCode, number> = { bad_request: 400, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409, unavailable: 503 };

export class ServiceError extends Error {
  readonly status: number;
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
    this.status = STATUS[code];
  }
}
