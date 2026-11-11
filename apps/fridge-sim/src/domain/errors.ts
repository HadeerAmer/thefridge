import { MachineErrorCode } from "@thefridge/shared/contracts";

type ErrorCode = (typeof MachineErrorCode)[keyof typeof MachineErrorCode];

/** Error with an HTTP status, rendered as `{ error: { code, message } }`. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: 400 | 401 | 404 | 409 | 423 = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what: string) => new DomainError(MachineErrorCode.NotFound, `${what} not found`, 404);
