# Our Pictures Architecture

## Document status

This document distinguishes the architecture that exists today from the
approved target for the remaining Phase 3 work.

- **Current** means implemented and testable in this repository.
- **Target** means approved direction that has not yet been implemented.

Nothing in the target sections should be read as a claim that an AWS resource
already exists.

## Architectural goals

- Preserve the approved public photography experience while replacing local
  sample-image storage with a real upload and delivery path.
- Keep large film scans out of the Next.js request path.
- Keep original scans private and separately authorized from public web assets.
- Support reliable batches of approximately ten large images.
- Keep the image-processing path independent of the final Next.js hosting
  choice.
- Avoid storing deployment-specific URLs in MySQL.

Product requirements and non-goals are defined in [`SPEC.md`](../SPEC.md).
Accepted infrastructure decisions are recorded in [`docs/decisions`](decisions).

## Current architecture: Phase 3B

The current application is a single Next.js App Router project using the Node.js
runtime.

```text
Browser
   |
   v
Next.js application
   |-- server-rendered public Moment feed
   |-- private admin pages and Route Handlers
   |-- server-side session authentication
   |-- presigned S3 upload initialization and completion verification
   |
   v
MySQL 8.4

Administrator browser -- direct PUT --> private originals S3 bucket

Development and seed Photos
   |
   v
public/photos
```

Current characteristics:

- Next.js and TypeScript render the public feed and private admin.
- Drizzle ORM and MySQL store Moments, Photo metadata, administrators, and
  hashed sessions.
- Argon2id protects administrator passwords.
- Seed Photo records refer to local sample files under `public/photos`.
- Authenticated administrators can upload batches of 1–30 JPEG, PNG, WebP, or
  TIFF originals, with three concurrent direct S3 PUTs and per-file retry.
- The application verifies S3 size, media type, and SHA-256 before changing a
  Photo from `pending` to `processing`.
- There is no image processor implementation, processing-result reconciliation,
  stale-job recovery, or remote-object deletion workflow.
- Removing a current Photo record does not delete a local image file.

## Current AWS infrastructure: Phase 3A

The development AWS foundation is provisioned. Phase 3B connects the application
only to the private originals bucket:

- private originals bucket `our-pictures-dev-066899195278-originals`;
- private web bucket `our-pictures-dev-066899195278-web`;
- CloudFront distribution `E27LBWNJWHPBCQ` using OAC `E2FOX0AAG8GTZM`;
- Lambda function `our-pictures-dev-image-processor` using the dedicated
  execution role and a 14-day CloudWatch Logs retention policy.

The Lambda deployment is a Phase 3A placeholder. The originals bucket has no
event notification, so uploads cannot be acknowledged by incomplete processor
code. Non-secret deployment identifiers are recorded in
[`infrastructure/aws/state/dev.json`](../infrastructure/aws/state/dev.json).

## Target end-to-end architecture: Phase 3C–3D, not implemented

The target storage and delivery path is:

```text
Administrator browser
   | 1. authenticated upload initialization
   v
Next.js application --------------------> MySQL
   | 2. short-lived presigned PUT URLs
   v
Administrator browser
   | 3. direct upload
   v
Private originals S3 bucket
   | 4. ObjectCreated notification
   v
AWS Lambda image processor
   | 5a. web derivatives
   +-------------------------------------> Private web S3 bucket
   | 5b. private processing result
   +-------------------------------------> Private result prefix

Next.js application
   | 6. reconcile durable result into MySQL
   v
MySQL

Public browser
   |
   v
CloudFront with Origin Access Control
   |
   v
Private web S3 bucket
```

The primary Region for regional resources is `ap-northeast-1` (Tokyo).
CloudFront remains a global delivery service.

### AWS resources

Two buckets are required per environment:

```text
our-pictures-{environment}-{unique-suffix}-originals
our-pictures-{environment}-{unique-suffix}-web
```

The suffix must make each bucket name globally unique. Development and
production must not share buckets.

Originals bucket:

- Block Public Access enabled;
- default server-side encryption enabled;
- versioning enabled for production;
- no CloudFront origin and no public read path;
- application permission limited to upload initialization, reconciliation, and
  explicitly approved maintenance operations;
- Lambda permission limited to reading source objects and writing processing
  results;
- event notification filtered to the source-object prefix so result writes do
  not recursively invoke the processor.

Web bucket:

- Block Public Access enabled;
- default server-side encryption enabled;
- Lambda may write deterministic derivative keys;
- CloudFront may read through Origin Access Control;
- direct public S3 reads are denied.

### Component responsibilities

Next.js application:

- authenticate the administrator;
- validate requested file metadata and batch limits;
- create Photo upload records and immutable object keys;
- issue short-lived presigned upload URLs;
- reconcile processing results into MySQL;
- construct public image URLs through one storage URL resolver;
- enforce publication rules.

Administrator browser:

- validate obvious client-side file constraints;
- upload files directly to S3;
- limit upload concurrency;
- display transient per-file and aggregate progress;
- report successful PUT completion to the application;
- retry individual failures without restarting successful uploads.

Image-processing Lambda:

- validate the uploaded object's real type and size before processing;
- read the original without making it public;
- generate the approved display and thumbnail derivatives;
- preserve aspect ratio and orientation;
- write deterministic output keys;
- write a private success or failure result that the application can reconcile;
- behave idempotently when an event is duplicated or delivered out of order.

CloudFront:

- deliver only web derivatives;
- authenticate origin requests with Origin Access Control;
- redirect viewers to HTTPS;
- never expose or route to the originals bucket.

