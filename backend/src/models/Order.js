import mongoose from 'mongoose';


const orderItemSchema = new mongoose.Schema(
  {
    sku:      { type: String, required: true },
    name:     { type: String, required: true },
    type:     { type: String, enum: ['BASE', 'ADDON'], required: true },
    price:    { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items:           { type: [orderItemSchema], required: true },
    total:           { type: Number, required: true, min: 0 },
    currency:        { type: String, default: 'USD' },
    status:          { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending' },
    stripeSessionId: { type: String, default: null },
    inventoryReserved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('Order', OrderSchema);
