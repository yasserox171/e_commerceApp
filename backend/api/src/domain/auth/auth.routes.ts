import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { asyncHandler } from '../../lib/http.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { login, register, updateProfile } from './auth.service.js';

// Credential endpoints are the ones worth throttling; the catalogue is not.
const credentialsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'too_many_requests', message: 'Too many attempts, try again later' } },
});

const channelSchema = z.enum(['wholesale', 'dropshipping']);

const registerSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(6).max(24).optional(),
  accountType: channelSchema,
  businessName: z.string().trim().min(2).max(160).optional(),
  iceNumber: z.string().trim().min(4).max(32).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(1).max(128),
  accountType: channelSchema,
});

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(6).max(24).optional(),
  businessName: z.string().trim().min(2).max(160).optional(),
  iceNumber: z.string().trim().min(4).max(32).optional(),
});

export const authRouter: Router = Router();

authRouter.post(
  '/register',
  credentialsLimiter,
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const result = await register(input);
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/login',
  credentialsLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, accountType } = loginSchema.parse(req.body);
    res.json(await login(email, password, accountType));
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    res.json({ user: await updateProfile(user.id, profileSchema.parse(req.body)) });
  }),
);
