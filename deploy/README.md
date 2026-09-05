# deploy/

Everything needed to run the 9ri3a API on an Ubuntu VPS.

**Start here:** [`RUNBOOK.ar.md`](./RUNBOOK.ar.md) — the step-by-step guide, in
Arabic, from a bare server to a working `https://9ri3a.centrefocus.ma`. The files
below are what it installs; this page is just the map.

| File | What it is |
|---|---|
| [`RUNBOOK.ar.md`](./RUNBOOK.ar.md) | The deployment guide. Read it first. |
| [`SERVER-PROMPT.md`](./SERVER-PROMPT.md) | The brief for a Claude Code session running *on the VPS*: what it may assume, what it must ask, and what it must not touch. |
| [`deploy.sh`](./deploy.sh) | One command for every update after the first setup: fetch → install → build → migrate → restart → verify. |
| [`systemd/qri3a-api.service`](./systemd/qri3a-api.service) | The service unit, hardened. Reads secrets from `/etc/qri3a/api.env`. |
| [`sudoers.d/qri3a-deploy`](./sudoers.d/qri3a-deploy) | Lets the deploy user restart its own service — that one command and nothing else. |
| [`caddy/Caddyfile`](./caddy/Caddyfile) | Reverse proxy with automatic HTTPS. Use when ports 80/443 are free. |
| [`nginx/qri3a-api.conf`](./nginx/qri3a-api.conf) | A vhost to add alongside the sites an existing nginx already serves; certificate via certbot. |
| [`apache/9ri3a-api.conf`](./apache/9ri3a-api.conf) | The same, for an existing Apache. |
| [`sql/products-search-indexes.sql`](./sql/products-search-indexes.sql) | Optional indexes on `public.products`, run once as the table's owner. |
| [`../backend/api/.env.production.example`](../backend/api/.env.production.example) | Template for `/etc/qri3a/api.env`. Placeholders only — never fill this file in place. |

## The shape of it

```
the internet
     │  https
     ▼
  Caddy  (:443, certificate + renewal)
     │  http, loopback only
     ▼
  qri3a-api  (:4000, HOST=127.0.0.1, systemd, user qri3a)
     │
     ▼
  PostgreSQL
     ├── public.products   ← SELECT only, never written
     └── commerce.*        ← owned by the API: users, carts, orders, payments
```

Three deliberate choices worth knowing before you change anything:

- **Secrets live in `/etc/qri3a/api.env`, outside the checkout.** `git pull`
  cannot overwrite them, and a leaked repository leaks no credentials. The unit
  file itself holds none — systemd unit files are world-readable.
- **The API role cannot write to `public`.** The worst bug this codebase could
  ever have still cannot damage the catalogue. That is also why the search
  indexes are a separate operator-run file: indexing a table requires owning it.
- **The API binds to loopback.** Even with the firewall wide open there is no
  public socket on 4000; the proxy is the only way in.

## Deferred on purpose

The API starts and serves the full catalogue, accounts, cart and order history
with **no payment credentials configured**. `POST /payments/checkout` answers
`503` with a plain explanation until `CMI_CLIENT_ID` and `CMI_STORE_KEY` are
set, and `/health` reports `payments.configured: false` so you can see the state
at a glance. This is the normal condition while a CMI merchant contract is being
signed — it is not an error, and it does not block the deployment.

Two things *do* stop the process from starting in production, because both are
exploitable rather than merely incomplete: a `JWT_SECRET` still holding the
placeholder from the example file, and a `PUBLIC_API_URL` that is not `https`.
