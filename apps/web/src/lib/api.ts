/** Typed fetch for the app's own API. Errors carry the server's code + user-facing message. */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: undefined })
    | { error: { code: string; message: string; details?: Record<string, unknown> } }
    | null;
  if (!res.ok || (data && "error" in data && data.error)) {
    const error = (data as { error?: { code: string; message: string; details?: Record<string, unknown> } } | null)?.error;
    throw new ApiError(error?.message ?? `Request failed (${res.status})`, res.status, error?.code ?? "http_error", error?.details);
  }
  return data as T;
}

export const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401;
