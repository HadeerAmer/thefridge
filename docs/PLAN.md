# The Fridge — Demo App Plan

Demo (MVP) of a customer app, an admin dashboard and a simulated vending fridge for
**The Fridge** (@thefridge.eg) — healthy, made-fresh-daily food sold from smart fridges in
Egypt. The deck's technical choices were ignored on purpose; everything below is our own design.

---

## 1. What the sources told us

| Source | What we took from it |
|---|---|
| **Deck** (17 slides) | Wallet-first payments, live stock per machine, 10–15 min holds, dispense after payment, cross-fridge search + "notify me", streaks/points/passes, happy hours & combos, expiry markdowns, temperature alerts, refunds for stuck items, product voting, admin panel, phase-2 driver port. |
| **Instagram** | Brand voice: *"Always a good cal(l)"*, *"Good calories for life on the go. Made fresh, every single day."* Current menu + prices (EGP 110–185). Real label macros for 6 salads. Locations: Capital Business Park (Sheikh Zayed), Coventry University / The Knowledge Hub (New Capital), MIU, MSA + seasonal Sahel sites. Delivery via Noon Minutes. Machine notices (power outage). "Order 2 products → free tote". Products are jars in numbered machine slots. |
| **Linktree** | Instagram, WhatsApp, Talabat (menu hidden), online store (Shopify, currently offline). |

**Brand system used in the app:** forest green `#1F5A34`, warm cream `#F7F1E8`, tomato red
`#E2481F`, sunny yellow `#F6C62F`, leaf/lime `#A9C46C`, orange `#F26B21`, sky blue `#2D6CB5`
(the machine awning). Type: condensed display (Anton) for headlines and prices, a rounded
chunky face (Lilita One) for the wordmark, DM Sans for UI, Caveat for the hand-written
"good cal(l)" accents. Motifs: sticker badges (FRESH DAILY / HIGH PROTEIN), hand-drawn
underlines, the fridge mascot, layered salad jars with green lids.

---

## 2. Product principles

1. **Browse first, sign in later.** The menu, live stock, map and AI are open to guests. Sign-in
   (phone + OTP, demo code shown) is asked only when you reserve or pay.
2. **Fewest taps.** Reserve from the product card in one tap; wallet is the default payment;
   "Your usual" reorders in one tap; the pickup QR is pinned to the top of Home.
3. **Stock you can trust.** Counts come live from the machine; a reservation is a real hold on
   the machine, so nobody else can buy that unit.
4. **Progress on open.** Home starts with today's macros, streak, points-to-next-reward and any
   active pickup.

---

## 3. Architecture

```
 ┌──────────────────────────────┐   REST + x-api-key   ┌───────────────────────────────┐
 │  apps/web  (Next.js 15)      │ ───────────────────▶ │  apps/fridge-sim  (Hono)      │
 │  • Customer app (mobile PWA) │   holds, vend,       │  • Machine API  /api/v1/*     │
 │  • Admin dashboard  /admin   │   inventory, notice  │  • OpenAPI docs /docs         │
 │  • Cloud API        /api/*   │                      │  • Machine UI (touchscreen,   │
 │  • MongoDB via Mongoose      │ ◀─────────────────── │    QR scanner, card reader)   │
 │  • SSE stream for live data  │  signed webhooks     │  • State persisted to JSON    │
 └──────────────┬───────────────┘  (HMAC-SHA256) +     └───────────────────────────────┘
                │ SSE              QR redeem calls
        phones / browsers          packages/shared ← zod contracts + fixtures used by both
```

- **Machine is the source of truth for physical units.** The cloud keeps a projection
  (`onHand`, `held`) updated from machine webhooks and re-synced on start.
- **Cloud → machine:** REST with an API key (create/release holds, remote vend for couriers,
  notices). **Machine → cloud:** HMAC-signed webhooks with timestamp + event id (replay-safe,
  idempotent) and the QR redeem call.
- **Cloud → clients:** Server-Sent Events. One stream carries stock changes and the signed-in
  user's order/loyalty updates.
- **Background jobs** (`instrumentation.ts`): expire overdue holds, run delivery auto-dispatch,
  re-sync stock.

### Code layout

```
packages/shared      zod contracts for the machine API + webhooks, HMAC signing, fixtures
apps/fridge-sim      src/domain (machine model, holds, vend), src/http (routes, OpenAPI),
                     src/webhooks (signed delivery + retry), public/ (machine UI)
apps/web
  scripts/seed.ts    seeds MongoDB (refuses any database not named *_demo)
  src/server/        domain services — no React here
    catalog, inventory, orders, pricing, payments, wallet, loyalty, nutrition,
    delivery, assistant, machines (gateway), notifications, settings, auth, events (SSE bus)
  src/app/(app)/     customer screens      src/app/admin/   admin screens
  src/app/api/       thin route handlers: parse (zod) → service → JSON
  src/components/    ui primitives + feature components
```

Rules: route handlers are thin; business rules live in `src/server/*` and are pure where
possible (pricing, loyalty, nutrition goals are unit-tested); all inputs are zod-validated;
money is integer piasters; the wallet is a ledger; orders carry an idempotency key.

---

## 4. Core flows

**Reserve → collect (pay in app or at the fridge)**
1. Tap *Reserve* → cloud prices the cart, charges the wallet (or marks *pay at fridge*),
   then asks the machine to hold the units for the admin-configured window (default 15 min).
2. Machine hold fails → order fails and the wallet is refunded (compensation).
3. App shows a countdown + QR. At the fridge the scanner reads it → machine calls
   `POST /api/machine/v1/redeem` → gets items + amount due.
