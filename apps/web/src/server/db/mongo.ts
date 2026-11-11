import "server-only";
import mongoose, { type ClientSession } from "mongoose";
import { env } from "@/env";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

// One connection per server process, surviving dev hot reloads.
const globalForMongo = globalThis as unknown as { __mongo?: Cache };
const cache: Cache = (globalForMongo.__mongo ??= { conn: null, promise: null });

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  mongoose.set("strictQuery", true);
  cache.promise ??= mongoose
    .connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000, maxPoolSize: 10 })
    .catch((error) => {
      cache.promise = null;
      throw error;
    });
  cache.conn = await cache.promise;
  return cache.conn;
}

/**
 * Runs `work` in a multi-document transaction (needs a replica set — local rs0 or Atlas).
 * The driver retries transient errors; `work` must therefore be safe to re-run.
 */
export async function withTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const conn = await connectDb();
  const session = await conn.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
