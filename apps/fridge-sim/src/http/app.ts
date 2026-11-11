import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";
import { ZodError } from "zod";
import {
  ApiErrorSchema,
  CreateHoldRequestSchema,
  HoldSchema,
  InventorySchema,
  MachineErrorCode,
  MachineStatusSchema,
  MachineSummarySchema,
  NoticeRequestSchema,
  VendRequestSchema,
  VendResultSchema,
} from "@thefridge/shared/contracts";
import { API_KEY_HEADER } from "@thefridge/shared/signing";
import { PRODUCT_BY_SKU } from "@thefridge/shared/fixtures";
import type { Config } from "../config";
import type { CloudClient } from "../cloud";
import { DomainError } from "../domain/errors";
import type { Fleet } from "../domain/fleet";
import type { Touchscreen } from "../touchscreen";

type Deps = { fleet: Fleet; cloud: CloudClient; touchscreen: Touchscreen; config: Config };

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});
const errorResponses = {
  400: json(ApiErrorSchema, "Invalid request"),
  401: json(ApiErrorSchema, "Missing or wrong API key"),
  404: json(ApiErrorSchema, "Machine, hold or slot not found"),
  409: json(ApiErrorSchema, "Not enough stock, or the hold is no longer active"),
  423: json(ApiErrorSchema, "Machine offline or sales paused (temperature)"),
} as const;

const MachineParams = z.object({ machineId: z.string().min(1) });
const HoldParams = MachineParams.extend({ holdId: z.string().min(1) });
const SessionParams = z.object({ sessionId: z.string().min(1) });
const security = [{ ApiKey: [] }];

// ------------------------------------------------------------- machine API (cloud-facing)

const listMachines = createRoute({
  method: "get",
  path: "/api/v1/machines",
  tags: ["Machines"],
  summary: "List machines with status and temperature",
  security,
  responses: { 200: json(z.array(MachineSummarySchema), "Machines"), 401: errorResponses[401] },
});

const getInventory = createRoute({
  method: "get",
  path: "/api/v1/machines/{machineId}/inventory",
  tags: ["Inventory"],
  summary: "Live stock per SKU: on hand, held by reservations, available",
  security,
  request: { params: MachineParams },
  responses: { 200: json(InventorySchema, "Inventory"), 401: errorResponses[401], 404: errorResponses[404] },
});

const createHold = createRoute({
  method: "post",
  path: "/api/v1/machines/{machineId}/holds",
  tags: ["Holds"],
  summary: "Hold units for a reservation or courier pickup",
  description:
    "Locks units so walk-up buyers and other app users can't take them. Holds expire automatically after `ttlSeconds` " +
    "(a `hold.expired` webhook follows). Idempotent per `ref`.",
  security,
  request: {
    params: MachineParams,
    body: { content: { "application/json": { schema: CreateHoldRequestSchema } }, required: true },
  },
  responses: {
    201: json(HoldSchema, "Hold created (or the existing active hold for this ref)"),
    ...errorResponses,
  },
});

const releaseHold = createRoute({
  method: "delete",
  path: "/api/v1/machines/{machineId}/holds/{holdId}",
  tags: ["Holds"],
  summary: "Release a hold (order cancelled)",
  security,
  request: { params: HoldParams },
  responses: { 200: json(HoldSchema, "Hold after release"), 401: errorResponses[401], 404: errorResponses[404] },
});

const vend = createRoute({
  method: "post",
  path: "/api/v1/machines/{machineId}/vend",
  tags: ["Vending"],
  summary: "Dispense a held order remotely (e.g. courier collection)",
  security,
  request: {
    params: MachineParams,
    body: { content: { "application/json": { schema: VendRequestSchema } }, required: true },
  },
  responses: { 200: json(VendResultSchema, "Items dispensed"), ...errorResponses },
});

const setNotice = createRoute({
  method: "put",
  path: "/api/v1/machines/{machineId}/notice",
  tags: ["Machines"],
  summary: "Show a notice on the machine screen and in the app (null clears it)",
  security,
  request: {
    params: MachineParams,
    body: { content: { "application/json": { schema: NoticeRequestSchema } }, required: true },
  },
  responses: { 200: json(MachineSummarySchema, "Machine"), ...errorResponses },
});

// ------------------------------------------------------------- simulator controls (touchscreen UI)

const ScanBody = z.object({ code: z.string().trim().min(3).max(40) });
const PayBody = z.object({ method: z.enum(["card", "cash"]) });
const WalkUpBody = z.object({ slot: z.string().regex(/^[A-F][1-9]$/), method: z.enum(["card", "cash"]) });
const RestockBody = z.object({ slot: z.string().regex(/^[A-F][1-9]$/).optional() });
const PatchMachineBody = z.object({
  status: MachineStatusSchema.optional(),
  temperatureC: z.number().min(-5).max(30).optional(),
  notice: z.string().max(280).nullable().optional(),
});
const Ok = z.object({ ok: z.literal(true) });
const SessionSchema = z.object({
  id: z.string(),
  machineId: z.string(),
  code: z.string(),
  status: z.string(),
  message: z.string(),
});

