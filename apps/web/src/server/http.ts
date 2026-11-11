import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { connectDb } from "./db/mongo";
import { AppError } from "./errors";

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<unknown>;

/**
 * Wraps a route handler: connects to the database, turns the return value into JSON and
 * maps AppError / ZodError to `{ error: { code, message } }` with the right status.
 */
export function route<Ctx = unknown>(handler: Handler<Ctx>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      await connectDb();
      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    const message = error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return NextResponse.json({ error: { code: "invalid_request", message } }, { status: 400 });
  }
  console.error("[api] unexpected error", error);
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong on our side." } }, { status: 500 });
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const body = await req.json().catch(() => {
    throw new AppError("invalid_request", "Body must be valid JSON.", 400);
  });
  return schema.parse(body);
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  return schema.parse(params);
}
