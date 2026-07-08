# medkit-backend

REST API backend for medical kit product management and online checkout. Built with Node.js + Express, MongoDB, Redis, and Stripe.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ESM) |
| Web Framework | Express 5 |
| Database | MongoDB (Mongoose) |
| Cache | Redis (ioredis) |
| Payments | Stripe Checkout |
| Auth | JWT + bcrypt |
| Validation | Zod |
| Security | Helmet, CORS, express-rate-limit |
| Observability | Request IDs, JSON request logs, in-memory latency metrics |

## Project Structure

```
src/
├── index.js              # App entry — mounts all routes
├── api/
│   ├── health.js         # Health check
│   ├── metrics.js        # Request metrics
│   ├── auth.js           # Register / login
│   ├── products.js       # Product CRUD (admin only for writes)
│   ├── quote.js          # Price quote (no persistence)
│   ├── orders.js         # Order creation and Stripe checkout
│   └── webhook.js        # Stripe webhook handler
├── models/
│   ├── User.js           # User model (role: user | admin)
│   ├── Product.js        # Product model (BASE | ADDON)
│   └── Order.js          # Order model
├── schemas/
│   ├── auth.js           # Register / login validation
│   ├── product.js        # Product input validation
│   ├── quote.js          # Quote input validation
│   └── order.js          # Order input validation
├── lib/
│   ├── mongo.js          # MongoDB connection
│   ├── redis.js          # Redis client
│   ├── stripe.js         # Stripe client
│   └── pricing.js        # Snapshot prices, stock check, build order items
└── middlewares/
    ├── auth.js           # requireAuth / requireAdmin middleware
    ├── observability.js  # request IDs, request logs, latency metrics
    └── validate.js       # Zod validation middleware
scripts/
├── seed.js               # Seed test products
└── make-admin.js         # Promote a user to admin role
```

## Getting Started

### 1. Start dependencies

```bash
brew services start mongodb-community
brew services start redis
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```env
PORT=4000
MONGO_URI=mongodb://localhost:27017/medkit
REDIS_URL=redis://localhost:6379
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
CLIENT_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
AUTO_SEED_PRODUCTS=true
REQUEST_LOGS=true
SLOW_REQUEST_MS=500
# METRICS_TOKEN=optional_metrics_read_token
JWT_SECRET=your_strong_random_secret
```

`MONGODB_URI` is also supported as an alias for `MONGO_URI`, and `FRONTEND_URL`
is supported as a fallback for `CLIENT_URL` when deploying to platforms that use
that naming convention.

`CLIENT_URL` is the single public frontend URL used for Stripe redirects.
`ALLOWED_ORIGINS` is a comma-separated browser allowlist and may contain both
local and deployed frontend origins during development.
When `AUTO_SEED_PRODUCTS` is not set to `false`, an empty products collection is
seeded with demo products on startup. Existing products are never deleted or
overwritten by the startup seed.

### 3. Install and run

```bash
npm install
npm run seed        # upsert sample products without deleting existing products
npm run dev         # development with hot reload
```

### 4. Create an admin user

```bash
# Register a user via the API first, then:
npm run make-admin your@email.com
```

## API Reference

### Auth

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/api/auth/register` | Create account, returns JWT | — |
| `POST` | `/api/auth/login` | Login, returns JWT | — |

Rate limited to 10 requests per 15 minutes per IP.

Register / login body:
```json
{ "email": "user@example.com", "password": "12345678" }
```

All protected endpoints require the header:
```
Authorization: Bearer <token>
```

### Health

```
GET /health
GET /ready
GET /metrics
```

`/health` is a process liveness check. `/ready` verifies both MongoDB and Redis and returns `503` when either dependency is unavailable.

`/metrics` returns process-local request counters, status-code distribution,
latency percentiles, route-level latency, and the latest slow requests. It does
not include request bodies, auth tokens, or customer data. Set `METRICS_TOKEN`
to require `Authorization: Bearer <token>` or `x-metrics-token: <token>`.

Every response includes an `x-request-id` header. If the client sends
`x-request-id`, the API preserves it; otherwise it generates one. Error
responses include the same `requestId` so production logs can be matched to a
customer-facing failure.

### Products

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/products` | List products (`?type=BASE\|ADDON&active=true\|false`) | — |
| `GET` | `/api/products/:sku` | Get by SKU (Redis-cached, 5 min TTL) | — |
| `POST` | `/api/products` | Create product | Admin |
| `PATCH` | `/api/products/:id` | Update product | Admin |
| `DELETE` | `/api/products/:id` | Delete product | Admin |

Product types:
- `BASE` — main kit product
- `ADDON` — accessory with configurable quantity

### Quote

```
POST /api/quote
```

Returns a price breakdown without creating an order. Results cached in Redis by product catalog version (10-minute TTL) — any product change automatically invalidates stale quotes.

Request:
```json
{
  "bases": [
    { "sku": "BASE-AVP-01", "quantity": 1 }
  ],
  "addons": [
    { "sku": "ADD-MIC-PRO", "quantity": 1 },
    { "sku": "ADD-BATT-XL", "quantity": 2 }
  ]
}
```

### Orders

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/api/orders` | Create order (snapshots prices, checks stock) | User |
| `GET` | `/api/orders` | List current user's orders | User |
| `GET` | `/api/orders/:id` | Get order by ID (owner only) | User |
| `POST` | `/api/orders/:id/checkout` | Create Stripe Checkout Session | User |

Order statuses: `pending` → `paid` / `cancelled`

Checkout response:
```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/..."
}
```

### Stripe Webhook

```
POST /api/webhooks/stripe
```

