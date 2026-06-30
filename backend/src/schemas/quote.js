import { z } from 'zod';

const itemSchema = z.object({
  sku: z.string(),
  quantity: z.number().int().positive().default(1),
});

export const quoteRequestSchema = z
  .object({
    bases:  z.array(itemSchema).optional(),
    addons: z.array(itemSchema).optional(),
  })
  .refine(
    (data) =>
      (data.bases && data.bases.length > 0) ||
      (data.addons && data.addons.length > 0),
    { message: 'At least one of bases or addons is required' }
  );

export const quoteSchema = z.object({
  body: quoteRequestSchema,
});