## Upload and processing lifecycle

Durable Photo processing states are:

```text
pending -> processing -> ready
                      -> failed
```

Browser-only presentation states may include `queued` and `uploading` with a
percentage, but these are not durable database states.

1. **Implemented in Phase 3B:** the application creates a Photo ID and deterministic keys with status
   `pending`.
2. **Implemented in Phase 3B:** the application returns a short-lived presigned PUT URL for the original
   key.
3. **Implemented in Phase 3B:** the browser uploads directly to the originals bucket.
4. **Implemented in Phase 3B:** the browser reports success to the application, which verifies the stored object and advances the Photo to
   `processing`. Reconciliation must also recover if the browser closes before
   this callback.
5. **Target Phase 3C:** S3 invokes the processor asynchronously.
6. **Target Phase 3C:** Lambda writes derivatives and a processing result.
7. **Target Phase 3C:** the application reconciles the result, records dimensions and metadata, and
   sets the Photo to `ready` or `failed`.
8. **Implemented in Phase 3B:** only `ready` Photos are eligible for public queries and publication.

The application must validate again after upload. A presigned URL is not a
substitute for verifying the actual object size, media type, checksum, and
decodability.

## Object key and URL policy

Object keys use immutable IDs rather than editable calendar dates:

```text
Original source:
originals/moments/{momentId}/photos/{photoId}/source.{extension}

Private processing result:
processing-results/{photoId}.json

Display derivative:
moments/{momentId}/photos/{photoId}/display.webp

Thumbnail derivative:
moments/{momentId}/photos/{photoId}/thumbnail.webp
```

The original filename is stored separately as metadata. User-provided filenames
must not become S3 keys.

`originalKey`, `webKey`, and `thumbnailKey` are keys, not URLs or S3 URIs. A
public URL is derived at runtime:

```text
PHOTO_CDN_BASE_URL + "/" + webKey
```

Phase 2 seed rows currently use local `/photos/...` paths. Phase 3 must introduce
one URL resolver that supports those explicit local seed paths while resolving
production object keys through the configured delivery base URL.

## Planned data-model evolution

The existing Moment-to-Photos relationship and ordered `sortOrder` constraint
remain valid. Phase 3 is expected to extend Photo metadata with fields such as:

```text
originalFilename
originalContentType
originalByteSize
checksum
status
processingError
processedAt
```

Image dimensions are not reliably available before an uploaded film scan is
decoded. The current non-null `width` and `height` fields must therefore either
become nullable until processing succeeds or be replaced by clearly named
processed-derivative dimensions.

Publishing rules must be enforced in application logic and covered by
integration tests:

- a published Moment has at least one ready Photo;
- public queries return only ready Photos from published Moments;
- pending, processing, and failed Photos remain visible only to administrators.

## Reliability and failure handling

- S3 event delivery can be duplicated or arrive out of order; processing must
  be idempotent.
- Derivative keys are deterministic, so retrying the same source converges on
  the same outputs rather than appending duplicates.
- A processing result identifies the Photo, source key, and source version or
  checksum so stale events cannot overwrite a newer result.
- Lambda failures must be observable and retryable. A timed-out job must
  eventually appear as failed or stale in the admin rather than remaining
  `processing` forever.
- One failed file must not roll back other successfully uploaded files in the
  same browser batch.
- Remote object deletion is a separate cross-system workflow and must not be
  hidden inside a MySQL cascade. Its retention and recovery behavior must be
  designed before implementation.

## Security boundaries

- Permanent AWS credentials never enter browser code.
- Presigned URLs are short-lived, scoped to one generated key, and issued only
  after administrator authentication.
- Application, processor, and CloudFront permissions use separate IAM
  principals and least-privilege policies.
- Production compute uses IAM roles. Local development uses the standard AWS
  SDK credential chain or a named developer profile; access keys are not added
  to `.env.example`.
- S3 CORS allows only the required upload methods, headers, and approved local
  or production application origins.
- Web assets may be publicly viewable through CloudFront, but this does not make
  the web bucket public.

## Configuration contract

Phase 3B consumes this configuration:

```text
AWS_REGION=ap-northeast-1
AWS_ORIGINALS_BUCKET=
PHOTO_CDN_BASE_URL=
AWS_UPLOAD_URL_TTL_SECONDS=900
```

These variables must be added to `.env.example` only when application code
actually consumes them. AWS access-key variables are intentionally not part of
the application configuration contract.

## Deployment independence

Phase 3 storage work does not select the final Next.js or MySQL production
hosting service. The Lambda processor must not require direct access to the
current local MySQL instance. Using a private processing result that the
application reconciles keeps storage development usable before a production
network topology is selected.

Selection of EC2, App Runner, ECS, RDS, or another production compute topology
belongs to a later deployment decision and must consider cost and operational
burden.

## Phased delivery

```text
Phase 2    Current MySQL and private-admin baseline
Phase 2.5  Product, architecture, and decision documentation
Phase 3A   Current S3, IAM, CloudFront, and processor placeholder infrastructure
Phase 3B   Current authenticated direct batch upload
Phase 3C   Idempotent image processing and status reconciliation
Phase 3D   Retry, deletion, recovery, and real-workflow validation
Phase 4    Production compute, database, domain, backups, and monitoring
```

Phase 3B has a verified single-file real AWS path. Full Phase 3 acceptance must
still include real batches of 10, 20, and 30 representative film scans, not only
small JPEG fixtures.
