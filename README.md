# The Fridge — demo app

A working MVP for **The Fridge** (@thefridge.eg): healthy food from smart fridges in Egypt.

| | What | URL |
|---|---|---|
| 📱 | **Customer app** — browse without an account, live stock, map, one-tap reserve, QR pickup, wallet, delivery, loyalty, macros, AI assistant | http://localhost:3000 |
| 📊 | **Admin dashboard** — live KPIs and feed, machines & stock, orders, delivery board, prices, customers, refunds, settings | http://localhost:3000/admin |
| 🧊 | **Fridge simulator** — the "real" vending machines: touchscreen with QR scanner + card reader, walk-up sales, temperature, notices | http://localhost:4000 |
| 📖 | **Machine API docs** (OpenAPI / Swagger) | http://localhost:4000/docs |

The plan, research notes and design decisions are in [docs/PLAN.md](docs/PLAN.md).

---

## Run it

Requirements: **Node 20.9+** and **MongoDB running as a replica set** (transactions need one — a local `replSetName: rs0` like the one on this machine, or MongoDB Atlas).

```bash
npm install
npm run setup     # seeds MongoDB (database "thefridge_demo") + resets the simulator
npm run dev       # starts the simulator (:4000) and the app (:3000) together
```

Configuration lives in `apps/web/.env` (copy from `.env.example`) and `apps/fridge-sim/.env.example`. Defaults work out of the box.
The seed script only ever touches a database whose name ends in `_demo`.

**AI assistant:** put an `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`) in `apps/web/.env`. Without a key, "Ask The Fridge" uses a built-in rules engine, so the demo works offline too.

**Demo sign-in:** on the sign-in screen use *Continue as Nour (demo customer)* or *Open the admin dashboard*. Any Egyptian mobile number also works with the demo code `1234`.

---

## A 5-minute demo