const simScan = createRoute({
  method: "post",
  path: "/sim/machines/{machineId}/scan",
  tags: ["Simulator"],
  summary: "The scanner reads a QR / pickup code",
  request: { params: MachineParams, body: { content: { "application/json": { schema: ScanBody } }, required: true } },
  responses: { 200: json(SessionSchema, "Scan session"), ...errorResponses },
});

const simPay = createRoute({
  method: "post",
  path: "/sim/sessions/{sessionId}/pay",
  tags: ["Simulator"],
  summary: "Customer pays the amount due on the machine",
  request: { params: SessionParams, body: { content: { "application/json": { schema: PayBody } }, required: true } },
  responses: { 200: json(SessionSchema, "Scan session"), ...errorResponses },
});

const simCancel = createRoute({
  method: "post",
  path: "/sim/sessions/{sessionId}/cancel",
  tags: ["Simulator"],
  summary: "Cancel the payment step",
  request: { params: SessionParams },
  responses: { 200: json(SessionSchema, "Scan session"), ...errorResponses },
});

const simWalkUp = createRoute({
  method: "post",
  path: "/sim/machines/{machineId}/walk-up",
  tags: ["Simulator"],
  summary: "Walk-up purchase: pick a slot and pay on the machine",
  request: { params: MachineParams, body: { content: { "application/json": { schema: WalkUpBody } }, required: true } },
  responses: { 200: json(Ok, "Dispensed"), ...errorResponses },
});

const simRestock = createRoute({
  method: "post",
  path: "/sim/machines/{machineId}/restock",
  tags: ["Simulator"],
  summary: "Refill one slot, or every slot when no slot is given",
  request: { params: MachineParams, body: { content: { "application/json": { schema: RestockBody } }, required: false } },
  responses: { 200: json(Ok, "Restocked"), ...errorResponses },
});

const simPatch = createRoute({
  method: "patch",
  path: "/sim/machines/{machineId}",
  tags: ["Simulator"],
  summary: "Change status, cabinet temperature or notice",
  request: {
    params: MachineParams,
    body: { content: { "application/json": { schema: PatchMachineBody } }, required: true },
  },
  responses: { 200: json(MachineSummarySchema, "Machine"), ...errorResponses },
});

const simReset = createRoute({
  method: "post",
  path: "/sim/reset",
  tags: ["Simulator"],
  summary: "Reset every machine to its day-one shelves",
  responses: { 200: json(Ok, "Reset") },
});

// ------------------------------------------------------------- app

