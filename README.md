# Our Pictures

A restrained, book-like film photography archive for two people. The current
Phase 2 implementation keeps the approved public experience intact while adding
MySQL persistence and a minimal private admin.

## Documentation

- [`SPEC.md`](SPEC.md) defines the frozen product boundaries.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) separates the implemented Phase
  2 architecture from the approved, not-yet-implemented Phase 3 AWS target.
- [`docs/decisions`](docs/decisions) records accepted architectural decisions
  that require a superseding decision before they are reversed.

## Current architecture: Phase 2

- **Next.js App Router + TypeScript** server-renders the public feed and all admin pages. The initial public Moment feed does not use client-side API fetching.
- **Drizzle ORM + MySQL 8.4** store Moments, Photo metadata, two admin accounts, and hashed-token sessions.
- **Argon2id** hashes admin passwords. Login creates opaque 256-bit session tokens; only SHA-256 token hashes are stored in MySQL.
- **Server-side sessions** use `HttpOnly`, `SameSite=Lax`, path-scoped cookies. Cookies become `Secure` automatically in production.
- **Route Handlers** process form mutations. Every admin mutation verifies the session and same-origin request server-side.
- **Local responsive images** remain development and seed assets. Removing Photo records never deletes files in `public/photos`.

The former Cloudflare/vinext wrapper was replaced by standard Next.js Node runtime because direct MySQL connections and native Argon2id are required. The App Router, React components, Tailwind setup, Drizzle schema, and frozen public rendering remain in place.

## Target architecture: Phase 3, not implemented

Phase 3 will add direct browser uploads to private Amazon S3 storage in
`ap-northeast-1` (Tokyo), asynchronous image processing with AWS Lambda, a
separate private bucket for web derivatives, and public derivative delivery
through Amazon CloudFront with Origin Access Control.

Original film scans will never be public. The browser will receive only
short-lived upload URLs, not permanent AWS credentials. The detailed target,
failure model, object-key policy, and implementation phases are documented in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Local setup

Requirements:

- Node.js 22.13 or newer
- Docker-compatible runtime; on macOS, Colima works well

Prepare the environment and database:

```bash
cp .env.example .env.local
npm install
colima start
docker compose up -d mysql
npm run db:migrate
npm run db:seed
```

`db:seed` is idempotent. It inserts each deterministic sample Moment only when that Moment ID is absent. It does not overwrite or delete existing Moments, Photos, or local image files.

Create the two admin accounts individually:

```bash
npm run admin:create -- first-user
npm run admin:create -- second-user
```

The command prompts for the password without echoing it. Passwords must contain 12–200 characters and are never written to source files. For non-interactive environments, supply `ADMIN_USERNAME` and `ADMIN_PASSWORD` through the process environment or an untracked `.env.local` file.

Start development:

```bash
npm run dev
```

Open the public archive at `http://localhost:3000` and the private admin at `http://localhost:3000/admin`.

## Migrations

Schema source lives in `database/schema.ts`; generated SQL lives in `database/migrations`.

After changing the schema:

```bash
npm run db:generate
```

Inspect the generated SQL before applying it, then run:

```bash
npm run db:migrate
```

The current schema uses a MySQL `DATE` string for `Moment.date`, so calendar dates do not pass through JavaScript timezone conversion. `Photo.sortOrder` is unique within each Moment, and Moment deletion cascades to Photo records. Admin-user deletion cascades to sessions.

## Admin routes

- `/admin/login` — username/password login
- `/admin` — Moment list
- `/admin/moments/new` — create a draft Moment
- `/admin/moments/[id]` — edit metadata, publish/draft, reorder/remove Photos, and confirm deletion
- `/admin/moments/[id]/preview` — protected preview for draft or published Moments

There is no registration, public account creation, OAuth, password-reset email, user profile, analytics, or role system.

## Environment variables

- `SITE_URL` — canonical local or production origin
- `DATABASE_URL` — application MySQL connection URL
- `TEST_DATABASE_URL` — dedicated database ending in `_test`; destructive test cleanup is refused for other names
- `SESSION_COOKIE_SECURE` — optional local/test override; production defaults to secure cookies
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — optional non-interactive inputs for `admin:create`

Never commit `.env.local` or real credentials.

## Validation

Keep MySQL running, then execute:

```bash
npm run lint
npm test
npm audit --omit=dev
```

The integration suite migrates and resets only the dedicated `_test` database. It verifies published-only queries, Moment and Photo ordering, Argon2id login success/failure, hashed sessions, protection redirects, CRUD, transactional reordering, cascade deletion, empty public state, local-file preservation, and database-backed homepage rendering.

## Deferred to Phase 3

Amazon S3 uploads, AWS Lambda image processing, Amazon CloudFront delivery,
remote-object deletion, and production deployment are intentionally not
implemented yet. EXIF, GPS, camera/scanner metadata, albums, tags, search,
likes, comments, analytics, and social features remain out of scope.
