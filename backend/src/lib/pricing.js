import Product from '../models/Product.js';

function checkStock(product, quantity) {
  const available = product.stock.total - product.stock.reserved;
  if (available < quantity) {
    const err = new Error(`Insufficient stock for ${product.sku}: ${available} available`);
    err.status = 400;
    throw err;
  }
}

function mergeEntries(entries) {
  const quantities = new Map();
  for (const entry of entries) {
    quantities.set(entry.sku, (quantities.get(entry.sku) || 0) + entry.quantity);
  }
  return Array.from(quantities, ([sku, quantity]) => ({ sku, quantity }));
}

async function resolveItems(entries, expectedType) {
  if (!entries || entries.length === 0) return [];
  const mergedEntries = mergeEntries(entries);
  const skus = mergedEntries.map(e => e.sku);
  const found = await Product.find({ sku: { $in: skus }, active: true });
  const foundMap = Object.fromEntries(found.map(p => [p.sku, p]));

  return mergedEntries.map(entry => {
    const product = foundMap[entry.sku];
    if (!product) {
      const err = new Error(`Product not found: ${entry.sku}`);
      err.status = 400;
      throw err;
    }
    if (product.type !== expectedType) {
      const err = new Error(`${entry.sku} must be a ${expectedType} product`);
      err.status = 400;
      throw err;
    }
    checkStock(product, entry.quantity);
    return {
      sku:      product.sku,
      name:     product.name,
      type:     product.type,
      price:    product.price,
      quantity: entry.quantity,
      subtotal: product.price * entry.quantity,
    };
  });
}

// Build order items from bases[] + addons[], snapshot prices from DB.
// Throws 400 if any SKU is not found, inactive, or out of stock.
export async function buildOrderItems(bases = [], addons = []) {
  const [baseItems, addonItems] = await Promise.all([
    resolveItems(bases, 'BASE'),
    resolveItems(addons, 'ADDON'),
  ]);

  const items = [...baseItems, ...addonItems];
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  return { items, total };
}