export function createApp({ fleet, cloud, touchscreen, config }: Deps) {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json({ error: { code: MachineErrorCode.Invalid, message: describeZodError(result.error) } }, 400);
      }
    },
  });

  app.onError((err, c) => {
    if (err instanceof DomainError) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    if (err instanceof ZodError) {
      return c.json({ error: { code: MachineErrorCode.Invalid, message: describeZodError(err) } }, 400);
    }
    console.error("[http] unexpected error", err);
    return c.json({ error: { code: "internal", message: "Internal error" } }, 500);
  });

  app.openAPIRegistry.registerComponent("securitySchemes", "ApiKey", {
    type: "apiKey",
    in: "header",
    name: API_KEY_HEADER,
  });

  app.use("/api/v1/*", async (c, next) => {
    if (c.req.header(API_KEY_HEADER) !== config.MACHINE_API_KEY) {
      return c.json({ error: { code: MachineErrorCode.Unauthorized, message: "Missing or invalid API key" } }, 401);
    }
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true, machines: fleet.list().length, cloudReachable: cloud.online }));

  // Machine API
  app.openapi(listMachines, (c) => c.json(fleet.list(), 200));
  app.openapi(getInventory, (c) => c.json(fleet.inventory(c.req.valid("param").machineId), 200));
  app.openapi(createHold, (c) => {
    const { machineId } = c.req.valid("param");
    return c.json(fleet.createHold(machineId, c.req.valid("json")), 201);
  });
  app.openapi(releaseHold, (c) => {
    const { machineId, holdId } = c.req.valid("param");
    return c.json(fleet.releaseHold(machineId, holdId), 200);
  });
  app.openapi(vend, (c) => {
    const { machineId } = c.req.valid("param");
    const result = fleet.vendHold(machineId, c.req.valid("json").holdId, { channel: "courier" });
    return c.json(result, 200);
  });
  app.openapi(setNotice, (c) => {
    const { machineId } = c.req.valid("param");
    return c.json(fleet.update(machineId, { notice: c.req.valid("json").message }), 200);
  });

  // Simulator controls
  app.openapi(simScan, async (c) => {
    const session = await touchscreen.scan(c.req.valid("param").machineId, c.req.valid("json").code);
    return c.json(pickSession(session), 200);
  });
  app.openapi(simPay, async (c) => {
    const session = await touchscreen.pay(c.req.valid("param").sessionId, c.req.valid("json").method);
    return c.json(pickSession(session), 200);
  });
  app.openapi(simCancel, (c) => c.json(pickSession(touchscreen.cancel(c.req.valid("param").sessionId)), 200));
  app.openapi(simWalkUp, (c) => {
    const { slot, method } = c.req.valid("json");
    fleet.walkUp(c.req.valid("param").machineId, slot, method);
    return c.json({ ok: true as const }, 200);
  });
  app.openapi(simRestock, async (c) => {
    const body = RestockBody.parse(await c.req.json().catch(() => ({})));
    fleet.restock(c.req.valid("param").machineId, body.slot);
    return c.json({ ok: true as const }, 200);
  });
  app.openapi(simPatch, (c) => c.json(fleet.update(c.req.valid("param").machineId, c.req.valid("json")), 200));
  app.openapi(simReset, (c) => {
    fleet.reset();
    return c.json({ ok: true as const }, 200);
  });

  // Touchscreen UI state + live stream
  app.get("/sim/state", (c) => c.json(uiState({ fleet, cloud, touchscreen, config })));
  app.get("/sim/stream", (c) =>
    streamSSE(c, async (stream) => {
      let pending: NodeJS.Timeout | null = null;
      const notify = () => {
        pending ??= setTimeout(() => {
          pending = null;
          void stream.writeSSE({ event: "refresh", data: String(Date.now()) });
        }, 80);
      };
      fleet.on("changed", notify);
      touchscreen.on("changed", notify);
      cloud.on("log", notify);
      let open = true;
      stream.onAbort(() => {
        open = false;
        fleet.off("changed", notify);
        touchscreen.off("changed", notify);
        cloud.off("log", notify);
        if (pending) clearTimeout(pending);
      });
      await stream.writeSSE({ event: "refresh", data: "hello" });
      while (open) {
        await stream.sleep(20_000);
        if (open) await stream.writeSSE({ event: "ping", data: "" });
      }
    }),
  );

  // Docs
  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "The Fridge — Machine API (simulator)",
      version: "1.0.0",
      description:
        "What a The Fridge vending machine exposes to the cloud. `/api/v1/*` needs the `x-api-key` header. " +
        "The machine pushes HMAC-signed webhooks to the cloud (`POST {CLOUD_URL}/api/machine/v1/events`) and calls " +
        "`POST {CLOUD_URL}/api/machine/v1/redeem` when its scanner reads a pickup QR. `/sim/*` drives the simulated touchscreen.",
    },
  });
  app.get("/docs", swaggerUI({ url: "/openapi.json" }));

  // jsQR for the camera scanner, served from node_modules
  const jsqrSource = readFileSync(createRequire(import.meta.url).resolve("jsqr"), "utf8");
  app.get("/vendor/jsqr.js", (c) => c.body(jsqrSource, 200, { "content-type": "text/javascript; charset=utf-8" }));

  // The touchscreen UI: always revalidate so edits show up immediately.
  app.use("/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-cache");
  });
  app.use("/*", serveStatic({ root: "./public" }));
  return app;
}

function pickSession(session: { id: string; machineId: string; code: string; status: string; message: string }) {
  const { id, machineId, code, status, message } = session;
  return { id, machineId, code, status, message };
}

function describeZodError(error: ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

function uiState({ fleet, cloud, touchscreen, config }: Deps) {
  const now = Date.now();
  return {
    cloudUrl: config.CLOUD_URL,
    cloudReachable: cloud.online,
    pendingWebhooks: cloud.pending,
    webhooks: cloud.log.slice(0, 25),
    machines: fleet.snapshot.machines.map((m) => ({
      ...fleet.summary(m),
      slots: m.slots.map((s) => {
        const product = s.sku ? PRODUCT_BY_SKU.get(s.sku) : undefined;
        const held = m.holds
          .filter((h) => h.status === "active")
          .flatMap((h) => h.items)
          .filter((i) => i.sku === s.sku)
          .reduce((sum, i) => sum + i.qty, 0);
        return {
          ...s,
          category: product?.category ?? null,
          layers: product?.art.layers ?? [],
          accent: product?.art.accent ?? null,
          heldForSku: held,
          expiringSoon: Boolean(s.expiresAt && Date.parse(s.expiresAt) - now < 6 * 60 * 60 * 1000),
        };
      }),
      holds: m.holds
        .filter((h) => h.status === "active")
        .map((h) => ({ ...h, items: h.items.map((i) => ({ ...i, name: PRODUCT_BY_SKU.get(i.sku)?.shortName ?? i.sku })) })),
      recentVends: fleet.recentVends(m.id).map((v) => ({
        ...v,
        items: v.items.map((i) => ({ ...i, name: PRODUCT_BY_SKU.get(i.sku)?.shortName ?? i.sku })),
      })),
      session: touchscreen.latest(m.id),
    })),
  };
}
