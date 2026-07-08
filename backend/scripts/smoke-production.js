import crypto from 'node:crypto';
import { parseArgs } from './perf-utils.js';

const args = parseArgs(process.argv.slice(2));
const apiBaseUrl = (args.api || process.env.API_BASE_URL || '').replace(/\/$/, '');
const frontendUrl = (args.frontend || process.env.FRONTEND_URL || '').replace(/\/$/, '');
const includeCheckout = Boolean(args.checkout || process.env.SMOKE_CHECKOUT === 'true');

if (!apiBaseUrl) {
  console.error('API_BASE_URL is required. Example: API_BASE_URL=https://api.example.com npm run smoke:prod');
  process.exit(1);
}

async function request(label, pathOrUrl, { method = 'GET', body, token, expected = [200] } = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${apiBaseUrl}${pathOrUrl}`;
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!expected.includes(response.status)) {
    const detail = typeof data === 'string' ? data.slice(0, 160) : JSON.stringify(data);
    throw new Error(`${label} returned ${response.status}: ${detail}`);
  }

  console.log(`ok ${label} ${response.status}`);
  return data;
}

function choosePayload(products) {
  const base = products.find(product =>
    product.type === 'BASE' &&
    product.active !== false &&
    (product.stock?.total ?? 0) - (product.stock?.reserved ?? 0) > 0
  );
  const addon = products.find(product =>
    product.type === 'ADDON' &&
    product.active !== false &&
    (product.stock?.total ?? 0) - (product.stock?.reserved ?? 0) > 0
  );

  if (!base) throw new Error('No orderable BASE product found');

  return {
    payload: {
      bases: [{ sku: base.sku, quantity: 1 }],
      addons: addon ? [{ sku: addon.sku, quantity: 1 }] : [],
    },
    base,
    addon,
  };
}

async function main() {
  if (frontendUrl) {
    await request('frontend', frontendUrl, { expected: [200] });
  }

  const ready = await request('api readiness', '/ready');
  if (ready.ready !== true) throw new Error('/ready did not report ready=true');

  const products = await request('product catalog', '/api/products?active=true');
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Product catalog is empty');
  }

  const { payload, base, addon } = choosePayload(products);
  const quote = await request('quote', '/api/quote', {
    method: 'POST',
    body: payload,
  });
  if (!quote.total || quote.total <= 0) throw new Error('Quote total was not positive');

  const email = `smoke-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`;
  const password = `smoke-${crypto.randomUUID()}`;
  const registration = await request('register smoke user', '/api/auth/register', {
    method: 'POST',
    body: { email, password },
    expected: [201],
  });
  if (!registration.token) throw new Error('Registration response did not include a token');

  const order = await request('create order', '/api/orders', {
    method: 'POST',
    body: payload,
    token: registration.token,
    expected: [201],
  });
  if (!order._id || order.total !== quote.total) {
    throw new Error('Order response did not match the quote');
  }

  let checkout = null;
  if (includeCheckout) {
    checkout = await request('create checkout session', `/api/orders/${order._id}/checkout`, {
      method: 'POST',
      token: registration.token,
    });
    if (!checkout.url) throw new Error('Checkout response did not include a URL');
  }

  console.log(JSON.stringify({
    ok: true,
    apiBaseUrl,
    frontendUrl: frontendUrl || null,
    checked: [
      ...(frontendUrl ? ['frontend'] : []),
      'ready',
      'products',
      'quote',
      'register',
      'order-create',
      ...(includeCheckout ? ['checkout-session'] : []),
    ],
    products: {
      baseSku: base.sku,
      addonSku: addon?.sku || null,
    },
    orderId: order._id,
    checkoutUrl: checkout?.url || null,
  }, null, 2));
}

main().catch(error => {
  console.error(`smoke failed: ${error.message}`);
  process.exit(1);
});
