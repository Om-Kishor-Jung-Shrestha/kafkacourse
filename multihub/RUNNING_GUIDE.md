# Running MultiHub — Step-by-Step Guide

This walks through getting the full stack running from a completely fresh
machine, verifying every piece is healthy, exercising the main user flows,
and troubleshooting the handful of things that commonly go wrong with a
Docker Compose stack this size (Postgres + Redis + Kafka + Dapr + Kong +
frontend-nginx + Next.js + NestJS).

---

## 1. Prerequisites

| Requirement | Why | Check |
|---|---|---|
| Docker Desktop (or Docker Engine + Compose v2) | Runs the entire stack | `docker --version` and `docker compose version` |
| ~4 GB free RAM for Docker | Postgres + Redis + Kafka + Dapr + Kong + 2 Node apps | Docker Desktop → Settings → Resources |
| Ports free on your machine | See table below | `lsof -i :80` (macOS/Linux) or `netstat -ano \| findstr :80` (Windows) |
| Internet access | First build pulls 14 images and builds 2 more, installs npm packages | — |

Ports the stack uses on your host machine — make sure nothing else is bound
to these before starting. Postgres/Redis/Kafka are deliberately **not** on
their textbook-standard ports (5432/6379/9092) — see the note right after
the table for why:

```
80    → frontend-nginx (primary entry point — serves the app)
1025  → MailHog SMTP (the backend sends mail here; not for browsing)
3000  → Next.js frontend (direct/debug, bypasses frontend-nginx)
3001  → NestJS backend (direct/debug + GET /metrics for Prometheus — metrics
         are served on this SAME port, there is no separate metrics port)
3100  → Loki API
3300  → Grafana UI
3500  → Dapr HTTP sidecar
4317  → OpenTelemetry Collector, OTLP gRPC (only relevant if OTEL_ENABLED=true)
4318  → OpenTelemetry Collector, OTLP HTTP (only relevant if OTEL_ENABLED=true)
5433  → Postgres (intentionally NOT 5432 — see note below)
6380  → Redis (intentionally NOT 6379 — see note below; also backs BullMQ)
8000  → Kong (the backend's API gateway — NOT the app itself; the frontend calls this)
8001  → Kong Admin API (+ Kong's own Prometheus metrics at /metrics)
8025  → MailHog web UI (browse sent emails here)
8088  → Kong's embedded static-file Nginx server
9090  → Prometheus UI
16432 → PgBouncer (connection pooler in front of Postgres — the app's runtime queries go through here, debugging access only)
19092 → Kafka (intentionally NOT 9092 — see note below)
50001 → Dapr gRPC
50006 → Dapr placement service
```

**Why Postgres/Redis/Kafka aren't on their "standard" ports**: those are
exactly the ports most likely already bound by a locally-installed
Postgres/Redis/Kafka on your machine (or another Docker project), so this
stack maps them to unused alternates on the **host** side only — every
container still talks to every other container internally using the
standard ports (`postgres:5432`, `redis:6379`, `kafka:9092`), so nothing
about the app itself changes. The whole stack also runs on its own pinned
Docker network subnet (`172.28.0.0/16`, see `networks:` at the bottom of
`docker-compose.yml`) rather than Docker's auto-allocated default, to
reduce the chance of colliding with another docker-compose project's
network if you have several running at once.

If any port is still already used on your machine, either stop whatever
owns it, or edit the `ports:` mapping for that service in
`docker-compose.yml` (only change the **left** side of `"host:container"`
— the container-internal port must stay the same).

---

## 2. Unpack and start

```bash
unzip multihub.zip
cd multihub

# Optional: enable Google sign-in / real Stripe / Cloudinary or S3 storage /
# OpenTelemetry by copying this and filling in credentials. Skip entirely
# and everything still works (Google sign-in stays hidden, Stripe stays in
# local mock-checkout mode, storage stays local-disk).
cp .env.example .env   # then edit .env

docker compose up --build
```

