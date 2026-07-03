# Deployment map

The application is deployed as independent services from this repository:

| Component | Provider | Repository root |
| --- | --- | --- |
| Next.js frontend | Vercel | `frontend` |
| Express API | Railway | `backend` |
| Durable application data | MongoDB Atlas | external connection string |
| Rebuildable cache | Railway Redis | external connection string |
| Payments | Stripe test mode | Railway webhook URL |

## Backend environment contract

Railway must provide:

- `MONGO_URI`: MongoDB Atlas connection string.
- `REDIS_URL`: Railway Redis private connection string.
- `STRIPE_SECRET_KEY`: Stripe test secret key.
- `STRIPE_WEBHOOK_SECRET`: signing secret for the deployed webhook endpoint.
- `CLIENT_URL`: the final Vercel production URL, without a trailing slash.
- `ALLOWED_ORIGINS`: comma-separated frontend origins allowed by CORS.
- `JWT_SECRET`: a long random secret used to sign login tokens.
- `NODE_ENV=production`.

Railway injects `PORT`; do not set it manually. The service uses `/ready` as
its deployment health check, so a release becomes active only after both
MongoDB and Redis respond.

## Frontend environment contract

Vercel must provide:

- `API_BASE_URL`: Railway API URL used by Next.js Server Components.
- `NEXT_PUBLIC_API_BASE_URL`: the same Railway API URL exposed to browser code.

Set the Vercel project root directory to `frontend`. Set the Railway service
root directory to `backend` and its config path to `/backend/railway.json`.

Never commit real values from `.env`; use the checked-in example files only.
