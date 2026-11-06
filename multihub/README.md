# MultiHub

A single-tenant eLearning platform built from the MultiHub master blueprint —
NestJS backend (CQRS + Transactional Outbox), Next.js 15 (App Router)
frontend, a hybrid recommendation engine (cosine similarity + course
co-occurrence matrix), real asynchronous messaging via Dapr over Redis
Streams + Kafka, and clean separation of infrastructure roles: a dedicated
**Nginx serving only the frontend** (`frontend-nginx`), and **Kong as a
pure backend API gateway** — with Nginx-level performance tuning injected
directly into Kong's own `kong.conf`. The frontend never talks to the
backend directly; every API call, client-side or server-side, goes
*through* Kong.

---

## 🚀 Quick start (read this first)

```bash
docker compose up --build
```

Then open **http://localhost/** in your browser — that's the recommended
URL (see below for why `:3000`/`:3001` also work, but `:80` is the
fully-featured entry point).

**Log in with any seeded account — password is the same for all of them:**

| Email | Password | Role | What to try |
|---|---|---|---|
| `user1@multihub.dev` | `Password123!` | USER | Browse `/courses`, enroll, see recommendations on `/dashboard` |
| `user2@multihub.dev` | `Password123!` | USER | Same as above, second test learner |
| `omkishor.28471@student.trinity.edu.np` | `Password123!` | CREATOR | `/creator/dashboard` — owns the 6 seeded courses |
| `creator2@multihub.dev` | `Password123!` | CREATOR | A second, empty creator account |
| `luciferdrose124@gmail.com` | `Password123!` | ADMIN | `/admin` — approve courses, manage users |
| `omshrestha40@gmail.com` | `Password123!` | SUPERADMIN | `/superadmin` — storage strategy, commission %, plus everything ADMIN sees |

**Other useful URLs once the stack is up:**

| URL | What it is |
|---|---|
| http://localhost/ | **The app** — served by `frontend-nginx` |
| http://localhost:8000 | Kong — the backend's API gateway (what the frontend calls) |
| http://localhost:3300 | Grafana dashboards (`admin`/`admin`, or browse anonymously) |
| http://localhost:8025 | MailHog — see every email the app sends (OTP codes, welcome, receipts) |
| http://localhost:9090 | Prometheus |
| http://localhost:8001 | Kong Admin API |

**Which `.env` file do I actually need to edit?** There are three, and only
one matters for the normal Docker path:

| File | Read by | When you'd touch it |
|---|---|---|
| **`.env`** (repo root, copy from `.env.example`) | `docker compose up` | **This is the one.** Optional — only needed to enable Google sign-in, real Stripe, Cloudinary/S3, or OpenTelemetry. Everything works without it. |
| `backend/.env` | Only `npm run start:dev` run directly on your host, outside Docker | Advanced/non-Docker workflows only |
| `frontend/.env` | Only `npm run dev` run directly on your host, outside Docker | Advanced/non-Docker workflows only |

`docker-compose.yml` sets the backend/frontend's actual runtime config
itself (via its `environment:` blocks) — it does **not** read
`backend/.env` or `frontend/.env`. Those two exist only so the
backend/frontend can still run standalone on your host machine without
Docker; editing them has zero effect on `docker compose up`.

**Recommended: use http://localhost/** — `frontend-nginx` serves the app
there. Its own client-side code calls the API at `http://localhost:8000`
(Kong), and Kong's CORS config explicitly allows that origin. Opening
`:3000` directly (the frontend container, bypassing `frontend-nginx`) also
works — its API calls still route through Kong, via a `rewrites()` rule in
`next.config.ts` (using the server-side-only `API_GATEWAY_URL` env var) —
but `:80` is the primary, intended entry point.

For the full step-by-step walkthrough (health checks for every service, a
guided tour of all four roles, troubleshooting), see
[`RUNNING_GUIDE.md`](./RUNNING_GUIDE.md).

---

## One command to run everything

*(See the Quick Start block above for the URL to open and seeded login
credentials — this section just documents each container.)*

```bash
docker compose up --build
```

