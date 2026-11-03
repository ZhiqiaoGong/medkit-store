// Minimal stand-in for the Express API, used only by the accessibility suite.
//
// The home page fetches products in a Server Component, so Playwright's
// in-browser request interception never sees that call — it happens in the
// Next.js process. Serving fixtures over HTTP is the only way to pin the
// rendered DOM without booting Mongo, Redis and the real backend in CI.

import { createServer } from "node:http";

const PORT = Number(process.env.STUB_API_PORT ?? 4000);

const products = [
  {
    _id: "000000000000000000000001",
    name: "Essential First Aid Kit",
    sku: "BASE-FIRST-AID",
    type: "BASE",
    version: "1.0.0",
    price: 39,
    currency: "USD",
    imageUrl: "/products/essential-first-aid-kit.webp",
    attributes: {},
    stock: { total: 50, reserved: 1 },
    active: true,
  },
  {
    _id: "000000000000000000000002",
    name: "Wound Care Pack",
    sku: "ADD-WOUND-CARE",
    type: "ADDON",
    version: "1.0.0",
    price: 12,
    currency: "USD",
    imageUrl: "/products/wound-care-pack.webp",
    attributes: {},
    stock: { total: 200, reserved: 1 },
    active: true,
  },
  {
    _id: "000000000000000000000003",
    name: "Burn Relief Pack",
    sku: "ADD-BURN-RELIEF",
    type: "ADDON",
    version: "1.0.0",
    price: 14,
    currency: "USD",
    imageUrl: "/products/burn-relief-pack.webp",
    attributes: {},
    stock: { total: 150, reserved: 0 },
    active: true,
  },
  // kept out of stock on purpose: the card renders a disabled Add button,
  // which is a state the contrast and button-name rules should still cover
  {
    _id: "000000000000000000000004",
    name: "Outdoor Emergency Pack",
    sku: "ADD-OUTDOOR",
    type: "ADDON",
    version: "1.0.0",
    price: 24,
    currency: "USD",
    imageUrl: "/products/outdoor-emergency-pack.webp",
    attributes: {},
    stock: { total: 8, reserved: 8 },
    active: true,
  },
];

export const ORDER_ID = "000000000000000000000f01";

const order = {
  _id: ORDER_ID,
  items: [
    {
      sku: "BASE-FIRST-AID",
      name: "Essential First Aid Kit",
      type: "BASE",
      price: 39,
      quantity: 1,
      subtotal: 39,
    },
    {
      sku: "ADD-WOUND-CARE",
      name: "Wound Care Pack",
      type: "ADDON",
      price: 12,
      quantity: 2,
      subtotal: 24,
    },
  ],
  total: 63,
  currency: "USD",
  status: "pending",
  createdAt: "2026-11-02T17:13:00.000Z",
};

function priceOf(sku) {
  return products.find((product) => product.sku === sku)?.price ?? 0;
}

function quoteFor(body) {
  const line = ({ sku, quantity = 1 }) => ({
    sku,
    price: priceOf(sku),
    quantity,
    subtotal: priceOf(sku) * quantity,
  });
  const bases = (body.bases ?? []).map(line);
  const addons = (body.addons ?? []).map(line);
  const total = [...bases, ...addons].reduce((sum, l) => sum + l.subtotal, 0);
  return { bases, addons, total };
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://127.0.0.1");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    });
    res.end();
    return;
  }

  if (pathname === "/api/products") return send(res, 200, products);
  if (pathname === "/api/quote") return send(res, 200, quoteFor(await readJson(req)));
  if (pathname === "/api/orders") return send(res, 200, [order]);
  if (pathname === `/api/orders/${ORDER_ID}`) return send(res, 200, order);

  return send(res, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`stub api listening on http://127.0.0.1:${PORT}`);
});
