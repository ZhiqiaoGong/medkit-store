# MedKit Store

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
