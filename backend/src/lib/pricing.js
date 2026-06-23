import Product from '../models/Product.js';

function checkStock(product, quantity) {
  const available = product.stock.total - product.stock.reserved;
  if (available < quantity) {
    const err = new Error(`Insufficient stock for ${product.sku}: ${available} available`);
    err.status = 400;
    throw err;
  }
}

// Build order items from baseSku + addons, snapshot prices from DB.
// Throws 400 if any SKU is not found, inactive, or out of stock.
export async function buildOrderItems(baseSku, addons = []) {
  const items = [];

  if (baseSku) {
    const base = await Product.findOne({ sku: baseSku, active: true });
    if (!base) {
      const err = new Error(`Product not found: ${baseSku}`);
      err.status = 400;
      throw err;
    }
    checkStock(base, 1);
    items.push({
      sku:      base.sku,
      name:     base.name,
      type:     base.type,
      price:    base.price,
      quantity: 1,
      subtotal: base.price,
    });
  }

  if (addons.length > 0) {
    const skus = addons.map(a => a.sku);
    const found = await Product.find({ sku: { $in: skus }, active: true });
    const foundMap = Object.fromEntries(found.map(p => [p.sku, p]));

    for (const addon of addons) {
      const product = foundMap[addon.sku];
      if (!product) {
        const err = new Error(`Product not found: ${addon.sku}`);
        err.status = 400;
        throw err;
      }
      checkStock(product, addon.quantity);
      items.push({
        sku:      product.sku,
        name:     product.name,
        type:     product.type,
        price:    product.price,
        quantity: addon.quantity,
        subtotal: product.price * addon.quantity,
      });
    }
  }

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  return { items, total };
}
