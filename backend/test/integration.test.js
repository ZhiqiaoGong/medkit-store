import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';

process.env.STRIPE_SECRET_KEY ||= 'sk_test_placeholder';
process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.CLIENT_URL ||= 'http://localhost:3000';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_webhook_secret';

if (!process.env.MONGO_URI) {
  throw new Error('MONGO_URI is required to run integration tests');
}

const mongoUrl = new URL(process.env.MONGO_URI);
mongoUrl.pathname = `/medkit_test_${process.pid}`;

const { app } = await import('../src/index.js');
const { default: Product } = await import('../src/models/Product.js');
const { default: Order } = await import('../src/models/Order.js');
const { default: User } = await import('../src/models/User.js');
const { reserveStock, releaseStock } = await import('../src/lib/inventory.js');
const { redis } = await import('../src/lib/redis.js');
const { stripe } = await import('../src/lib/stripe.js');

let server;
let baseUrl;
let baseSku;
let addonSku;
let userToken;
let otherUserToken;
let adminToken;

async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

async function sendWebhook(type, order, sessionId) {
  const payload = JSON.stringify({
    id: `evt_${type}_${Date.now()}`,
    object: 'event',
    type,
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        metadata: { orderId: order._id.toString() },
      },
    },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  const response = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    body: payload,
  });
  return { status: response.status, body: await response.json() };
}

async function createWebhookOrder(label, quantity) {
  const sku = `TEST-WEBHOOK-${label}-${process.pid}-${Date.now()}`;
  await Product.create({
    name: `Webhook ${label}`,
    sku,
    type: 'BASE',
    price: 100,
    stock: { total: 10, reserved: 0 },
  });

  const items = [{
    sku,
    name: `Webhook ${label}`,
    type: 'BASE',
    price: 100,
    quantity,
    subtotal: 100 * quantity,
  }];
  await reserveStock(items);

  const sessionId = `cs_test_${label}_${Date.now()}`;
  const order = await Order.create({
    userId: new mongoose.Types.ObjectId(),
    items,
    total: 100 * quantity,
    status: 'pending',
    stripeSessionId: sessionId,
    inventoryReserved: true,
  });
  return { order, items, sessionId, sku };
}

before(async () => {
  await mongoose.connect(mongoUrl.toString());
  server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const suffix = `${process.pid}-${Date.now()}`;
  baseSku = `TEST-BASE-${suffix}`;
  addonSku = `TEST-ADDON-${suffix}`;
  await Product.create([
    {
      name: 'Test Base',
      sku: baseSku,
      type: 'BASE',
      price: 2999,
      stock: { total: 50, reserved: 0 },
    },
    {
      name: 'Test Addon',
      sku: addonSku,
      type: 'ADDON',
      price: 199,
      stock: { total: 100, reserved: 0 },
    },
  ]);

  const ownerEmail = `owner-${suffix}@example.com`;
  const otherEmail = `other-${suffix}@example.com`;
  const user = await request('/api/auth/register', {
    method: 'POST',
    body: { email: ownerEmail, password: 'password123' },
  });
  const otherUser = await request('/api/auth/register', {
    method: 'POST',
    body: { email: otherEmail, password: 'password123' },
  });
  assert.equal(user.status, 201);
  assert.equal(otherUser.status, 201);
  userToken = user.body.token;
  otherUserToken = otherUser.body.token;

  await User.updateOne({ email: otherEmail }, { $set: { role: 'admin' } });
  const admin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: otherEmail, password: 'password123' },
  });
  assert.equal(admin.status, 200);
  adminToken = admin.body.token;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await redis.quit();
});

test('health and readiness endpoints report service status', async () => {
  const health = await request('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');

  const ready = await request('/ready');
  assert.equal(ready.status, 200);
  assert.equal(ready.body.ready, true);
  assert.deepEqual(ready.body.checks, { mongo: 'up', redis: 'up' });
});

