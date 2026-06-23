import { Router } from 'express';
import Order from '../models/Order.js';
import { buildOrderItems } from '../lib/pricing.js';
import { validate } from '../middlewares/validate.js';
import { orderCreateSchema } from '../schemas/order.js';
import { stripe } from '../lib/stripe.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// POST /api/orders — snapshot prices and persist a new order.
router.post('/', requireAuth, validate(orderCreateSchema), async (req, res, next) => {
  try {
    const { baseSku, addons = [] } = req.body;
    const { items, total } = await buildOrderItems(baseSku, addons);
    const order = await Order.create({ userId: req.user.userId, items, total });
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:id/checkout — create a Stripe Checkout Session for this order.
router.post('/:id/checkout', requireAuth, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending') {
      return res.status(400).json({ error: `Order is already ${order.status}` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: order.items.map(item => ({
        price_data: {
          currency: order.currency.toLowerCase(),
          product_data: { name: item.name },
          unit_amount: Math.round(item.price * 100), // Stripe uses cents
        },
        quantity: item.quantity,
      })),
      metadata: { orderId: order._id.toString() },
      success_url: `${process.env.CLIENT_URL}/success?orderId=${order._id}`,
      cancel_url:  `${process.env.CLIENT_URL}/cancel?orderId=${order._id}`,
    });

    order.stripeSessionId = session.id;
    await order.save();

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
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
