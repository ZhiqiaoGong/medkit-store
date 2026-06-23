import { z } from 'zod';

// Define schema for each addon item
const addonItemSchema = z.object({
  sku: z.string({
    required_error: "Addon SKU is required",
  }),
  quantity: z
    .number({
      required_error: "Quantity is required",
      invalid_type_error: "Quantity must be a number",
    })
    .int()
    .positive()
    .default(1), // default to 1 if not provided
});

export const quoteRequestSchema = z
  .object({
    baseSku: z.string().optional(),
    addons: z.array(addonItemSchema).optional(),
  })
  .refine(
    (data) => data.baseSku || (data.addons && data.addons.length > 0),
    {
      message: "At least one of baseSku or addons is required",
    }
  );
