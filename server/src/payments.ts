import { z } from 'zod';

export const paymentMethodSchema = z.enum(['cash', 'card', 'transfer', 'other']);
