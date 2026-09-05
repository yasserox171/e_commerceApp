import { Router } from 'express';
import { z } from 'zod';

import { ApiError } from '../../lib/errors.js';
import { asyncHandler } from '../../lib/http.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { cancelOrder, createOrderFromCart, getOrder, listOrders } from './orders.service.js';

const addressSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(24),
  line1: z.string().trim().min(4).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(80),
  region: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(16).optional(),
  countryCode: z.string().trim().length(2).default('MA'),
});

const createOrderSchema = z.object({
  shippingAddress: addressSchema,
  customerNote: z.string().trim().max(1000).optional(),
  // Retail is card-only; the service rejects anything else for that channel.
  paymentMethod: z.enum(['card', 'bank_transfer']).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const ordersRouter: Router = Router();

ordersRouter.use(requireAuth);

ordersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const input = createOrderSchema.parse(req.body);
    res.status(201).json(await createOrderFromCart(user, input));
  }),
);

ordersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { page, pageSize } = listQuerySchema.parse(req.query);
    res.json(await listOrders(user.id, user.accountType, page, pageSize));
  }),
);

ordersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const order = await getOrder(user.id, id);
    if (!order) throw ApiError.notFound('Order not found');
    res.json(order);
  }),
);

ordersRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    res.json(await cancelOrder(user.id, id));
  }),
);
