import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';

process.env.STRIPE_SECRET_KEY ||= 'sk_test_placeholder';
process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.CLIENT_URL ||= 'http://localhost:3000';

if (!process.env.MONGO_URI) {
  throw new Error('MONGO_URI is required to run integration tests');
}

const mongoUrl = new URL(process.env.MONGO_URI);
mongoUrl.pathname = `/medkit_test_${process.pid}`;

const { app } = await import('../src/index.js');
const { default: Product } = await import('../src/models/Product.js');
const { reserveStock, releaseStock } = await import('../src/lib/inventory.js');
const { redis } = await import('../src/lib/redis.js');

let server;
let baseUrl;
let baseSku;
let addonSku;
let userToken;
let otherUserToken;

async function request(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
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

  const user = await request('/api/auth/register', {
    method: 'POST',
    body: { email: `owner-${suffix}@example.com`, password: 'password123' },
  });
  const otherUser = await request('/api/auth/register', {
    method: 'POST',
    body: { email: `other-${suffix}@example.com`, password: 'password123' },
  });
  assert.equal(user.status, 201);
  assert.equal(otherUser.status, 201);
  userToken = user.body.token;
  otherUserToken = otherUser.body.token;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await redis.quit();
});

test('health endpoint responds', async () => {
  const response = await request('/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
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