4. Amount due > 0 → machine shows "Tap card" → payment reported to cloud → vend.
5. `vend.completed` webhook → order completed → points, streak, stamp card, macros logged →
   pushed live to the phone ("Enjoy! +170 pts · 4-day streak").
6. Not collected in time → machine releases the hold, cloud expires the order and refunds.

**Walk-up purchase at the machine** → stock drops → every open app updates live.

**Delivery** → nearest fridge that has every item → hold (longer window) → driver assigned
(admin or auto-dispatch) → driver collects at the machine (remote vend) → on the way (live map)
→ delivered → points + macros.

**Something went wrong** → "Item didn't drop" → issue → admin refunds to wallet in one click.

---

## 5. Customer app — MVP scope

| Screen | Highlights |
|---|---|
| Home | Progress card (macro rings, streak week, points bar), active pickup banner, nearest fridge chip, AI ask bar, category chips, "Your usual", Fresh-saver deals, live menu grid |
| Product | Jar art, label macros (or "estimated"), ingredients, allergens, tags, which fridges have it (distance + units), notify me, reserve |
| Fridges | Interactive map (Leaflet/OSM), nearest-first list, live stock, notices, open in Google Maps |
| Checkout | Pickup or delivery, wallet / card (sandbox) / pay at fridge / cash on delivery, combo suggestion, app-only price |
| Orders | Live status, QR + countdown, delivery tracking map, report an issue |
| Rewards | Points, tier, streak, stamp card, rewards catalog, referral code |
| Nutrition | Today vs goal, 7-day chart, diary (auto-logged from pickups), add manually |
| Profile | Body stats → goal macros (Mifflin-St Jeor), diet prefs, allergens, addresses, student status, wallet |
| Ask The Fridge | AI text box: "30 g protein under 150 EGP near me" → picks with live stock, reserve in a tap. OpenAI or Claude when a key is set, otherwise a built-in rules engine |

## 6. Ideas added to drive sales and improve UX

1. **App-only price** (machine price vs cheaper app price) — pulls walk-up buyers into the app.
2. **Fresh-saver markdowns** — automatic discount as items near expiry; less waste.
3. **Happy hour** — off-peak discount window set by the admin.
4. **Smart combos** — "Add a Tropical Lemonade, save EGP 20" at checkout.
5. **Your usual** — one-tap reorder of your most frequent item at your usual fridge.
6. **Goal-aware picks** — "You need 32 g more protein today → Chicken Caesar, 4 left at MIU".
7. **Cross-fridge search + notify me** — sold out here? See who has it, or get an alert.
8. **Streaks that fit Egypt** — Friday/Saturday don't break a streak ("Weekend plans? Do not disturb").
9. **Stamp card** — every 10th meal is on us (credited to the wallet).
10. **Machine notices** — outages and seasonal closures shown before you walk there.
11. **Product requests & votes** — guides the next restock.

Later: subscriptions/lunch pass, scheduled pre-orders, Arabic + RTL, Apple Health/Google Fit,
push notifications, group/office orders.

---

## 7. Admin dashboard plan

**Built in the MVP**
- **Overview** — orders, revenue, active holds, machines online, low-stock + temperature alerts, live event feed, sales by hour.
- **Machines** — live slot grid per machine, temperature, status, notices, re-sync.
- **Orders & delivery** — all orders with filters; delivery board (placed → assigned → picked up → on the way → delivered), assign driver, advance.
- **Products & pricing** — price, macros, tags, active/inactive.
- **Customers** — wallet, points, tier, streak, orders; manual credit.
- **Settings** — reservation window (minutes), max active reservations, delivery hold, points per EGP, streak milestones, stamp card, app discount, happy hour, fresh-saver, student discount, delivery fee/radius, auto-dispatch.
- **Feedback** — issue reports with one-click refund; product requests by votes.

**Next phase:** demand forecasting per machine/hour, restock route planning, role-based access
+ audit log, automatic temperature lockout rules, A/B pricing, CSV exports, partner/venue portal.

---

## 8. Stack

| Concern | Choice | Why |
|---|---|---|
| App + API | Next.js 15 (App Router), React 19, TypeScript strict | One deployable for app, admin and API; server components for fast first paint |
| Styling | Tailwind CSS 4 with brand tokens | Fast to build a consistent design system |
| Data | MongoDB 8 (replica set) + Mongoose 8 | Documents fit the reads (stock embedded per machine, items per order); `$geoNear` for nearest fridge; multi-document transactions for wallet + orders; TTL index for the webhook inbox |
| Client state | TanStack Query (server data), Zustand (cart) | Cache + optimistic UI; cart works without login |
| Realtime | SSE | Simple, one-way, works through proxies |
| Maps | Leaflet + react-leaflet, CARTO/OSM tiles | No API key |
| Fridge simulator | Hono + @hono/zod-openapi + Swagger UI | Small device-style service with documented API |
| Contracts | zod 4 in `packages/shared` | Same schemas validate both sides of the machine integration |
| Auth | Phone + OTP (demo), JWT cookie (jose) | Familiar in Egypt; no passwords |
| AI | Pluggable: OpenAI (`openai`) or Claude (`@anthropic-ai/sdk`) with the same read-only tools; built-in rules engine as fallback | Pick a provider by API key; works offline for demos |
| Tests | Vitest for pricing, loyalty, nutrition, signing | Business rules are the risky part |

## 9. Assumptions for the demo

- Payments run on a sandbox provider behind a `PaymentProvider` interface (Paymob/Fawry would plug in there).
- OTP is fixed and shown on screen; no SMS.
- Macros: six salads use The Fridge's published labels; others are estimates and marked as such.
- Product images are drawn (SVG jars, wraps, bowls) — no photos were copied.
- One process each; production would add MongoDB Atlas, Redis pub/sub for SSE fan-out and a job queue.
