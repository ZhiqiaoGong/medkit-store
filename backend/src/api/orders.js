import { Router } from 'express';
import Order from '../models/Order.js';
import { buildOrderItems } from '../lib/pricing.js';
import { validate } from '../middlewares/validate.js';
import { orderCreateSchema } from '../schemas/order.js';
import { stripe } from '../lib/stripe.js';
import { requireAuth } from '../middlewares/auth.js';
import { reserveStock, releaseStock, invalidateStockCache } from '../lib/inventory.js';

const router = Router();

// POST /api/orders — snapshot prices and persist a new order.
router.post('/', requireAuth, validate(orderCreateSchema), async (req, res, next) => {
  try {
    const { bases = [], addons = [] } = req.body;
    const { items, total } = await buildOrderItems(bases, addons);
    const order = await Order.create({ userId: req.user.userId, items, total });
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:id/checkout — create a Stripe Checkout Session for this order.
router.post('/:id/checkout', requireAuth, async (req, res, next) => {
  let claimedOrder = null;
  let stockReserved = false;
  let session = null;

  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ error: `Order is already ${order.status}` });
    }

    claimedOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        status: 'pending',
        $or: [
          { inventoryReserved: false },
          { inventoryReserved: { $exists: false } },
        ],
      },
      { $set: { inventoryReserved: true } },
      { new: true }
    );
    if (!claimedOrder) {
      return res.status(409).json({ error: 'Checkout is already in progress' });
    }

    await reserveStock(claimedOrder.items);
    stockReserved = true;
    await invalidateStockCache(claimedOrder.items);

    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: claimedOrder.items.map(item => ({
        price_data: {
          currency: claimedOrder.currency.toLowerCase(),
          product_data: { name: item.name },
          unit_amount: Math.round(item.price * 100), // Stripe uses cents
        },
        quantity: item.quantity,
      })),
      metadata: { orderId: claimedOrder._id.toString() },
      success_url: `${process.env.CLIENT_URL}/success?orderId=${claimedOrder._id}`,
      cancel_url:  `${process.env.CLIENT_URL}/cancel?orderId=${claimedOrder._id}`,
    });

    claimedOrder.stripeSessionId = session.id;
    await claimedOrder.save();

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    let safeToRelease = !session;

    if (session) {
      try {
        await stripe.checkout.sessions.expire(session.id);
        safeToRelease = true;
      } catch (expireErr) {
        console.error('Failed to expire Stripe session during cleanup:', expireErr.message);
        if (claimedOrder) {
          await Order.updateOne(
            { _id: claimedOrder._id },
            { $set: { stripeSessionId: session.id } }
          ).catch(updateErr => {
            console.error('Failed to preserve Stripe session ID:', updateErr.message);
          });
        }
      }
    }

    if (safeToRelease && claimedOrder) {
      if (stockReserved) {
        try {
          await releaseStock(claimedOrder.items);
          await invalidateStockCache(claimedOrder.items);
        } catch (releaseErr) {
          console.error('Failed to release stock during cleanup:', releaseErr.message);
          safeToRelease = false;
        }
      }

      if (safeToRelease) {
        await Order.updateOne(
          { _id: claimedOrder._id, status: 'pending' },
          { $set: { inventoryReserved: false, stripeSessionId: null } }
        ).catch(updateErr => {
          console.error('Failed to reset checkout state:', updateErr.message);
        });
      }
    }
    next(err);
  }
});

// GET /api/orders — list all orders belonging to the current user.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const orders = await Order.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id — fetch a single order, only accessible by its owner.
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
});

export default router;
