import { z } from 'zod';

export const productCreateSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    sku: z.string().min(1),
    type: z.enum(['BASE', 'ADDON']),
    version: z.string().optional(),
    price: z.number().nonnegative(),
    currency: z.string().default('USD').optional(),
    attributes: z.record(z.any()).optional(),
    stock: z.object({
      total: z.number().int().nonnegative().default(0).optional(),
      reserved: z.number().int().nonnegative().default(0).optional()
    }).optional(),
    active: z.boolean().optional()
  })
});
