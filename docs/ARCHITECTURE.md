# Our Pictures Architecture

## Document status

This document distinguishes the architecture that exists today from the
approved target for the remaining Phase 3D and production-hardening work.

- **Current** means implemented and testable in this repository.
- **Target** means approved direction that has not yet been implemented.

Nothing in the target sections should be read as a claim that the remaining
recovery, deletion, backup, monitoring, or high-availability resources already exist.

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

## Current architecture: Phase 3C

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
   |-- private processing-result reconciliation
   |
   v
MySQL 8.4

Administrator browser -- direct PUT --> private originals S3 bucket
                                           |
                                           v
                                    image-processing Lambda
                                      |              |
                                      v              v
                              private web S3   private result prefix
                                      |
                                      v
                               CloudFront with OAC

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
- S3 ObjectCreated events under `originals/` invoke an idempotent Lambda that
  validates and decodes the source, generates deterministic WebP derivatives,
  and writes a private result.
- The admin flow polls reconciliation through the application; matching results
  advance the Photo to `ready` or `failed` and store processed dimensions and time.
- CloudFront serves only the private web-bucket derivatives through OAC.
- There is no stale-job recovery or remote-object deletion workflow yet.
- Removing a current Photo record does not delete a local image file.

## Current AWS infrastructure: Phase 3C

The development AWS path is provisioned and connected end to end:

- private originals bucket `our-pictures-dev-066899195278-originals`;
- private web bucket `our-pictures-dev-066899195278-web`;
- CloudFront distribution `E27LBWNJWHPBCQ` using OAC `E2FOX0AAG8GTZM`;
- Lambda function `our-pictures-dev-image-processor` using the dedicated
  execution role and a 14-day CloudWatch Logs retention policy.
- S3 ObjectCreated notification `ProcessOurPicturesOriginals`, filtered to the
  `originals/` prefix;
- Lambda resource-policy statement `AllowOurPicturesOriginalsBucket`, limited
  to account `066899195278` and that exact originals bucket.

The deployed Node.js 24 arm64 package is the Phase 3C image processor. Automatic
browser upload through reconciliation and CloudFront delivery has been verified
with a real development object. Non-secret deployment identifiers are recorded in
[`infrastructure/aws/state/dev.json`](../infrastructure/aws/state/dev.json).

## Current external hosting: Phase 4A development deployment

The application is externally reachable at
`https://d1v1mg445zdh54.cloudfront.net`. CloudFront routes normal application
requests to a fixed-EIP EC2 origin and routes `/moments/*` derivative requests
to the existing private S3 origin through OAC.

```text
Public browser -- HTTPS --> CloudFront
                             |-- default behavior --> EC2 port 80
                             |                        |-- Next.js container
                             |                        `-- MySQL 8.4 container
                             `-- /moments/* -------> private web S3 through OAC

Admin upload -- presigned PUT --> private originals S3 --> Lambda --> private web S3
```

The host is one arm64 EC2 `t4g.small` instance. The web image is stored in an
immutable ECR repository. Database passwords are encrypted SSM SecureStrings;
the EC2 instance receives only its runtime role. The security group accepts
HTTP only from the AWS-managed CloudFront origin-facing prefix list, exposes no
SSH port, and does not publish MySQL. IMDSv2 is required.

This topology is intentionally a low-cost functional development deployment.
Next.js and MySQL share one host and one EBS volume, so it is not highly
available and currently has no automated database backup. A production launch
requires a managed or separately backed-up database, alarms, recovery testing,
a custom domain, and a defined update/rollback process.

## Current end-to-end architecture: Phase 3C

The implemented storage and delivery path is:

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

- terminate public HTTPS and route dynamic application traffic to the EC2 host;
- deliver `/moments/*` web derivatives from the private web bucket;
- authenticate S3 origin requests with Origin Access Control;
- redirect viewers to HTTPS;
- never expose or route to the originals bucket;
- disable caching and forward viewer headers, cookies, and query strings for the
  dynamic application behavior.

## Remaining Phase 3D target, not implemented

- provide explicit retry and recovery controls for failed or stale processing;
- define and implement remote-object deletion with retention and recovery rules;
- validate representative batches of 10, 20, and 30 film scans;
- add the production monitoring and operational runbook needed before launch.

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
5. **Implemented in Phase 3C:** S3 invokes the processor asynchronously.
6. **Implemented in Phase 3C:** Lambda writes derivatives and a processing result.
7. **Implemented in Phase 3C:** the application reconciles the result, records dimensions and metadata, and
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

Phase 2 seed rows use local `/photos/...` paths. The current URL resolver supports
those explicit local seed paths while resolving uploaded object keys through the
configured delivery base URL.

## Current data model

The existing Moment-to-Photos relationship and ordered `sortOrder` constraint
remain valid. Phase 3 extends Photo metadata with:

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
decoded. `width` and `height` are nullable until successful processing writes
the display-derivative dimensions.

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

The deployed Phase 4A application consumes this configuration:

```text
SITE_URL=https://d1v1mg445zdh54.cloudfront.net
DATABASE_URL=mysql://...
AWS_REGION=ap-northeast-1
AWS_ORIGINALS_BUCKET=our-pictures-dev-066899195278-originals
PHOTO_CDN_BASE_URL=https://d1v1mg445zdh54.cloudfront.net
AWS_UPLOAD_URL_TTL_SECONDS=900
```

`SITE_URL` is also the trusted origin for absolute authentication and mutation
redirects behind CloudFront; it must not be derived from the container listener
address. AWS access-key variables are intentionally not part of the application
configuration contract because EC2 uses its instance role.

## Hosting decision

Phase 3 storage remains independent of the hosting choice: Lambda does not
connect to MySQL, and the application reconciles private processing results.
For Phase 4A, a single EC2 host was selected to minimize networking and managed
database cost while making the complete development workflow externally
testable. This does not make single-host EC2 the final production topology.

## Phased delivery

```text
Phase 2    MySQL and private-admin baseline
Phase 2.5  Product, architecture, and decision documentation
Phase 3A   S3, IAM, CloudFront, and processor placeholder infrastructure
Phase 3B   Authenticated direct batch upload
Phase 3C   Current idempotent image processing and status reconciliation
Phase 3D   Retry, deletion, recovery, and real-workflow validation
Phase 4A   Current external development compute and database deployment
Phase 4B   Production database, domain, backups, monitoring, and high availability
```

Phase 3C has a verified single-file automatic AWS path from browser upload to
database `ready` state and CloudFront display. Full Phase 3 acceptance must still
include real batches of 10, 20, and 30 representative film scans, not only small
JPEG fixtures.