| Service | What it is | Port |
|---|---|---|
| `postgres` | Postgres 16 | 5433 (host) — internally still `postgres:5432` |
| `pgbouncer` | Connection pooler in front of Postgres (transaction pooling mode) — the app's runtime queries go through here | 16432 (host, debug only) — internally `pgbouncer:5432` |
| `redis` | Redis 7 (also backs the Dapr `pubsub.immediate` component + BullMQ) | 6380 (host) — internally still `redis:6379` |
| `kafka` | Kafka 3.7, single-node KRaft mode, no Zookeeper (backs `pubsub.durable`) | 19092 (host) — internally still `kafka:9092` |
| `dapr-placement` | Dapr's placement service | 50006 |
| `backend` + `backend-dapr` | NestJS app + its Dapr sidecar (shares the app's network namespace) | 3001 (app), 3500 (Dapr HTTP), 50001 (Dapr gRPC) |
| `frontend` | Next.js 15 | 3000 (direct/debug only) |
| **`frontend-nginx`** | **Primary entry point** — dedicated Nginx whose only job is serving the frontend | **80** |
| **`kong`** | **Backend API gateway** — DB-less declarative config, native `kong.conf` for Nginx tuning. The frontend calls this, never the backend directly | 8000 (proxy), 8001 (admin), 8088 (raw static Nginx) |
| `mailhog` | Local SMTP catcher + web UI | 1025 (SMTP), 8025 (UI) |
| `prometheus` / `loki` / `promtail` / `grafana` | Observability stack (see dedicated section below) | 9090 / 3100 / — / 3300 |
| `otel-collector` | Receives traces when `OTEL_ENABLED=true` (off by default) | 4317, 4318 |

Postgres, Redis, and Kafka are deliberately **not** on their standard host
ports (5432/6379/9092) — those are the ones most likely already taken by a
locally-installed service or another Docker project, so they're mapped to
free alternates on the host side only (internal container-to-container
traffic is unaffected either way). See `RUNNING_GUIDE.md` §1 for the full
list and how to remap any other port yourself if it still conflicts. The
whole stack also runs on a pinned Docker network subnet (`172.28.0.0/16`)
rather than an auto-allocated one, to reduce collisions with other
docker-compose projects running at the same time.

The backend container's entrypoint (`backend/docker-entrypoint.sh`) waits for
Postgres + Redis, pushes the Prisma schema, seeds sample data, then starts
NestJS in watch mode — a fresh `docker compose up --build` gives you a
ready-to-use app with no manual migration/seed steps.

Raw static assets (bypasses Kong's Lua/plugin layer entirely, see the Kong
section below): http://localhost:8088/static/hello.txt · API direct,
bypassing Kong: http://localhost:3001/api/courses

## Two separate, dedicated infrastructure roles: frontend-nginx and Kong

This stack deliberately does **not** have one proxy doing double duty for
both the UI and the API. Two small, single-purpose containers instead:

- **`frontend-nginx`** (`infra/nginx/frontend.conf`) — the primary entry
  point (`:80`). Its only job is reverse-proxying to the Next.js `frontend`
  container, with gzip and HMR-websocket support in dev. It has no idea the
  backend or Kong exist.
- **`kong`** (`infra/kong/`) — the backend's API gateway, and *only* the
  backend's. It has no idea the frontend exists either — its declarative
  config (`infra/kong/declarative/kong.yml`) defines exactly one real
  service (`multihub-backend` → `backend:3001`, route `/api`) plus a debug
  route for inspecting Dapr's subscription manifest.

The frontend talks to the backend **through Kong**, never directly — both
client-side (`NEXT_PUBLIC_API_URL=http://localhost:8000`) and server-side
(`API_GATEWAY_URL=http://kong:8000`, used by `next.config.ts`'s
`rewrites()`). This keeps "the backend's only public entry point is Kong"
true regardless of which path a request takes.

```
Browser
  │
  ├──► frontend-nginx :80 ──► frontend:3000 (Next.js — pages, assets, HMR)
  │
  └──► kong :8000 ──► backend:3001 (NestJS API)
         (called directly by the browser's client-side JS, AND by
          Next.js's own server via rewrites() for server-side requests)
```

### Kong internals: native `kong.conf` + Nginx tuning

Everything Kong-specific lives in `infra/kong/`:

```
infra/kong/
├── kong.conf                # native Kong config — gateway mode + ALL Nginx tuning, single file
├── declarative/kong.yml     # DB-less Services/Routes/Plugins (routing + CORS + rate limiting) — backend only
├── nginx/custom.conf        # hand-written Nginx snippet, merged in via nginx_http_include
└── static/                  # sample files served by the raw static server (see below)
```

**`kong.conf`** is the single source of truth for the underlying
Nginx/OpenResty engine — no separate `nginx.conf` file governs Kong's own
traffic handling (that's a completely different file,
`infra/nginx/frontend.conf`, used by the unrelated `frontend-nginx`
container). It uses Kong's directive-injection prefixes:

- `nginx_http_*` → injected as raw directives inside Kong's generated
  `http{}` block: `client_max_body_size`, gzip settings, keepalive tuning,
  and TLS cipher/protocol defaults (inert until an `ssl` listener + cert are
  added to `proxy_listen`, but defined so flipping on HTTPS later is a
  one-line change, not a rewrite).
- `nginx_proxy_*` → injected inside the `server{}` block that actually
  handles proxied traffic: `proxy_buffer_size`, `proxy_buffers`,
  `proxy_busy_buffers_size`, connect/send/read timeouts — real throughput
  tuning of the reverse-proxy path itself.
- `nginx_http_include = /kong/nginx/custom.conf` → merges a hand-written
  Nginx snippet into Kong's generated `http{}` block. This is how the
  "advanced requirement" (serving static content alongside the API,
  bypassing Kong's Lua/plugin pipeline for raw throughput) is implemented:
  `custom.conf` defines an entirely separate `server{}` listening on `:8088`
  that serves `infra/kong/static/*` directly — no auth/rate-limit/CORS
  plugin overhead per request, while still running inside the same
  Nginx/OpenResty process Kong manages. Try it:
  `curl http://localhost:8088/static/hello.txt`.

**`declarative/kong.yml`** (DB-less mode) is where dynamic, Lua-plugin-backed
behavior lives — routing, CORS, rate limiting, request-size limiting — kept
separate from the static Nginx tuning above so each config answers one
question: *how fast/robust is the proxy* (`kong.conf`) vs. *what does it
route and enforce* (`declarative/kong.yml`). It defines exactly one real
Kong Service (`multihub-backend` → `backend:3001`, route `/api`) plus a
debug-only route for `/dapr` — no frontend service or route at all, by
design (see above).

`docker-compose.yml` mounts all three files read-only and starts Kong with
`command: ["kong", "start", "--conf", "/etc/kong/kong.conf"]`, so `kong.conf`
is used directly rather than being synthesized from environment variables
(a couple of bootstrap env vars — `KONG_DATABASE=off`,
`KONG_DECLARATIVE_CONFIG`— are kept as a redundant safety net so the image's
own entrypoint preflight checks, which read env vars before `kong.conf` is
even parsed, don't try to wait on a database that will never appear).

## Structured logging via Pino (no console.log)

`backend/src/common/logger/pino-logger.service.ts` implements Nest's
`LoggerService` interface on top of `pino`, with sensitive fields (passwords,
tokens, OTP hashes) redacted automatically. It's registered as a `@Global()`
provider (`LoggerModule`) and wired in as the app-wide logger in `main.ts`
via `app.useLogger(...)` — which means **every** `Logger` instance anywhere
in the app, including Nest's own framework bootstrap logs, is automatically
structured JSON on stdout (pretty-printed in dev via `pino-pretty` when
`LOG_PRETTY=true`, which `docker-compose.yml` sets). `pino-http` is layered
on top for structured HTTP access logs (method, path, status, duration,
correlation id) on every request.

The services most central to the async-messaging path — `EventBusService`,
`OutboxRelayService`, `DaprController`, `CourseCatalogProjector` — inject
`PinoLoggerService` explicitly via constructor DI (rather than relying only
on the global override) so their logs carry clear `context` labels and are
easy to grep for when tracing an event from outbox row → Dapr → projector.

## Error handling — no unhandled 500s

- `HttpExceptionFilter` (global, `main.ts`) catches everything: known
  `HttpException`s pass their status/message straight through; anything
  else becomes a `500` with a generic `{ message: "Internal server error" }`
  body (never leaking stack traces to the client) and is logged via Pino
  with the request path/method for debugging.
- `EventBusService.deliverLocally()` isolates each subscriber's errors
  individually — one broken projector can never crash the process or block
  other subscribers for the same event.
- `OutboxRelayService`'s poller wraps each tick in a catch that logs and
  continues, so a transient Dapr/DB blip never stops the relay loop.
- `DaprController.handleEvent` always returns `200 { status: 'SUCCESS' }`
  even if a subscriber threw (already isolated above), so Dapr never enters
  a retry storm for an event that some subscribers *did* handle correctly.
- Kong's `KAFKA_KRAFT_CLUSTER_ID` is pinned to a fixed value in
  `docker-compose.yml` (some Kafka/Bitnami image versions fail to start
  without one set explicitly rather than auto-generating it) and both
  `redis` and `postgres` have healthchecks the `backend` service actually
  waits on (`depends_on: condition: service_healthy`), so the backend never
  starts racing against infrastructure that isn't ready yet.

## Asynchronous, cross-module events via real Dapr (Redis Streams + Kafka)

1. A **CommandHandler** (e.g. `ApproveRejectCourseHandler`) writes the domain
   row *and* an `OutboxEvent` row in one Prisma transaction (RULE-02) —
   `topic: 'course.published'`, `component: 'durable'`.
2. `OutboxRelayService` polls the `OutboxEvent` table every 500ms and calls
   `EventBusService.publish('durable', 'course.published', event)`.
3. `EventBusService` calls the **Dapr sidecar's HTTP publish API**:
   `POST http://localhost:3500/v1.0/publish/pubsub.durable/course.published`.
   `component: 'durable'` maps to the `pubsub.durable` Dapr component,
   backed by **Kafka** (`infra/dapr/components/pubsub.durable.yaml`).
   `component: 'immediate'` events (`user.login`, `notification.created`,
   `progress.updated`, `cache.invalidate`) go through `pubsub.immediate`,
   backed by **Redis Streams** (`infra/dapr/components/pubsub.immediate.yaml`).
4. Dapr delivers the message back to the app over HTTP at
   `POST /dapr/events/{topic}` — registered via the Dapr subscription
   manifest at `GET /dapr/subscribe` (`backend/src/common/events/dapr.controller.ts`).
5. `EventBusService.deliverLocally()` invokes whichever handlers were
   registered with `subscribe(topic, handler)` — the **Projectors**
   (`backend/src/projectors/*`), the only writers of the denormalized `Rm*`
   read-model tables (RULE-05), fully decoupled from the module that
   published the event (RULE-22: no direct cross-module function calls).

If the Dapr sidecar isn't reachable, `EventBusService` logs a warning (via
Pino) and falls back to in-process delivery so the app doesn't hard-fail —
but with `docker compose up`, the sidecar is always there.

**Verify it**: approve a course as ADMIN (publishes `course.published` on
Kafka), then inspect the topic directly:
```bash
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic course.published --from-beginning
```

## Recommendation engine

`backend/src/common/recommendation/`:
- `dictionary.ts` — finite vocabulary encoding (RULE-17: no opaque vectors).
- `similarity.service.ts` — **cosine similarity** (content-based).
- `cooccurrence.service.ts` — **co-occurrence matrix** from enrollment
  patterns, Jaccard similarity (collaborative filtering).
- `recommender.service.ts` — hybrid `0.5 * cosine + 0.5 * co-occurrence`,
  Redis-cached, popularity fallback for new users.

Exposed at `GET /api/recommendations`, shown on the frontend dashboard.

## Observability: Prometheus + Loki + Promtail + Grafana (all dockerized)

Four extra containers, fully wired out of the box — no manual dashboard
setup required:

| Service | Role | URL |
|---|---|---|
| `prometheus` | Scrapes metrics every 10s from the backend (`GET /metrics`) and from Kong (`GET :8001/metrics`, via Kong's built-in `prometheus` plugin, enabled in `infra/kong/declarative/kong.yml`) | http://localhost:9090 |
| `loki` | Log aggregation, local filesystem storage | http://localhost:3100 |
| `promtail` | Tails **every** container's Docker log stream (via the Docker socket) and pushes it to Loki | — |
| `grafana` | Dashboards, pre-provisioned with both datasources + a starter dashboard | http://localhost:3300 (`admin`/`admin`, or just browse anonymously as Viewer) |

**How Pino logs actually get to Loki**: `backend/src/common/logger/pino-logger.service.ts`
writes structured JSON to stdout (wired app-wide via `app.useLogger(...)` in
`main.ts`, so this covers every `Logger` instance in the codebase, not just
HTTP access logs from `pino-http`). Docker's logging driver captures that
stdout stream for the `backend` container like it does for every container.
`promtail` (via `docker_sd_configs` service discovery over the Docker
socket) tails that log stream and pushes it into Loki, labeled with
`compose_service="backend"`. No custom Loki transport inside the Node
process, no log files to manage — this is the exact "Pino JSON → stdout →
Docker → Promtail → Loki → Grafana" pipeline from the original blueprint
(§7), fully dockerized.

Open Grafana (http://localhost:3300) → **Dashboards → MultiHub → MultiHub
Overview** to see, live:
- HTTP requests/sec by route + status code, and p95 latency
- Outbox events published/sec by topic (proof the CQRS+outbox pipeline is
  flowing)
- Dapr publish duration p95 by component (`immediate` = Redis Streams vs
  `durable` = Kafka)
- Recommendation compute duration p95
- Emails sent/sec by template
- A live tail of the backend's Pino logs, queryable with LogQL (e.g.
  `{compose_service="backend"} | json | level="error"` to filter to errors
  only, since every log line is JSON)

The metrics themselves are instrumented in `backend/src/metrics/` using
`prom-client`, registered as a `@Global()` module (`MetricsModule`) and
injected directly into the services that matter most:
`EventBusService` (Dapr publish duration), `OutboxRelayService` (publish
counter), `RecommenderService` (compute duration), `EmailService` (sent
counter), plus a request-timing middleware in `main.ts` for the generic HTTP
metrics. Default Node.js process metrics (`multihub_process_*` — heap,
event loop lag, GC) are included automatically via
`client.collectDefaultMetrics()`.

## BullMQ — local job queue (non-Dapr work only)

Per the blueprint's tech stack ("Job Queue: BullMQ, for non-Dapr local jobs
only"), `backend/src/common/queue/` adds a Redis-backed BullMQ queue for
work that's local to the backend process and doesn't need to be a
durable, replayable, cross-module event:

- `CertificateQueueService` — enqueues a `certificate-generation` job.
- `CertificateWorker` — a BullMQ `Worker` (concurrency 2, 3 retries with
  exponential backoff) that "generates" a certificate (simulated — the
  blueprint specifies PDFKit for the real version) and emails it.
- `QueueModule` subscribes to the **Dapr-delivered** `enrollment.completed`
  event (Redis Streams/Kafka, RULE-22) and, on receipt, enqueues the BullMQ
  job — this is the deliberate hand-off point between "this needs to reach
  other modules/services" (Dapr) and "this is just local background work
  with retry semantics" (BullMQ). Both share the same Redis instance but
  use entirely different data structures under the hood, so they never
  collide.

Complete a course as a learner and watch `docker compose logs -f backend`
for `CertificateQueueService`/`CertificateWorker` log lines, then check
MailHog (http://localhost:8025) for the resulting email.

## Real integrations: Google OAuth, Stripe, and file storage

All three are **optional and off by default** — the app is fully usable
with zero external accounts. Each one flips on automatically the moment you
provide its credentials, with no code changes.

### Google OAuth ("Continue with Google")

Implemented with the standard NestJS/Passport stack: `passport`,
`passport-google-oauth20`, and `@nestjs/passport`
(`backend/src/modules/auth/strategies/google.strategy.ts`).

1. Go to https://console.cloud.google.com/apis/credentials, create an OAuth
   2.0 Client ID (type: Web application).
2. Authorized redirect URI: `http://localhost:3001/api/auth/google/callback`
3. Put the client ID/secret in a `.env` file next to `docker-compose.yml`
   (copy `.env.example` → `.env`):
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
4. `docker compose up --build` (or just restart the `backend` service).

The frontend's "Continue with Google" button
(`frontend/src/components/GoogleSignInButton.tsx`) only renders once it
confirms via `GET /api/auth/google/status` that credentials are configured
— so there's never a dead button in the UI, and never a way to hit a
broken OAuth flow. Until you configure it, `GET /api/auth/google` returns a
clean `503` (via `GoogleConfiguredGuard`) instead of crashing the app, which
is what would otherwise happen — `passport-google-oauth20`'s `Strategy`
constructor throws synchronously if `clientID`/`clientSecret` are empty, so
`GoogleStrategy` is only ever registered as a Nest provider when
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are both set
(`backend/src/modules/auth/auth.module.ts`).

Flow: browser → `GET /api/auth/google` → Google consent screen → Google
redirects to `GET /api/auth/google/callback` → backend finds/links/creates
the user (`GoogleAuthHandler`) → redirects to
`http://localhost/auth/callback?accessToken=...&refreshToken=...&user=...`
→ the frontend's `/auth/callback` page saves the session and lands on
`/dashboard`, identical to a normal email/password login from that point on.

### Stripe

`backend/src/modules/payment/commands/checkout.handler.ts` uses the real
Stripe SDK when `STRIPE_SECRET_KEY` (starts with `sk_`) is set, with a
signature-verified webhook (`POST /api/payments/webhook`, using
`STRIPE_WEBHOOK_SECRET` and Nest's `rawBody: true` option). Get test keys at
https://dashboard.stripe.com/test/apikeys, add them to `.env`, and for local
webhook delivery use the Stripe CLI:
```bash
stripe listen --forward-to localhost:3001/api/payments/webhook
```
Without a key configured, checkout falls back to the local mock flow
already described above (`POST .../complete/:sessionId` simulates the
webhook) — nothing changes about the purchase → enrollment UX either way.

### File storage (RULE-12 strategy pattern)

`backend/src/common/storage/` implements local disk, Cloudinary, and S3
adapters behind one `StorageService` that reads the active strategy from
the `StorageConfig` DB singleton (settable at `/superadmin`, Redis-cached
1h). Defaults to `local` (files land under `./uploads`, served back out at
`/uploads/*`). To use Cloudinary or S3 instead, set `STORAGE_STRATEGY` plus
the matching `CLOUDINARY_*` or `AWS_*` vars in `.env`. Wired up at
`POST /api/auth/avatar` and `POST /api/courses/:id/thumbnail`
(multipart/form-data, field name `file`).

### OpenTelemetry (optional tracing)

`backend/src/tracing.ts` (imported first in `main.ts`, before anything else,
so auto-instrumentation can patch `http`/`express`/`pg`/`ioredis`) starts an
OTel Node SDK exporting to the `otel-collector` service — off by default
(`OTEL_ENABLED=false`). Set `OTEL_ENABLED=true` in `.env` to turn it on; the
collector (`infra/otel/otel-collector-config.yaml`) just logs traces via its
`debug` exporter out of the box — wire in a `tempo` exporter + add Tempo as
a Grafana datasource if you want traces visualized alongside the existing
Prometheus/Loki dashboards.

### PgBouncer (connection pooling)

`docker-compose.yml` puts a `pgbouncer` service (transaction pooling mode)
between the backend and Postgres. The split mirrors
[Prisma's own documented pattern for PgBouncer](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections#pgbouncer):

- **`DATABASE_URL`** → `postgresql://...@pgbouncer:5432/...` — what
  `PrismaClient` uses for every runtime query, pooled.
- **`DIRECT_DATABASE_URL`** → `postgresql://...@postgres:5432/...` — set as
  `directUrl` in `prisma/schema.prisma`. Prisma automatically uses this
  instead for `prisma migrate`/`prisma db push`, bypassing the pooler,
  because transaction-mode PgBouncer doesn't support the prepared
  statements those commands issue.

`backend/docker-entrypoint.sh` waits for both `postgres` and `pgbouncer`
to be healthy before running `prisma db push`. In the standalone/non-Docker
workflow (`backend/.env`), there's no PgBouncer, so both variables just
point at the same direct connection.

### Real SMTP (beyond MailHog)

By default, `SMTP_HOST`/`SMTP_PORT` point at MailHog (`docker-compose.yml`'s
`mailhog` service), which needs no authentication — every email the app
sends shows up at http://localhost:8025 instead of actually being
delivered. To send through a real provider (Gmail, SendGrid, etc.), set
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASS` in the
root `.env`. `EmailService` (`backend/src/common/email/email.service.ts`)
only attaches nodemailer's `auth` block when both `SMTP_USER` and
`SMTP_PASS` are set — sending an empty `{ user: '', pass: '' }` auth object
to some providers gets treated as a failing login attempt rather than "no
auth needed", so it's omitted entirely rather than sent empty.

## Full module list (backend)

`auth` (register/login/OTP, Google OAuth, avatar upload), `course` (incl.
creator's own list/update/archive, section/lesson builder, thumbnail
upload), `enrollment`, `payment` (real Stripe SDK + signature-verified
webhook, mock fallback), `review`, `payout` (request/process with
commission math), `superadmin` (storage strategy + commission), `admin`
(user suspend/ban/reactivate), `analytics` (creator + admin), `search`
(filtered + suggestions), `notification`, `recommendation`.

## Full page list (frontend)

`/`, `/courses`, `/courses/[slug]` (with review form), `/search`, `/login`,
`/register`, `/dashboard`, `/notifications`, `/creator/dashboard`,
`/creator/courses/new`, `/creator/courses/[id]/manage`, `/admin`,
`/superadmin`.

## What's simplified vs. the full 50-section blueprint

- **Stripe, Google OAuth, and file storage are real integrations with
  graceful fallbacks** (see the section above) — not stubs. They just
  require you to supply credentials to activate; everything works
  end-to-end without them too.
- **Jenkins CI** isn't included — there's no `Jenkinsfile` or CI pipeline
  wired up in this build. Grafana/Loki/Prometheus/Promtail, by contrast,
  **are** included and fully dockerized (see the Observability section
  above).
- **Analytics** are computed on demand from write+read models rather than
  materialized into dedicated `RmAdminAnalytics`/`RmCreatorAnalytics`
  projector tables, to keep scope tractable.

## Project layout

```
multihub/
├── docker-compose.yml
├── infra/
│   ├── dapr/components/        # pubsub.immediate.yaml (Redis Streams), pubsub.durable.yaml (Kafka), state.redis.yaml
│   ├── dapr/configuration/     # appconfig.yaml (tracing/metrics)
│   ├── kong/                   # kong.conf, declarative/kong.yml, nginx/custom.conf, static/ — backend API gateway ONLY
│   └── nginx/                  # frontend.conf — dedicated Nginx serving ONLY the frontend
├── backend/
│   ├── Dockerfile.dev, docker-entrypoint.sh
│   ├── prisma/schema.prisma, prisma/seed.ts
│   └── src/
│       ├── config/env.ts       # RULE-08: only source of process.env
│       ├── common/
│       │   ├── logger/         # PinoLoggerService + global LoggerModule
│       │   ├── events/         # EventBusService (real Dapr HTTP publish) + DaprController
│       │   ├── outbox/         # outbox relay (polls OutboxEvent, publishes via Dapr)
│       │   ├── recommendation/ # cosine similarity + co-occurrence engine
│       │   ├── guards/         # JWT + Roles (RULE-19: SUPERADMIN bypass)
│       │   └── email/          # nodemailer -> MailHog
│       ├── modules/            # auth, course, enrollment, payment, review, payout, superadmin, admin, analytics, search, notification, recommendation
│       └── projectors/         # idempotent Rm* table writers (RULE-05), subscribed via Dapr topics
├── frontend/                   # Next.js 15 App Router, next.config.ts, Tailwind
```

## Tests

```bash
cd backend
npm test
```

A representative set of unit tests covers the recommendation engine
(`dictionary.spec.ts`, `similarity.service.spec.ts`) — a starting point, not
the full ~383-test suite from the blueprint. The same pattern (mock Prisma,
assert on outbox rows + event topics) extends directly to the remaining
handlers.
