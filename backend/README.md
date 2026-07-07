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

## Project Structure

```
src/
├── index.js              # App entry — mounts all routes
├── api/
│   ├── health.js         # Health check
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
```

`/health` is a process liveness check. `/ready` verifies both MongoDB and Redis and returns `503` when either dependency is unavailable.

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

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with nodemon (hot reload) |
| `npm start` | Production start |
| `npm test` | Run the isolated integration test suite |
| `npm run seed` | Upsert sample products into MongoDB without deleting existing products |
| `npm run make-admin <email>` | Promote a registered user to admin |