1. Open the app as a guest: the menu, live stock and map work without an account.
2. Sign in as **Nour**. Home now opens with today's macros, a 4-day streak (Fri/Sat are rest days) and points to the next reward.
3. Open **Crab Salad** → **Reserve**. It's paid from the wallet and held in the fridge for 15 min. You get a QR + countdown.
4. Tap **"I'm at the fridge — simulate the scan"** (or type the code / show the QR to the camera at http://localhost:4000). The fridge dispenses, and the phone celebrates: points, streak, macros logged.
5. Reserve something with **Pay at the fridge**, scan it in the simulator and tap **Tap card** on its screen.
6. In the simulator, **buy at the machine** (tap a slot). Watch the "N left" badge drop in the app instantly.
7. Drag the simulator's temperature above 8 °C: the machine pauses sales and the app and admin show it.
8. Checkout with **Delivery**: a courier is assigned, collects at the fridge (remote vend) and drives to you on a live map.
9. Open **/admin**: live feed, delivery board, refunds, and **Settings → Hold reserved items for 15 minutes**.
10. **Ask The Fridge**: "30 g protein under EGP 160".

---

## Architecture

```
 apps/web  (Next.js 15)                         apps/fridge-sim  (Hono)
 ├─ customer app (mobile PWA)    REST + API key  ├─ machine API  /api/v1/*   (holds, vend, inventory, notice)
 ├─ admin dashboard  /admin   ─────────────────▶ ├─ OpenAPI docs /docs
 ├─ cloud API  /api/*                            ├─ touchscreen UI + QR scanner + card reader
 ├─ MongoDB (Mongoose)        ◀───────────────── └─ state in .data/state.json
 └─ SSE /api/stream → phones    HMAC-signed webhooks + QR redeem calls
                       packages/shared — zod contracts, request signing, fixtures
```

- **The machine owns physical stock.** The cloud keeps a projection (`onHand`, `held`) updated from webhooks and re-synced on start. A reservation is a real **hold** on the machine, so walk-up buyers can't take a reserved item.
- **Reserve flow (saga):** hold units on the machine → charge the card (if paying by card) → one MongoDB transaction writes the order and debits the wallet. If any step fails, the earlier steps are undone (hold released, card refunded).
- **Machine → cloud** traffic is HMAC-SHA256 signed with a timestamp (replay-safe). Every webhook has an event id that is recorded in a TTL-indexed inbox, so duplicates are ignored.
- **Live updates** go over Server-Sent Events: stock for everyone, orders and notifications per user, an activity feed for admins.
- **Background jobs** expire overdue holds (with refunds), run the delivery autopilot and re-sync the fleet.

### Code map

```
packages/shared/src/
  contracts/   zod schemas for the machine API, webhook events, QR redeem
  signing.ts   HMAC request signing/verification
  fixtures/    real menu (26 items, 6 with label macros), 7 real locations, shelf layouts
apps/fridge-sim/src/
  domain/fleet.ts   machine rules: holds, FEFO vending, walk-up, temperature lock
  cloud.ts          in-order webhook outbox with retry + signed redeem/payment calls
  touchscreen.ts    scan → pay → dispense sessions
  http/app.ts       OpenAPI routes + simulator controls + SSE
apps/web/src/
  server/      business logic (no React): orders, pricing, wallet, payments, loyalty,
               nutrition, delivery, inventory, assistant, machines, realtime, settings
  app/api/     thin route handlers: validate (zod) → service → JSON
  app/(app)/   customer screens          app/admin/   admin screens + server actions
  components/  ui primitives, brand (logo, mascot, drawn products), app widgets
```

### Data model (MongoDB)

`users` (profile, goals, addresses, cached wallet + loyalty) · `products` · `machines` (GeoJSON location with a `2dsphere` index, embedded stock) · `orders` (embedded items, payment, hold, delivery, timeline) · `wallet_transactions` and `points_transactions` (append-only ledgers) · `payments` · `nutrition_logs` · `rewards` / `reward_redemptions` · `stock_alerts` · `notifications` · `issues` · `product_requests` · `drivers` · `machine_events` (webhook inbox, TTL) · `settings`.

Money is stored as integer piasters. Dates are reasoned about in Africa/Cairo time.

---

## Features

**Customer app:** guest browsing · nearest fridge (geolocation + `$geoNear`) · interactive map · live "N left" badges · diet/macro filters · product page with label-style nutrition facts and per-fridge availability · one-tap reserve (wallet or pay at the fridge) · QR + countdown · cart & checkout (pickup or delivery; wallet, card, pay at fridge, cash) · delivery tracking map · wallet top-up (card, InstaPay, Fawry, mobile wallet — sandbox) · points, tiers, streaks, stamp card, rewards, referral codes · nutrition diary auto-logged on pickup · goals from body stats · allergy warnings · student discount · notify-me alerts · issue reports with wallet refunds · product voting · AI assistant.

**Sales and UX ideas included:** app-only price · fresh-saver markdowns near expiry · happy hour · main + drink combo · "your usual" one-tap reorder · goal-aware picks ("you're 38 g short on protein") · cross-fridge search · weekend-proof streaks · machine notices before you walk there.

**Admin:** live KPIs and activity feed · machine alerts · restock list · top sellers · per-machine stock with notices and re-sync · orders · delivery board · price editing / hide from menu · customers + wallet credit · issues with one-click refunds · product requests · all business settings (reservation hold time, promos, loyalty, delivery).

---

## Testing

```bash
npm test          # unit tests: pricing, loyalty/streaks, nutrition goals, request signing, machine holds/vending
npm run typecheck
```

## Demo vs. production

| In the demo | For production |
|---|---|
| Sandbox payment provider (test cards `4242…` approve, `4000 0000 0000 0002` declines) | Paymob / Fawry / InstaPay behind the same `PaymentProvider` interface |
| Fixed OTP, shown on screen | SMS OTP provider + rate limiting |
| In-process SSE bus and jobs | Redis pub/sub for multiple instances, a job queue with locks |
| Simulated machines | The vending controller implements the same machine API + webhooks |
| Drawn product images | Real product photography |
| English only | Arabic + RTL (copy is kept in components; ready to extract) |