First run will take a few minutes: Docker needs to pull `postgres:16-alpine`,
`edoburu/pgbouncer:latest`, `redis:7-alpine`, `apache/kafka:3.7.0`,
`daprio/dapr:1.14.4`, `daprio/daprd:1.14.4`, `kong:3.7`, `nginx:alpine`
(for `frontend-nginx`), `mailhog/mailhog`, `prom/prometheus:latest`,
`grafana/loki:latest`, `grafana/promtail:latest`, `grafana/grafana:latest`,
`otel/opentelemetry-collector-contrib:latest`, plus build the `backend` and
`frontend` images (which run `npm install` inside the container).
Subsequent runs are much faster since layers are cached.

Leave this terminal open — it streams logs from every service. You're
looking for these signals that things came up correctly (search the scrolling
log for these strings):

```
postgres_1        | database system is ready to accept connections
pgbouncer_1       | process up: PgBouncer
redis_1           | Ready to accept connections tcp
kafka_1           | [KafkaServer id=1] started
backend_1         | [entrypoint] postgres is up
backend_1         | [entrypoint] pgbouncer is up
backend_1         | [entrypoint] redis is up
backend_1         | [entrypoint] pushing prisma schema...
backend_1         | [entrypoint] seeding database...
backend_1         | Seed complete. Login with any seeded email...
backend_1         | MultiHub backend listening on http://localhost:3001
backend-dapr_1    | time=... level=info msg="dapr initialized. Status: Running."
kong_1            | Kong started
frontend_1        | ▲ Next.js 15...
frontend_1        | ✓ Ready in ...
frontend-nginx_1  | (no output on success — Nginx is quiet when things work)
```

If you'd rather run it in the background:

```bash
docker compose up --build -d
docker compose logs -f backend   # tail just the backend
docker compose logs -f kong      # tail just the gateway
```

---

## 3. Verify each piece is healthy

Run these one at a time (from a **second** terminal, since the first is
tailing logs):

```bash
# 1. Postgres accepting connections
docker compose exec postgres pg_isready -U postgres
# → /var/run/postgresql:5432 - accepting connections

# 2. Redis responding
docker compose exec redis redis-cli ping
# → PONG

# 3. Kafka has created a topic (once the app has published at least one event)
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list

# 4. Backend health (direct, bypassing Kong)
curl -s http://localhost:3001/api/courses | head -c 300
# → {"data":[...seeded courses...],"total":6,"page":1}

# 5. Kong (the API gateway) is proxying the backend correctly
curl -s http://localhost:8000/api/courses | head -c 300
# → same response as #4, proxied through Kong

# 6. frontend-nginx is serving the app correctly
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/
# → 200

# 7. Kong's embedded static-file Nginx server (the nginx_http_include demo)
curl http://localhost:8088/static/hello.txt
# → MultiHub static asset test file — reachable at http://localhost:8088/static/hello.txt

# 8. Dapr sidecar is reachable from the backend container
docker compose exec backend curl -s http://localhost:3500/v1.0/healthz
# → (empty 200 response = healthy)

# 9. Dapr subscription manifest (topics registered by the app)
curl -s http://localhost:3001/dapr/subscribe | head -c 400

# 10. Backend Prometheus metrics endpoint
curl -s http://localhost:3001/metrics | head -20
# → text/plain Prometheus exposition format, starting with multihub_process_* etc.

# 11. Prometheus itself is scraping the backend successfully
curl -s "http://localhost:9090/api/v1/query?query=up" | python3 -m json.tool
# → look for {"job":"multihub-backend", ...}, "value":[..., "1"] (1 = up)

# 12. Loki is reachable and has received at least one log line
curl -s "http://localhost:3100/loki/api/v1/labels" | python3 -m json.tool
# → should include "compose_service" among the labels once Promtail has run for a few seconds

# 13. Grafana is up (default creds: admin / admin)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3300/api/health
# → 200
```

If **all thirteen** of these succeed, the stack — including the full
observability pipeline — is fully up.

### Exploring Grafana

1. Open http://localhost:3300 (log in as `admin`/`admin`, or just browse —
   anonymous Viewer access is enabled).
2. **Dashboards → MultiHub → MultiHub Overview** — pre-provisioned, no setup
   needed. Shows HTTP request rate/latency, outbox publish rate, Dapr
   publish duration, recommendation compute duration, emails sent, and a
   live log tail.
