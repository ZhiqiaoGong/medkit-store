import { z } from 'zod';
import { quoteRequestSchema } from './quote.js';

export const orderCreateSchema = z.object({
  body: quoteRequestSchema,
});
