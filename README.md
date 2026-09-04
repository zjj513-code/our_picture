# Our Pictures

A private-admin, public photography archive deployed on AWS with no always-on
application server or database.

## Current architecture

- Next.js exports the public archive and admin UI as static files.
- CloudFront serves the private web S3 bucket through Origin Access Control.
- CloudFront sends `/api/*` to an API Gateway HTTP API.
- One Lambda handles login, sessions, Moment CRUD, publishing, ordering, deletion,
  presigned uploads, and processing-result reconciliation.
- DynamoDB uses on-demand billing for Moments, Photos, administrators, and sessions.
- Originals upload directly to a private S3 bucket. Its existing event notification
  invokes the image-processing Lambda, which writes WebP derivatives to the web bucket.
- Administrator passwords remain Argon2 hashes. Browser sessions are opaque,
  `HttpOnly`, `Secure`, and `SameSite=Lax` cookies.

The live development site is
[https://d1v1mg445zdh54.cloudfront.net](https://d1v1mg445zdh54.cloudfront.net).
Non-secret AWS identifiers are recorded in
[`infrastructure/aws/state/dev.json`](infrastructure/aws/state/dev.json).

## Local work

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The local static UI needs a compatible `/api` and `/site-data.json` origin to show
live data. Production uses the single CloudFront origin above.

## Validation

```bash
npm run lint
npm test
```

`npm test` builds the static export and runs the API and image-processor checks.

## Deployment

The deployment profile must be an MFA-protected role with the checked-in minimal
permissions. No long-lived AWS access key belongs in this repository.

```bash
npm run deploy
```

The script updates the Lambda/API resources and uploads `out/` to the existing web
bucket. CloudFront switching is explicit:

```bash
SWITCH_CLOUDFRONT=true npm run deploy
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the request and upload flows.