3. **Explore → Loki** — try the query `{compose_service="backend"} | json`
   to see every backend log line parsed into structured fields (since
   they're all JSON from Pino). Add `| level="error"` to filter to errors.
4. **Explore → Prometheus** — try `rate(multihub_http_requests_total[1m])`
   or `multihub_process_resident_memory_bytes` (default Node process
   metrics, collected automatically).

---

## 4. Log in and try the main flows

Open **http://localhost/** — `frontend-nginx` serves the app there
(`:3000` also works directly, bypassing `frontend-nginx`, since API calls
still route through Kong either way — see the README's architecture
section).

Seeded accounts (password for all: `Password123!`):

| Email | Role | What to try |
|---|---|---|
| `user1@multihub.dev` | USER | Browse `/courses`, enroll in "Guitar Basics" (free), check `/dashboard` for progress + recommendations |
| `omkishor.28471@student.trinity.edu.np` | CREATOR | `/creator/dashboard` → owns the 6 seeded courses; create a new one at `/creator/courses/new`, add sections/lessons, submit for review |
| `luciferdrose124@gmail.com` | ADMIN | `/admin` → approve/reject pending courses, suspend/ban users |
| `omshrestha40@gmail.com` | SUPERADMIN | `/superadmin` → change storage strategy / commission %; also sees everything ADMIN sees |

Suggested end-to-end walkthrough:

1. **Log in as the CREATOR**, go to `/creator/courses/new`, create a course
   (any category/level), you'll land on `/creator/courses/[id]/manage` —
   add a section, add a lesson, click **Submit for review**.
2. **Log out, log in as ADMIN**, go to `/admin`, find the new course under
   "Pending course approvals", click **Approve**. Check MailHog
   (http://localhost:8025) — the creator gets a "course approved" email.
3. Watch the backend logs (`docker compose logs -f backend`) — you'll see
   the Pino JSON log line for the `course.published` event being published
   through Dapr, then the projector picking it up and updating
   `RmCourseCatalog`.
4. Confirm it landed on Kafka:
   ```bash
   docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
     --bootstrap-server localhost:9092 --topic course.published --from-beginning
   ```
5. **Log in as a USER**, go to `/courses`, find the new course, click
   **Enroll** (simulates Stripe checkout instantly if paid, or enrolls
   directly if free), leave a review, then check `/dashboard` —
   recommendations should now factor in the new enrollment (co-occurrence +
   cosine similarity against your taste profile).
6. **Request a payout** as the CREATOR (`/creator/dashboard` → "Request
   payout"), then **process it** as ADMIN (`/admin` doesn't have a payout UI
   in this build — process it via the API directly):
   ```bash
   TOKEN=<admin access token from localStorage after logging in>
   curl -X PATCH http://localhost:8000/api/payouts/<payout-id>/process \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"status":"PROCESSED"}'
   ```
7. **See BullMQ in action**: as the USER, mark an enrollment's progress to
   100% (there's no dedicated "complete course" button in this build — call
   the API directly):
   ```bash
   TOKEN=<user access token>
   curl -X PATCH http://localhost:8000/api/enrollments/<enrollment-id>/progress \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"progressPercent":100}'
   ```
   This publishes `enrollment.completed` through Dapr, which
   `QueueModule` picks up and enqueues a BullMQ `certificate-generation`
   job. Watch `docker compose logs -f backend` for
   `CertificateQueueService`/`CertificateWorker` log lines, then check
   MailHog (http://localhost:8025) for the "certificate ready" email.

---

## 5. Running backend tests

```bash
docker compose exec backend npm test
```

or, without Docker, from your host (needs Node 20+ installed locally):

```bash
cd backend
npm install
npm test
```

---

## 6. Stopping / resetting

```bash
# Stop everything, keep data (Postgres/Kafka volumes persist)
docker compose down

# Stop everything AND wipe all data (fresh seed on next `up`)
docker compose down -v

# Rebuild after changing a Dockerfile or package.json
docker compose up --build
```

Code changes in `backend/src/**` and `frontend/src/**` hot-reload
automatically (both containers mount your local folder as a volume and run
in watch/dev mode) — you don't need to rebuild for ordinary code edits, only
for dependency or Dockerfile changes.

---

## 7. Troubleshooting

**`backend` crashes at boot with `UnknownDependenciesException ... Nest
can't resolve dependencies of the JwtAuthGuard ... in the NotificationModule`**
(or any other module name)
→ A real bug, now fixed: `JwtAuthGuard` (used by nearly every protected
route across the app) needs `JwtService`, but it used to only be provided
by `AuthModule`, which wasn't marked `@Global()` — so every *other* module
using `@UseGuards(JwtAuthGuard)` (which is most of them) would fail this
exact way, not just the one named in the error. Fixed by moving
`JwtModule.register(...)` into its own dedicated `@Global()` module
(`backend/src/common/jwt/jwt-global.module.ts`), registered once in
`AppModule`, so `JwtService` is available everywhere without every module
needing its own explicit import. If you're on an older copy of this
project and hit this, either re-download it, or add
`imports: [AuthModule]` to every module whose controller uses
`JwtAuthGuard`.

**`frontend` crashes with `It looks like you're trying to use tailwindcss
directly as a PostCSS plugin`**
→ Another real bug, now fixed: `frontend/package.json` was pinning
`tailwindcss: ^4.0.0`, but `postcss.config.js`/`tailwind.config.ts`/
`globals.css` were all written in Tailwind v3's syntax (v4 moved its
PostCSS plugin to a separate `@tailwindcss/postcss` package and changed
several other conventions). Fixed by pinning back to `tailwindcss: ^3.4.14`
to match the config already in place, rather than rewriting everything for
v4. If you're on an older copy, either re-download it, or change that one
line in `frontend/package.json` and reinstall.

**`pgbouncer` logs `login failed: db=postgres ... no such database: postgres`
repeatedly, every ~10 seconds**
→ Cosmetic, now fixed: this was our own PgBouncer healthcheck
(`pg_isready -h localhost -p 5432 -U postgres`) — without an explicit `-d`
flag, `pg_isready` defaults to a database name matching the username
(`postgres`), but PgBouncer's `[databases]` config only defines
`multihub_dev`, so it rejected every probe. The actual app connections were
never affected (they always specify `multihub_dev` correctly), just the
healthcheck itself was noisy. Fixed by adding `-d multihub_dev` to the
healthcheck command.

**`failed to copy: httpReadSeeker ... TLS handshake timeout` (or similar
network errors) while pulling images**
→ This is a transient network failure talking to Docker Hub, not a project
config issue — `docker compose up --build` pulls 9+ images in parallel on
first run, which can saturate a home connection/router and cause one
connection to drop mid-transfer. Fix: just run
`docker compose up -d --build` again (Compose resumes partial pulls). If it
recurs, pull images one at a time instead of all-in-parallel:
`docker compose pull <service-name>` for each service in `docker-compose.yml`,
then `docker compose up -d --build` once everything is cached locally. If it
keeps happening specifically, check for a corporate proxy/VPN/antivirus
doing TLS inspection, which is the most common cause of repeated handshake
timeouts to the same host.

**`docker compose up` fails with `... : not found` for one of the images**
→ A vendor deprecated/renamed the exact tag pinned in `docker-compose.yml`
(this has already happened twice during development of this project —
`bitnami/kafka:3.7` and `kong:3-alpine` both got pulled from Docker Hub after
being pinned). This is a registry-side change, not a code bug. Fix:
1. Find which image failed in the `docker compose up` output (look for the
   `Error response from daemon: failed to resolve reference "..."` line).
2. Check what tags currently exist for that image, e.g.
   `https://hub.docker.com/r/kong/kong-gateway/tags` or search
   `<image name> docker hub tags`.
3. Update the `image:` line for that service in `docker-compose.yml` to a
   tag that currently exists, then re-run `docker compose up --build`.
   Everything else in the stack (Dapr components, Kong's declarative
   config, the backend/frontend code) is independent of the exact base
   image tag, so this is always a one-line fix.

**`docker compose up` fails immediately with a port conflict**
→ Something on your machine already owns one of the ports listed in
section 1. Stop it, or remap the host-side port in `docker-compose.yml`.

**`kong` container exits right after starting**
→ `docker compose logs kong`. Almost always one of: (a) the declarative
config has a YAML syntax error — validate with
`docker compose exec kong kong config parse /kong/declarative/kong.yml`;
(b) a port already in use on the host.

**`kafka` exits with `Error while writing meta.properties file`**
→ This was a real bug in earlier versions of this project's
`docker-compose.yml`: the `kafka` service used to mount a named Docker
volume at `/tmp/kraft-combined-logs`, but the `apache/kafka` image runs as
a non-root user (uid 1000) and a freshly-created named volume is
root-owned, so KRaft's storage-format step couldn't write to it. Fixed by
removing that volume entirely (Kafka just uses its own container
filesystem now — fine for local dev, since topics are demo data that
doesn't need to survive `docker compose down`). If you're on an older copy
of this project and hit this, either re-download it or remove the
`kafka_data:...` volume line from the `kafka` service and the top-level
`volumes:` block yourself, then `docker compose down -v && docker compose up --build`.

**`loki` exits immediately with `CONFIG ERROR: invalid compactor config:
compactor.delete-request-store should be configured when retention is
enabled`**
→ Another real bug, now fixed: `infra/loki/loki-config.yml`'s `compactor`
block needs `delete_request_store: filesystem` whenever
`retention_enabled: true` is set (required by newer Loki versions, wasn't
in earlier copies of this file). If you're on an older copy, add that one
line under `compactor:` in `infra/loki/loki-config.yml`.

**Frontend loads at `http://localhost/` but API calls fail (network errors
in the browser console)**
→ Check that the `kong` container is actually up and healthy
(`docker compose ps kong`) — the frontend's client-side code calls the API
directly at `http://localhost:8000` (Kong), which is a different container
from `frontend-nginx`. If Kong isn't running, API calls will fail even
though the page itself loads fine via `frontend-nginx`.

**Backend keeps logging "Dapr sidecar unreachable... delivering in-process
instead"**
→ The `backend-dapr` sidecar container isn't up yet, or crashed. Check
`docker compose logs backend-dapr`. The app still works via the in-process
fallback, but you won't get real Redis Streams/Kafka delivery until the
sidecar is healthy — `docker compose restart backend-dapr` often fixes it.

**`docker compose exec backend npx prisma ...` fails to reach
`binaries.prisma.sh`**
→ You need outbound internet access from the Docker container the first
time Prisma downloads its query engine binaries; this is a one-time
download that gets cached in the image layer afterward.

**`promtail` logs permission errors reading `/var/run/docker.sock`**
→ On Linux, the container needs read access to the Docker socket. Either
run `sudo chmod 666 /var/run/docker.sock` (fine for local dev, not for a
real server) or add your user to the `docker` group and restart Docker.
Docker Desktop on macOS/Windows doesn't usually hit this.

**Grafana dashboard panels show "No data"**
→ Give it ~30 seconds after first boot (Prometheus's first scrape + a few
label-generating log lines need to happen first). If it persists, check
`docker compose logs prometheus` for scrape errors, and confirm
`curl http://localhost:3001/metrics` returns data directly.

**A page shows "Internal server error" (500)**
→ Check `docker compose logs -f backend` — every 500 is logged as
structured JSON via Pino with the request path, method, and the original
error message/stack (see README § "Error handling — no unhandled 500s").
This should never leak to the browser, but the server-side log will always
have the real cause.

---

## Troubleshooting: backend image hangs / "v2 database format error"

The backend image is based on `node:22-bookworm-slim` (Debian), not Alpine.
Alpine's package CDN (`dl-cdn.alpinelinux.org`) can return corrupt/blocked
responses on some networks, which made `apk add` hang for minutes and fail
with `WARNING: fetching .../APKINDEX.tar.gz: v2 database format error`.

If you previously built the backend on Alpine, reset stale volumes (native
modules like bcrypt/Prisma engines are OS-specific):

```
docker compose down -v
docker compose build --no-cache backend
docker compose up
```

For readable build logs: `docker compose build --progress=plain backend`

## Troubleshooting: backend unhealthy, "wrong password type" in pgbouncer logs

The PgBouncer container must use `AUTH_TYPE: plain` (set in docker-compose.yml).
With `trust`, the image stores an MD5 hash of the password, which PgBouncer
cannot use to log in to Postgres 16 (SCRAM) -> `server login failed: wrong
password type`. If you still see it, recreate the containers:

```
docker compose down
docker compose up --build
```

## Kafka UI

Browse topics, messages and consumer groups at http://localhost:8090
(service `kafka-ui`, connected to `kafka:9092`).

## Troubleshooting: Kong (http://localhost:8000) refuses connection

Check whether the container is running and why it stopped:

```
docker compose ps -a kong
docker compose logs kong --tail 40
```

Fixed: Kong failing with `"ssl_ciphers" directive is duplicate` — the TLS
settings in infra/kong/kong.conf now use Kong's native `ssl_*` options instead
of `nginx_http_ssl_*` injections.

---

## What's in the UI (Udemy-style frontend)

| Area | Routes |
| --- | --- |
| Home (hero, categories, continue learning, recommended / popular / new / free rows) | `/` |
| Catalog: search, category / level / price filters, sort, pagination | `/courses` |
| Course page: curriculum accordion, reviews + rating breakdown, checkout modal | `/courses/[slug]` |
| Course player: video (YouTube or .mp4), per-lesson completion, progress | `/learn/[enrollmentId]` |
| My learning (tabs, stats, resume), purchase history, notifications | `/dashboard`, `/purchases`, `/notifications` |
| Account settings (avatar, name, email verification), become an instructor | `/profile`, `/teach` |
| Creator Studio: stats, revenue chart, courses, payouts, curriculum builder | `/creator/dashboard`, `/creator/courses/new`, `/creator/courses/[id]/manage` |
| Admin (approvals with preview + reject reason, users, payouts) / SuperAdmin settings | `/admin`, `/superadmin` |

Demo logins (password `Password123!`) are one click on `/login` in dev.

### Backend additions that support the UI
- `POST /api/auth/refresh` (rotating refresh tokens), `POST /api/auth/logout`, `PATCH /api/auth/profile`
- `GET /api/enrollments/:id/learn`, `POST /api/enrollments/:id/lessons/:lessonId/complete` (real per-lesson progress)
- Curriculum CRUD with ownership checks: update/delete sections and lessons, lesson `videoUrl`
- Public course detail no longer exposes lesson video URLs / text (served only to enrolled learners)
- Notifications: `read-all`, `unread-count`, ownership-checked mark-read
- Catalog read model now refreshes on course edit/archive; rejected courses can be resubmitted
- Creator analytics: monthly revenue + top courses; admin analytics: monthly revenue

After pulling these changes run `docker compose up --build` (the seed also refreshes demo lessons with sample videos).

---

## Selling courses (Udemy-style commerce)

**Learner flow:** course page → *Add to cart* / *Buy now* / wishlist ♥ → `/cart` (promo code, save for later) → `/checkout` → `/checkout/success` (receipt) → `/learn/...`.
Purchase history with **30-day refunds** (while < 50 % of the course is completed) is at `/purchases`; finishing a course unlocks a printable **certificate** (`/certificate/[id]`, publicly verifiable at `/verify/[code]`).

**Instructor flow:** Creator Studio shows gross sales, *your earnings* (after the platform fee set by the SuperAdmin), a recent-sales table and payouts. `/creator/coupons` creates percentage coupons for one course or all of your courses (share a link such as `/courses/<slug>?couponCode=CODE`). Course landing pages support a subtitle, "what you'll learn" and requirements.

**Admin:** platform-wide coupons from the Admin page.

**Demo coupons (seeded):** `WELCOME20` (20 % off everything), `CREATOR50` (50 % off the demo creator's courses), `FREEBIE100` (100 % off, 25 uses).

**Payments:** without `STRIPE_SECRET_KEY` checkout runs in *test mode* (no card; completing the order enrolls you). With a key set, checkout redirects to real Stripe Checkout and the signed webhook fulfils the order; refunds are issued through Stripe.

**New API:** `GET/POST/DELETE /api/cart[/:courseId]`, `GET/POST/DELETE /api/wishlist[/:courseId]`, `POST /api/payments/quote`, `POST /api/payments/checkout` (cart or `courseIds`), `GET /api/payments/orders/:id`, `POST /api/payments/:id/refund`, `GET/POST/PATCH/DELETE /api/coupons`, `GET /api/analytics/creator/sales`, `GET /api/enrollments/:id/certificate`, `GET /api/certificates/:code`.
New tables (`CartItem`, `WishlistItem`, `Coupon`, `Order`) are created automatically on startup (`prisma db push`) — no volume reset needed; just `docker compose up --build`.
