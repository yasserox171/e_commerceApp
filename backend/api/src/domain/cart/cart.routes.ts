import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../lib/http.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import {
  addItem,
  clearCart,
  getCart,
  MAX_LINE_QUANTITY,
  removeItem,
  updateItemQuantity,
} from './cart.repo.js';

const addItemSchema = z.object({
  productId: z.string().min(1).max(64),
  quantity: z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY).default(1),
});

const quantitySchema = z.object({
  quantity: z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY),
});

const itemParamsSchema = z.object({ itemId: z.string().uuid() });

export const cartRouter: Router = Router();

// The cart always belongs to the signed-in user in the channel their account
// was opened in — there is no cross-channel cart.
cartRouter.use(requireAuth);

cartRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json(await getCart(user.id, user.accountType));
  }),
);

cartRouter.post(
  '/items',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { productId, quantity } = addItemSchema.parse(req.body);
    res.status(201).json(await addItem(user.id, user.accountType, productId, quantity));
  }),
);

cartRouter.patch(
  '/items/:itemId',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { itemId } = itemParamsSchema.parse(req.params);
    const { quantity } = quantitySchema.parse(req.body);
    res.json(await updateItemQuantity(user.id, user.accountType, itemId, quantity));
  }),
);

cartRouter.delete(
  '/items/:itemId',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const { itemId } = itemParamsSchema.parse(req.params);
    res.json(await removeItem(user.id, user.accountType, itemId));
  }),
);

cartRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json(await clearCart(user.id, user.accountType));
  }),
);
