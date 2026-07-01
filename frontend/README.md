# MedKit Studio frontend

Next.js frontend for configuring medical kits against the existing Express API.

## Current milestone

- Product catalog rendered from the backend in a Server Component
- Interactive BASE and ADDON selection in a Client Component
- Debounced live quotes from `POST /api/quote`
- Responsive product cards, inventory state, and order summary

Authentication, order creation, and Stripe redirect are intentionally reserved for the next milestone.

## Run locally

Start MongoDB, Redis, and the backend first:

```bash
cd ../backend
npm run dev
```

Then start the frontend:

```bash
cd ../frontend
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If macOS rejects the native Next.js SWC binary, use the included WebAssembly fallback:

```bash
npm run dev:compat
```

## Validation

```bash
npm run lint
npm run build
```

Use `npm run build:compat` for the same SWC fallback described above.