Inventory is atomically reserved before Stripe Checkout is created.

- `checkout.session.completed` updates the order from `pending` to `paid` (idempotent)
- `checkout.session.expired` cancels the order and releases its reserved inventory
- Both inventory reservation and release invalidate affected Redis caches

For local testing:
```bash
stripe listen --forward-to localhost:4000/api/webhooks/stripe
```

## Data Models

### User

| Field | Type | Notes |
|-------|------|-------|
| `email` | String | Unique, lowercased |
| `passwordHash` | String | bcrypt, never stored in plain text |
| `role` | `user` \| `admin` | Defaults to `user` |

### Product

| Field | Type | Notes |
|-------|------|-------|
| `sku` | String | Unique, indexed |
| `name` | String | |
| `type` | `BASE` \| `ADDON` | |
| `price` | Number | USD cents-free (e.g. 2999 = $29.99 is wrong — 2999 = $2,999) |
| `version` | String | Defaults to `1.0.0` |
| `stock.total` | Number | Physical inventory count |
| `stock.reserved` | Number | Units held in Checkout or sold; available = total − reserved |
| `active` | Boolean | Defaults to `true` |

### Order

| Field | Type | Notes |
|-------|------|-------|
| `userId` | ObjectId | Reference to User |
| `items` | Array | Price snapshot at order time (sku, name, type, price, quantity, subtotal) |
| `total` | Number | Sum of all subtotals |
| `currency` | String | Defaults to `USD` |
| `status` | `pending` \| `paid` \| `cancelled` | |
| `stripeSessionId` | String | Set after checkout session is created |
| `inventoryReserved` | Boolean | Prevents duplicate Checkout inventory reservations |

## Caching Strategy

| Data | TTL | Invalidation |
|------|-----|-------------|
| Product by SKU | 5 min | Explicit `DEL` on PATCH / DELETE / stock update |
| Quote results | 10 min | Versioned key (`quote:v2:p{N}:...`) — `INCR product:version` makes old keys unreachable |

## Testing

MongoDB and Redis must be running. Tests use a temporary MongoDB database, clean it up automatically, and do not make live Stripe API calls.

```bash
npm test
```

The integration suite includes concurrency checks for the inventory path:

- direct concurrent reservations can only reserve available stock
- concurrent HTTP checkout requests cannot oversell a low-stock SKU
- failed checkout attempts reset `inventoryReserved` so the order is not left stuck
- completed and expired Stripe webhooks are idempotent and do not double-count stock
- observability middleware assigns request IDs and exposes request metrics

## Production Readiness

The backend includes lightweight production-readiness instrumentation without
adding an external monitoring service:

- `x-request-id` response headers for request tracing
- structured JSON request logs controlled by `REQUEST_LOGS`
- centralized 5xx error logs with matching request IDs
- `/health` for liveness and `/ready` for MongoDB/Redis readiness
- `/metrics` for aggregate request counts, status codes, latency percentiles,
  route timing, and recent slow requests

For public deployments, set `METRICS_TOKEN` so `/metrics` is available to you
without exposing operational details to anonymous traffic.

Production observability was verified on 2026-07-07 against the Render API:

- anonymous `GET /metrics` returned `401`
- authenticated `GET /metrics` with `METRICS_TOKEN` returned runtime request
  counters, status-code distribution, route timing, and latency percentiles
- the metrics response does not include request bodies, auth tokens, or
  customer data

Example verification command:

```bash
curl -H "Authorization: Bearer $METRICS_TOKEN" \
  https://medical-kit-store-api.onrender.com/metrics
```

If a local result looks impossible, confirm the API process before trusting the
port:

```bash
lsof -nP -iTCP:4000 -sTCP:LISTEN
```

## Performance Checks

The backend includes zero-dependency Node scripts for repeatable benchmark and
load-test runs against a live local or deployed API. Start MongoDB, Redis, and
the backend first, then seed products if the database is empty.

```bash
npm run dev
npm run seed
```

Run a short cache-focused benchmark:

```bash
npm run benchmark -- --url http://127.0.0.1:4000 --iterations 200 --warmup 20
```

The benchmark prints JSON with request counts, success counts, RPS, min, p50,
p95, max, and status counts for:

- `product-cache-hit` — repeated `GET /api/products/:sku`
- `quote-cache-hit` — repeated `POST /api/quote` with the same cart

Run a load test:

```bash
npm run load:test -- --url http://127.0.0.1:4000 --scenario quote --duration 30 --concurrency 20
```

For free-tier deployed services, keep production checks light and quote-only.
Avoid `order-create` against production unless the database is disposable,
because it writes persistent users/orders and can consume backend, database, and
Redis quotas quickly.

Supported scenarios:

| Scenario | What it exercises |
|----------|-------------------|
| `quote` | Price calculation, product lookup, Redis quote cache |
| `order-create` | Authenticated order creation and stock validation without hitting Stripe |
| `mixed-read` | Product list and cached product detail reads |

These scripts intentionally avoid live Stripe Checkout calls. Checkout
oversell protection is verified in `npm test`, where Stripe is stubbed and the
HTTP checkout route is exercised concurrently.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with nodemon (hot reload) |
| `npm start` | Production start |
| `npm test` | Run the isolated integration test suite |
| `npm run benchmark` | Run cache-focused latency benchmarks against a live API |
| `npm run load:test` | Run configurable load scenarios against a live API |
| `npm run smoke:prod` | Run deployed API smoke checks using `API_BASE_URL` |
| `npm run seed` | Upsert sample products into MongoDB without deleting existing products |
| `npm run make-admin <email>` | Promote a registered user to admin |
