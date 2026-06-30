import express, { Router } from 'express';
import Order from '../models/Order.js';
import { stripe } from '../lib/stripe.js';
import { releaseStock, invalidateStockCache } from '../lib/inventory.js';

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
          {
            _id: orderId,
            status: 'pending',
            inventoryReserved: true,
            stripeSessionId: session.id,
          },
          { $set: { status: 'paid' } }
        );
      }
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;

      if (orderId) {
        const order = await Order.findOneAndUpdate(
          {
            _id: orderId,
            status: 'pending',
            inventoryReserved: true,
            stripeSessionId: session.id,
          },
          { $set: { status: 'cancelled', inventoryReserved: false } }
        );

        if (order) {
          await releaseStock(order.items);
          await invalidateStockCache(order.items);
        }
      }
    }

    res.json({ received: true });
  }
);

export default router;
