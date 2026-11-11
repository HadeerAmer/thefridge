/** An error that is safe to show to the user, with the HTTP status it maps to. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  unauthorized: () => new AppError("unauthorized", "Please sign in to continue.", 401),
  forbidden: () => new AppError("forbidden", "You don't have access to this.", 403),
  notFound: (what = "Item") => new AppError("not_found", `${what} not found.`, 404),
  invalid: (message: string) => new AppError("invalid_request", message, 400),
  conflict: (message: string, details?: Record<string, unknown>) => new AppError("conflict", message, 409, details),
};