test('CORS allows the configured client and rejects unknown origins', async () => {
  const allowed = await fetch(`${baseUrl}/health`, {
    headers: { origin: process.env.CLIENT_URL },
  });
  assert.equal(allowed.status, 200);
  assert.equal(
    allowed.headers.get('access-control-allow-origin'),
    process.env.CLIENT_URL
  );

  const blocked = await request('/health', {
    headers: { origin: 'https://untrusted.example' },
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, 'Origin not allowed by CORS');
});

test('quote validates input, product types, and totals', async () => {
  const quote = await request('/api/quote', {
    method: 'POST',
    body: {
      bases: [{ sku: baseSku, quantity: 2 }],
      addons: [{ sku: addonSku, quantity: 2 }],
    },
  });
  assert.equal(quote.status, 200);
  assert.equal(quote.body.total, 6396);

  const empty = await request('/api/quote', { method: 'POST', body: {} });
  assert.equal(empty.status, 400);

  const wrongType = await request('/api/quote', {
    method: 'POST',
    body: { bases: [{ sku: addonSku, quantity: 1 }] },
  });
  assert.equal(wrongType.status, 400);
});

test('orders enforce totals, ownership, and checkout authorization', async () => {
  const created = await request('/api/orders', {
    method: 'POST',
    token: userToken,
    body: {
      bases: [{ sku: baseSku, quantity: 1 }],
      addons: [{ sku: addonSku, quantity: 2 }],
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.total, 3397);

  const ownerRead = await request(`/api/orders/${created.body._id}`, { token: userToken });
  assert.equal(ownerRead.status, 200);

  const otherRead = await request(`/api/orders/${created.body._id}`, { token: otherUserToken });
  assert.equal(otherRead.status, 403);

  const otherCheckout = await request(`/api/orders/${created.body._id}/checkout`, {
    method: 'POST',
    token: otherUserToken,
  });
  assert.equal(otherCheckout.status, 403);
});

test('duplicate SKUs are merged before checking stock', async () => {
  const response = await request('/api/orders', {
    method: 'POST',
    token: userToken,
    body: {
      bases: [
        { sku: baseSku, quantity: 30 },
        { sku: baseSku, quantity: 30 },
      ],
    },
  });
  assert.equal(response.status, 400);
});

test('admin product writes validate input and invalidate caches', async () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const originalSku = `TEST-ADMIN-${suffix}`;
  const renamedSku = `${originalSku}-RENAMED`;
  const versionBefore = Number(await redis.get('product:version') || 0);

  const forbidden = await request('/api/products', {
    method: 'POST',
    token: userToken,
    body: { name: 'Forbidden', sku: `${originalSku}-NO`, type: 'ADDON', price: 1 },
  });
  assert.equal(forbidden.status, 403);

  const created = await request('/api/products', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Admin Test',
      sku: originalSku,
      type: 'ADDON',
      price: 250,
      imageUrl: '/products/admin-test.webp',
      stock: { total: 10 },
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.imageUrl, '/products/admin-test.webp');
  assert.equal(Number(await redis.get('product:version')), versionBefore + 1);

  const cachedOriginal = await request(`/api/products/${originalSku}`);
  assert.equal(cachedOriginal.status, 200);

  const renamed = await request(`/api/products/${created.body._id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { sku: renamedSku },
  });
  assert.equal(renamed.status, 200);

  const staleOriginal = await request(`/api/products/${originalSku}`);
  assert.equal(staleOriginal.status, 404);
  const current = await request(`/api/products/${renamedSku}`);
  assert.equal(current.status, 200);

  const firstQuote = await request('/api/quote', {
    method: 'POST',
    body: { addons: [{ sku: renamedSku, quantity: 1 }] },
  });
  assert.equal(firstQuote.body.total, 250);

  const repriced = await request(`/api/products/${created.body._id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { price: 300 },
  });
  assert.equal(repriced.status, 200);
  const secondQuote = await request('/api/quote', {
    method: 'POST',
    body: { addons: [{ sku: renamedSku, quantity: 1 }] },
  });
  assert.equal(secondQuote.body.total, 300);

  const emptyPatch = await request(`/api/products/${created.body._id}`, {
    method: 'PATCH',
    token: adminToken,
    body: {},
  });
  assert.equal(emptyPatch.status, 400);

  const unknownField = await request(`/api/products/${created.body._id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { unexpected: true },
  });
  assert.equal(unknownField.status, 400);

  const deleted = await request(`/api/products/${created.body._id}`, {
    method: 'DELETE',
    token: adminToken,
  });
  assert.equal(deleted.status, 200);
});

test('concurrent reservations cannot oversell stock', async () => {
  const items = [{ sku: baseSku, quantity: 30 }];
  const results = await Promise.allSettled([
    reserveStock(items),
    reserveStock(items),
  ]);

  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);

  const reserved = await Product.findOne({ sku: baseSku }).lean();
  assert.equal(reserved.stock.reserved, 30);

  await releaseStock(items);
  const released = await Product.findOne({ sku: baseSku }).lean();
  assert.equal(released.stock.reserved, 0);
});

test('completed webhook marks an order paid without double-counting stock', async () => {
  const { order, items, sessionId, sku } = await createWebhookOrder('completed', 2);

  const first = await sendWebhook('checkout.session.completed', order, sessionId);
  assert.equal(first.status, 200);

  const paid = await Order.findById(order._id).lean();
  const stockAfterFirst = await Product.findOne({ sku }).lean();
  assert.equal(paid.status, 'paid');
  assert.equal(stockAfterFirst.stock.reserved, 2);

  const repeated = await sendWebhook('checkout.session.completed', order, sessionId);
  assert.equal(repeated.status, 200);
  const stockAfterRepeat = await Product.findOne({ sku }).lean();
  assert.equal(stockAfterRepeat.stock.reserved, 2);

  await releaseStock(items);
});

test('expired webhook cancels an order and releases stock once', async () => {
  const { order, sessionId, sku } = await createWebhookOrder('expired', 3);

  const first = await sendWebhook('checkout.session.expired', order, sessionId);
  assert.equal(first.status, 200);

  const cancelled = await Order.findById(order._id).lean();
  const stockAfterFirst = await Product.findOne({ sku }).lean();
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.inventoryReserved, false);
  assert.equal(stockAfterFirst.stock.reserved, 0);

  const repeated = await sendWebhook('checkout.session.expired', order, sessionId);
  assert.equal(repeated.status, 200);
  const stockAfterRepeat = await Product.findOne({ sku }).lean();
  assert.equal(stockAfterRepeat.stock.reserved, 0);
});
