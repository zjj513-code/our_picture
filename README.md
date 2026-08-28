# Our Pictures

A restrained, book-like film photography archive for two people. The current
Phase 4A development deployment keeps the approved public experience intact while adding
MySQL persistence, a private admin, direct uploads to private Amazon S3 storage,
asynchronous image processing, and an externally reachable HTTPS application.

## Documentation

- [`SPEC.md`](SPEC.md) defines the frozen product boundaries.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) separates implemented Phases
  2–4A from the approved, not-yet-implemented recovery and production-hardening targets.
- [`docs/decisions`](docs/decisions) records accepted architectural decisions
  that require a superseding decision before they are reversed.

## Current architecture: Phase 3C

- **Next.js App Router + TypeScript** server-renders the public feed and all admin pages. The initial public Moment feed does not use client-side API fetching.
- **Drizzle ORM + MySQL 8.4** store Moments, Photo metadata, two admin accounts, and hashed-token sessions.
- **Argon2id** hashes admin passwords. Login creates opaque 256-bit session tokens; only SHA-256 token hashes are stored in MySQL.
- **Server-side sessions** use `HttpOnly`, `SameSite=Lax`, path-scoped cookies. Cookies become `Secure` automatically in production.
- **Route Handlers** process form mutations. Every admin mutation verifies the session and same-origin request server-side.
- **Direct S3 uploads** use short-lived, per-object presigned PUT URLs. The browser uploads at most three files concurrently and reports per-file progress.
- **Durable Photo states** distinguish `pending`, `processing`, `ready`, and `failed`. S3 object size, media type, and SHA-256 are verified before a Photo advances to `processing`.
- **Asynchronous Lambda processing** validates the stored source and decoded image, generates deterministic 1536px and 768px WebP derivatives, and writes a private processing result.
- **Result reconciliation** polls the private result through the application, validates its Photo/source identity, and advances the matching database row to `ready` or `failed`.
- **CloudFront with OAC** serves only derivatives from the private web bucket. Original film scans remain private.
- **Publication rules** require at least one `ready` Photo; public queries exclude all other Photo states.
- **Local responsive images** remain development and seed assets. Removing Photo records never deletes files in `public/photos`.

The former Cloudflare/vinext wrapper was replaced by standard Next.js Node runtime because direct MySQL connections and native Argon2id are required. The App Router, React components, Tailwind setup, Drizzle schema, and frozen public rendering remain in place.

## Current cloud infrastructure: Phase 4A development deployment

The development Phase 3C AWS path is provisioned in account
`066899195278`:

- two private S3 buckets in `ap-northeast-1` for originals and web derivatives;
- a private CloudFront S3 origin using Origin Access Control;
- a deployed Node.js 24 arm64 Lambda image processor and 14-day CloudWatch Logs group;
- an `originals/`-filtered S3 ObjectCreated notification with a Lambda resource
  policy restricted to this account and this originals bucket.
- one arm64 EC2 `t4g.small` host running the standalone Next.js image and MySQL
  8.4 in separate Docker containers;
- an immutable ECR repository for the web image and encrypted SSM parameters
  for the two database passwords;
- a CloudFront application origin for the EC2 host, with `/moments/*` continuing
  to use the private S3/OAC origin;
- a security group that accepts port 80 only from the AWS-managed CloudFront
  origin-facing prefix list. There is no SSH key and MySQL is not published.

The exact non-secret resource identifiers and deployment configuration live in
[`infrastructure/aws`](infrastructure/aws/README.md). A real browser upload has
been verified through automatic S3 notification, Lambda processing, private
result reconciliation, MySQL `ready` state, and CloudFront WebP delivery.

The external development URL is
[`https://d1v1mg445zdh54.cloudfront.net`](https://d1v1mg445zdh54.cloudfront.net).
This is a verified functional deployment, not a high-availability production
topology: the application and database share one instance and automated
database backups, a custom domain, alarms, and multi-instance failover remain.

## Remaining Phase 3D target, not implemented

Phase 3D will add explicit retry/recovery operations, stale-job handling,
remote-object deletion, and representative 10/20/30-image batch acceptance.

Original film scans will never be public. The browser will receive only
short-lived upload URLs, not permanent AWS credentials. The detailed target,
failure model, object-key policy, and implementation phases are documented in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

The development IAM policy set is checked in under
[`infrastructure/iam`](infrastructure/iam/README.md). Runtime and temporary
deployment policies are active for the Phase 3 development environment. The
temporary bootstrap policy has been removed and replaced by the exact-ID
maintenance policy after Phase 3A verification.

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
- `/admin/moments/[id]` — edit metadata, batch-upload originals, inspect durable upload state, publish/draft, reorder/remove Photos, and confirm deletion
- `/admin/moments/[id]/preview` — protected preview for draft or published Moments

There is no registration, public account creation, OAuth, password-reset email, user profile, analytics, or role system.

## Environment variables

- `SITE_URL` — canonical local or production origin
- `DATABASE_URL` — application MySQL connection URL
- `TEST_DATABASE_URL` — dedicated database ending in `_test`; destructive test cleanup is refused for other names
- `SESSION_COOKIE_SECURE` — optional local/test override; production defaults to secure cookies
- `AWS_PROFILE` — optional local named profile used by the standard AWS SDK credential chain
- `AWS_REGION`, `AWS_ORIGINALS_BUCKET` — Phase 3C upload and reconciliation target
- `AWS_UPLOAD_URL_TTL_SECONDS` — upload URL lifetime from 60–900 seconds
- `PHOTO_CDN_BASE_URL` — resolves non-local web object keys without storing deployment URLs in MySQL
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — optional non-interactive inputs for `admin:create`

Never commit `.env.local` or real credentials.

## Validation

Keep MySQL running, then execute:

```bash
npm run lint
npm test
npm audit --omit=dev
```

The integration suite migrates and resets only the dedicated `_test` database. It verifies published and ready-only queries, publication blocking, durable upload-state transitions and processing-result reconciliation, Moment and Photo ordering, Argon2id login success/failure, hashed sessions, protection redirects, same-origin upload guards, CRUD, transactional reordering, cascade deletion, empty public state, local-file preservation, and database-backed homepage rendering.

## Deferred to Phase 3D and production hardening

Explicit retry/recovery controls, stale-job recovery, remote-object deletion,
automated database backups, high availability, monitoring, and a custom domain
are intentionally not implemented yet. Full Phase 3
acceptance batches of 10, 20, and 30 representative film scans also remain.
EXIF, GPS, camera/scanner metadata, albums, tags, search, likes, comments,
analytics, and social features remain out of scope.
