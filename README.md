# MedKit Store

[![CI](https://github.com/ZhiqiaoGong/medkit-store/actions/workflows/ci.yml/badge.svg)](https://github.com/ZhiqiaoGong/medkit-store/actions/workflows/ci.yml)

Full-stack medical kit commerce app with an inventory-safe checkout flow.

The project is built as a realistic storefront plus API system: customers can
configure medical kits, get live quotes, create authenticated orders, and enter
Stripe Checkout while the backend protects inventory from overselling under
concurrent demand.

## Highlights

- Next.js storefront with product configuration, live quote updates, auth,
  order creation, and checkout result pages
- Express API with JWT auth, Zod validation, MongoDB persistence, Redis caching,
  and Stripe Checkout integration
- Atomic inventory reservation before checkout session creation
- Idempotent Stripe webhook handling for completed and expired sessions
- Integration tests that cover checkout authorization, inventory reservation,
  webhook behavior, and concurrent oversell protection
- Repeatable benchmark and load-test scripts for API latency and throughput

## Architecture

```text
frontend/ Next.js app
  |
  | REST API calls
  v
backend/ Express API
  |-- MongoDB: users, products, orders
  |-- Redis: product and quote cache
  `-- Stripe: Checkout sessions and webhooks
```

Deployment is split by service:

| Component | Runtime |
|-----------|---------|
| Frontend | Vercel-hosted Next.js app |
| Backend | Railway-hosted Express API |
| Database | MongoDB Atlas |
| Cache | Railway Redis |
| Payments | Stripe test mode |

See [DEPLOYMENT.md](DEPLOYMENT.md) for the deployment environment contract.

## Project Structure

```text
backend/       Express API, data models, checkout workflow, tests, perf scripts
frontend/      Next.js storefront and order pages
DEPLOYMENT.md  Production deployment notes
```

Detailed service docs:

- [Backend README](backend/README.md)
- [Frontend README](frontend/README.md)

## Run Locally

Start MongoDB and Redis:

```bash
brew services start mongodb-community
brew services start redis
```

Start the backend:

```bash
cd backend
cp .env.example .env
npm install
npm run seed
npm run dev
```

Start the frontend in another terminal:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validation

Backend:

```bash
cd backend
npm test
npm run benchmark -- --url http://127.0.0.1:4000 --iterations 200 --warmup 20
npm run load:test -- --url http://127.0.0.1:4000 --scenario quote --duration 30 --concurrency 20
```

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

If macOS rejects the native Next.js SWC binary, use the compatibility scripts in
the frontend README.

## Performance Snapshot

Local run on 2026-07-07 with Node.js v24.4.1, macOS arm64, local MongoDB,
local Redis, and the backend listening on `127.0.0.1:4011`.

Benchmark command:

```bash
cd backend
npm run benchmark -- --url http://127.0.0.1:4011 --iterations 1000 --warmup 100
```

| Benchmark | Requests | Failure rate | RPS | P50 | P95 |
|-----------|----------|--------------|-----|-----|-----|
| Cached product read | 1000 | 0% | 1870.61 | 0.43 ms | 0.90 ms |
| Cached quote | 1000 | 0% | 1064.21 | 0.63 ms | 1.95 ms |

Load-test commands:

```bash
npm run load:test -- --url http://127.0.0.1:4011 --scenario quote --duration 30 --concurrency 20
npm run load:test -- --url http://127.0.0.1:4011 --scenario mixed-read --duration 30 --concurrency 20
npm run load:test -- --url http://127.0.0.1:4011 --scenario order-create --duration 15 --concurrency 10
```

| Scenario | Duration | Concurrency | Requests | Failure rate | RPS | P50 | P95 |
|----------|----------|-------------|----------|--------------|-----|-----|-----|
| Quote | 30s | 20 | 27717 | 0% | 923.39 | 16.46 ms | 45.82 ms |
| Mixed read | 30s | 20 | 30862 | 0% | 1028.37 | 13.46 ms | 45.62 ms |
| Order create | 15s | 10 | 9586 | 0% | 638.75 | 14.16 ms | 26.00 ms |

`order-create` writes persistent test orders, so run it against a disposable
local or staging database. Live Stripe Checkout is intentionally excluded from
load tests; checkout oversell protection is covered by the integration suite.

## Backend Correctness Focus

The backend is designed around inventory correctness, not just CRUD endpoints.
Checkout claims an order, reserves stock atomically, invalidates affected caches,
and rolls the order back if checkout setup fails. Tests verify that simultaneous
checkout requests cannot reserve more inventory than exists and that Stripe
webhooks are idempotent.

The performance scripts intentionally avoid live Stripe calls. They measure
repeatable API paths such as cached product reads, quote generation, and
authenticated order creation. Checkout oversell protection is verified in the
integration suite with Stripe stubbed.
