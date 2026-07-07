// App entry: boot Express, connect Mongo, mount routes, and basic error handling.
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pathToFileURL } from 'url';

import { connectMongo } from './lib/mongo.js';
import healthRouter from './api/health.js';
import productsRouter from './api/products.js';
import quoteRouter from './api/quote.js';
import ordersRouter from './api/orders.js';
import webhookRouter from './api/webhook.js';
import authRouter from './api/auth.js';
import { seedSampleProductsOnBoot } from './lib/seed-products.js';

export const app = express();

const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || clientUrl)
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// Webhook must be mounted before express.json() to preserve raw body for signature verification.
app.use('/api/webhooks/stripe', webhookRouter);

// Common middlewares: security headers, CORS, and JSON body parser.
app.use(helmet());
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    // Requests such as health checks and server-to-server calls do not send Origin.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    const error = new Error('Origin not allowed by CORS');
    error.status = 403;
    callback(error);
  },
}));
app.use(express.json({ limit: '1mb' }));

// Routes
app.use(healthRouter);
app.use('/api', productsRouter);

app.use('/api/auth', authRouter);
app.use('/api/quote', quoteRouter);
app.use('/api/orders', ordersRouter);

// 404 handler
app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });
  
  // Centralized error handler
  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({
      error: err.message || 'Internal Server Error'
    });
  });
  
  

const port = process.env.PORT || 4000;

async function start() {
  await connectMongo(process.env.MONGO_URI || process.env.MONGODB_URI);
  await seedSampleProductsOnBoot();
  app.listen(port, '0.0.0.0', () => {
    console.log(`✅ medkit-backend listening on :${port}`);
  });
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  start().catch((err) => {
    console.error('Fatal: failed to start', err);
    process.exit(1);
  });
}
