// App entry: boot Express, connect Mongo, mount routes, and basic error handling.
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { connectMongo } from './lib/mongo.js';
import healthRouter from './api/health.js';
import productsRouter from './api/products.js';
import quoteRouter from './api/quote.js';
import ordersRouter from './api/orders.js';
import webhookRouter from './api/webhook.js';
import authRouter from './api/auth.js';

const app = express();

// Webhook must be mounted before express.json() to preserve raw body for signature verification.
app.use('/api/webhooks/stripe', webhookRouter);

// Common middlewares: security headers, CORS, and JSON body parser.
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
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
    console.error(err);
    const status = err.status || 500;
    res.status(status).json({
      error: err.message || 'Internal Server Error'
    });
  });
  
  

const port = process.env.PORT || 4000;

async function start() {
  await connectMongo(process.env.MONGO_URI);
  app.listen(port, () => {
    console.log(`✅ medkit-backend listening on :${port}`);
  });
}

start().catch((err) => {
  console.error('Fatal: failed to start', err);
  process.exit(1);
});
