// Product model for both BASE and ADDON items.
import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    sku: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['BASE', 'ADDON'], required: true },
    version: { type: String, default: '1.0.0' },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
    stock: {
      total: { type: Number, default: 0, min: 0 },
      reserved: { type: Number, default: 0, min: 0 }
    },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default mongoose.model('Product', ProductSchema);
