# Deployment map

The application is deployed as independent services from this repository:

| Component | Provider | Repository root |
| --- | --- | --- |
| Next.js frontend | Vercel | `frontend` |
| Express API | Render | `backend` |
| Durable application data | MongoDB Atlas | external connection string |
| Rebuildable cache | External Redis | external connection string |
| Payments | Stripe test mode | Render webhook URL |

## Backend environment contract

Render must provide:

- `MONGO_URI`: MongoDB Atlas connection string.
- `REDIS_URL`: Redis connection string.
- `STRIPE_SECRET_KEY`: Stripe test secret key.
- `STRIPE_WEBHOOK_SECRET`: signing secret for the deployed webhook endpoint.
- `CLIENT_URL`: the final Vercel production URL, without a trailing slash.
- `ALLOWED_ORIGINS`: comma-separated frontend origins allowed by CORS.
- `JWT_SECRET`: a long random secret used to sign login tokens.
- `NODE_ENV=production`.

Render injects `PORT`; do not set it manually. Use `/ready` as the deployment
health check when configuring the service, so a release becomes active only
after both MongoDB and Redis respond.

## Frontend environment contract

Vercel must provide:

- `API_BASE_URL`: Render API URL used by Next.js Server Components.
- `NEXT_PUBLIC_API_BASE_URL`: the same Render API URL exposed to browser code.

Set the Vercel project root directory to `frontend`. Set the Render service root
directory to `backend` and use `npm start` as the start command.

Never commit real values from `.env`; use the checked-in example files only.
