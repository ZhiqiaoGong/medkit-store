import express, { Router } from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { stripe } from '../lib/stripe.js';
import { redis } from '../lib/redis.js';

const router = Router();

// POST /api/webhooks/stripe
// Must receive raw body — mounted before express.json() in index.js.
router.post(
  '/',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;

      if (orderId) {
        // Idempotent: returns the order only if it was actually changed from pending → paid.
        const order = await Order.findOneAndUpdate(
          { _id: orderId, status: 'pending' },
          { status: 'paid' }
        );

        // Skip stock update if order was already paid (order is null).
        if (order) {
          const bulkOps = order.items.map(item => ({
            updateOne: {
              filter: { sku: item.sku },
              update: { $inc: { 'stock.reserved': item.quantity } },
            },
          }));
          await Product.bulkWrite(bulkOps);
          await redis.del(...order.items.map(item => `product:${item.sku}`));
        }
      }
    }

    res.json({ received: true });
  }
);

export default router;
