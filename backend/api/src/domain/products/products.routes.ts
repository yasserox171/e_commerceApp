import { Router } from 'express';
import { z } from 'zod';

import { ApiError } from '../../lib/errors.js';
import { asyncHandler } from '../../lib/http.js';
import { unitPriceFor } from './pricing.js';
import { findProductById, getFacets, listProducts } from './products.repo.js';

const channelSchema = z.enum(['wholesale', 'dropshipping']);

const listQuerySchema = z.object({
  channel: channelSchema,
  q: z.string().trim().min(1).max(120).optional(),
  supplier: z.string().trim().min(1).max(160).optional(),
  subcategory: z.string().trim().min(1).max(160).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['newest', 'oldest', 'price_asc', 'price_desc', 'title']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const productsRouter: Router = Router();

/**
 * GET /products?channel=wholesale&q=…&supplier=…&page=1
 * The single catalogue endpoint both apps page through.
 */
productsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.parse(req.query);

    if (parsed.minPrice !== undefined && parsed.maxPrice !== undefined && parsed.minPrice > parsed.maxPrice) {
      throw ApiError.badRequest('minPrice cannot be greater than maxPrice');
    }

    const result = await listProducts({
      channel: parsed.channel,
      search: parsed.q,
      supplier: parsed.supplier,
      subcategory: parsed.subcategory,
      minPrice: parsed.minPrice,
      maxPrice: parsed.maxPrice,
      sort: parsed.sort,
      page: parsed.page,
      pageSize: parsed.pageSize,
    });

    res.json(result);
  }),
);

/**
 * GET /products/facets?channel=wholesale
 * Feeds the filter sheet: which suppliers and sub-categories exist right now,
 * and the real price range, so the app never shows a filter with zero results.
 */
productsRouter.get(
  '/facets',
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ channel: channelSchema, q: z.string().trim().min(1).max(120).optional() })
      .parse(req.query);

    res.json(await getFacets(parsed.channel, parsed.q));
  }),
);

/**
 * GET /products/:id?channel=…&quantity=…
 * `quantity` is optional and only meaningful for wholesale: when given, the
 * response carries the tier the buyer would land on at that quantity.
 */
productsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().min(1).max(64) }).parse(req.params);
    const { channel, quantity } = z
      .object({
        channel: channelSchema.optional(),
        quantity: z.coerce.number().int().min(1).optional(),
      })
      .parse(req.query);

    const product = await findProductById(id, channel);
    if (!product) throw ApiError.notFound('Product not found');

    if (quantity === undefined) {
      res.json(product);
      return;
    }

    const match = unitPriceFor(
      { unitPrice: product.price, minOrderQuantity: product.minOrderQuantity, tiers: product.tiers, compareAtPrice: product.compareAtPrice },
      quantity,
    );

    res.json({
      ...product,
      quote: {
        quantity,
        unitPrice: match.unitPrice,
        lineTotal: Math.round(match.unitPrice * quantity * 100) / 100,
        tier: match.tier,
        nextTier: match.nextTier,
        meetsMinimum: quantity >= product.minOrderQuantity,
      },
    });
  }),
);
