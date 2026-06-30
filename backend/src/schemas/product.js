import { z } from 'zod';

const stockSchema = z.object({
  total: z.number().int().nonnegative().optional(),
  reserved: z.number().int().nonnegative().optional(),
}).strict();

const productInputSchema = z.object({
  name: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  type: z.enum(['BASE', 'ADDON']),
  version: z.string().min(1).optional(),
  price: z.number().nonnegative(),
  currency: z.string().min(1).optional(),
  attributes: z.record(z.string(), z.any()).optional(),
  stock: stockSchema.optional(),
  active: z.boolean().optional(),
}).strict();

export const productCreateSchema = z.object({
  body: productInputSchema,
});

export const productUpdateSchema = z.object({
  body: productInputSchema.partial().refine(
    body => Object.keys(body).length > 0,
    { message: 'At least one product field is required' }
  ),
});
