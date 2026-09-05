# `@ecommerce/api`

Express 5 + PostgreSQL API serving both 9ri3a (wholesale) and 9ri3a espress (retail).

```bash
cp .env.example .env      # fill in DATABASE_URL and JWT_SECRET
npm run db:migrate        # from the repo root
npm run dev               # tsx watch, http://localhost:4000
npm test                  # unit tests
npm run build && npm start
```

## Layout

```
src/
├── server.ts             boot, graceful shutdown, production config guard
├── app.ts                middleware stack + route mounting
├── config/env.ts         zod-validated environment, fails fast
├── db/
│   ├── pool.ts           pg pool (search_path = commerce, public)
│   └── migrate.ts        migration runner (up | status)
├── middleware/           auth (JWT), error normalisation
├── lib/                  ApiError, money rounding, order references
└── domain/
    ├── products/         extra_info parser, tier pricing, catalogue queries
    ├── auth/             register / login / profile
    ├── cart/             server-priced cart
    ├── orders/           order creation, tracking, settlement
    └── payments/         PaymentProvider abstraction, CMI, Stripe
```

Each domain owns its routes, service and data access. Adding a feature means
adding a folder, not threading through a shared layer.

## Endpoints

All responses are JSON. Errors are always `{ "error": { "code", "message", "details"? } }`.

### Catalogue — public

| | |
|---|---|
| `GET /products` | `channel` (required), `q`, `supplier`, `subcategory`, `minPrice`, `maxPrice`, `sort` (`newest`\|`oldest`\|`price_asc`\|`price_desc`\|`title`), `page`, `pageSize` (≤50) |
| `GET /products/facets` | `channel` (required), `q`. Returns suppliers, subcategories and the real price range — so the filter sheet never offers an option with zero results. |
| `GET /products/:id` | `channel`, `quantity`. With `quantity`, adds a `quote` carrying the tier that quantity lands on and the next break. |

A malformed id (`/products/abc` against a bigint column) returns **404**, not 500.

### Auth

| | |
|---|---|
| `POST /auth/register` | `{ email, password, accountType, fullName?, phone?, businessName?, iceNumber? }` → `{ user, token }` |
| `POST /auth/login` | `{ email, password, accountType }` → `{ user, token }` |
| `GET /auth/me` | current user |
| `PATCH /auth/me` | update profile |

An email may hold one wholesale account and one retail account independently —
uniqueness is on `(lower(email), account_type)`. Login hashes a dummy value when
the user is missing so response time doesn't reveal whether an address exists.

Register and login are rate-limited to 20 requests per 15 minutes per IP.

### Cart — requires auth

`GET /cart` · `POST /cart/items` · `PATCH /cart/items/:itemId` · `DELETE /cart/items/:itemId` · `DELETE /cart`

Every response is the whole recomputed cart. Lines are re-priced against the live
catalogue on each read, so a price change upstream is reflected immediately. A
product that left the catalogue comes back as an unavailable line rather than
silently vanishing from the total, and `issues[]` lists in Arabic exactly what
blocks checkout (below minimum, out of stock, product gone).

### Orders — requires auth

| | |
|---|---|
| `POST /orders` | `{ shippingAddress, customerNote?, paymentMethod? }` — builds the order from the cart |
| `GET /orders` | paginated history |
| `GET /orders/:id` | items, timeline, payment attempts |
| `POST /orders/:id/cancel` | only while `pending_payment` or `awaiting_approval` |

Prices are **never** taken from the request. The client sends product ids and
quantities; the server prices everything from the live catalogue inside the
transaction that writes the order.

`paymentMethod` is ignored for retail — it is forced to `card`.

### Payments

| | |
|---|---|
| `GET /payments/methods` | active gateway, `prepaidCardOnly: true`, `cashOnDelivery: false` |
| `POST /payments/checkout` | `{ orderId }` → `{ instruction, returnUrlPrefix }` |
| `POST /payments/cmi/callback` | server-to-server, signature-verified — **authoritative** |
| `ALL /payments/cmi/return` | browser return, renders a page that deep-links back into the app |
| `POST /payments/stripe/webhook` | raw body, `Stripe-Signature` verified |

`instruction` is either `{ kind: 'redirect', url }` or, for CMI,
`{ kind: 'form_post', url, fields }` — the app renders an auto-submitting form in
a WebView because CMI's `3D_PAY_HOSTING` entry point only accepts POST.

## Order lifecycle

```
                  ┌─ card ──────> pending_payment ──(verified callback)──> processing ─> shipped ─> delivered
POST /orders ─────┤                     │
                  └─ bank_transfer ─> awaiting_approval                    (cancelled / refunded at any point)
```

`bank_transfer` is only reachable from the wholesale app. Retail is card-only at
the API, and `commerce.orders` carries a CHECK constraint enforcing the same
thing at the database level.

## Settlement safety

A callback only settles an order when all of these hold:

1. **Signature valid** — recomputed SHA-512 over the received fields plus the
   store key, compared without early exit. A bad signature returns `403` and
   nothing is written.
2. **Amount matches** — a signed callback claiming a different amount than the
   stored order total returns `422`.
3. **Not already settled** — replays update the payment row but never add a
   second timeline event or re-transition the order.

A declined card leaves the order in `pending_payment` so the shopper can retry
with another card; only the failure is recorded.

## Configuration

`config/env.ts` validates the whole environment with zod at import time and
throws with a per-field list if anything is wrong — a half-configured API never
boots. In production, `server.ts` additionally refuses to start when the JWT
secret is still the placeholder, `PUBLIC_API_URL` is not https, or the configured
gateway has no credentials.

See [`.env.example`](.env.example) for every variable.

## Tests

```bash
npm test
```

Covers the CMI hash (against an independent transcription of the documented
NestPay v3 algorithm) and the `extra_info` pricing parser across every shape the
ingestion pipeline is known to emit, including malformed ones.
