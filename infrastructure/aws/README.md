# Our Pictures Phase 3 infrastructure

This directory contains the auditable configuration used to create the
development S3, Lambda, CloudFront, ECR, and EC2 resources described in
`docs/ARCHITECTURE.md`.

## Current Phase 3C boundary

- Regional resources use `ap-northeast-1` (Tokyo).
- Both S3 buckets are private, use S3-managed encryption, enforce bucket-owner
  object ownership, and keep Block Public Access enabled.
- CloudFront reads only from the private web bucket through an Origin Access
  Control (OAC) that always signs origin requests.
- The Lambda package validates the signed source metadata and decoded image,
  generates 1536px and 768px WebP derivatives, and writes a private processing
  result for application reconciliation.
- The processor is deterministic and treats an existing matching ready result
  as a duplicate event rather than creating additional outputs.
- The processor package and configuration are deployed in development. Manual
  invocation, duplicate-event handling, result reconciliation, and CloudFront
  delivery have been verified with real uploaded originals.
- Automatic S3 invocation is enabled for ObjectCreated events under the
  `originals/` prefix. The externally deployed application's authenticated
  upload endpoints and generated presigned PUT were verified with a real JPEG
  through automatic processing, application reconciliation, and CloudFront
  delivery on 2026-08-28.
- CloudFront's default behavior routes the externally reachable application to
  the EC2 web host with caching disabled; `/moments/*` remains on the private
  S3/OAC origin.
- The EC2 security group permits port 80 only from the CloudFront origin-facing
  managed prefix list. SSH and public MySQL access are not enabled.
- The web and MySQL containers use `unless-stopped`; production migrations run
  before the web container starts.

## Fixed resources

| Resource | Value |
| --- | --- |
| Originals bucket | `our-pictures-dev-066899195278-originals` |
| Web bucket | `our-pictures-dev-066899195278-web` |
| Lambda function | `our-pictures-dev-image-processor` |
| Lambda log group | `/aws/lambda/our-pictures-dev-image-processor` |
| CloudFront OAC | `our-pictures-dev-web-oac` |
| Public URL | `https://d1v1mg445zdh54.cloudfront.net` |
| EC2 host | `i-0a17fa9e55bd0fae2` (`t4g.small`, arm64) |
| Host security group | `sg-0aee773187e07fe63` |
| Web ECR repository | `our-pictures-dev-web` |
| Web image tag | `admin-home-link-20260901-01` |
| EC2 instance profile | `OurPicturesDevWebHostProfile` |

The generated CloudFront distribution ID, domain, and OAC ID are recorded in
`state/dev.json` after deployment. They are resource identifiers, not secrets.
The same state file records the non-secret Photo ID, derivative key, dimensions,
and timestamp from the latest external upload acceptance check.

## Processor package and deployment

Build the Linux arm64 package from the repository root:

```sh
./scripts/package-image-processor.sh /tmp/our-pictures-image-processor.zip
```

Deploy the package and checked-in configuration with the maintenance profile:

```sh
AWS_PROFILE=our-pictures-dev AWS_REGION=ap-northeast-1 \
  aws lambda update-function-code \
  --function-name our-pictures-dev-image-processor \
  --zip-file fileb:///tmp/our-pictures-image-processor.zip

AWS_PROFILE=our-pictures-dev AWS_REGION=ap-northeast-1 \
  aws lambda update-function-configuration \
  --cli-input-json file://infrastructure/aws/lambda/function-configuration.dev.json
```

The S3 invoke permission is the one separately administered statement documented
in `infrastructure/iam/README.md`. The active notification matches
`s3/originals-notification.json` and filters events to the `originals/` prefix,
so `processing-results/` writes cannot recursively invoke the function.

## Web-host deployment and recovery boundary

`hosting/user-data.sh` is the idempotent host deployment script. Its compressed
base64 form is stored at `/our-pictures/dev/hosting/user-data-gzip-base64`, and
`hosting/redeploy-command.json` runs it through Systems Manager. The host pulls
the pinned immutable ECR tag, logs out of ECR after the pull, starts MySQL,
applies migrations, and starts the standalone Next.js server.

Only the two current database passwords remain as encrypted hosting parameters.
The one-time bootstrap SQL parameter was deleted after the imported row counts
were verified, preventing a later redeploy from importing the same data again.

There is no SSH key. Operational commands use the tagged instance and the
`AWS-RunShellScript` Systems Manager document through the maintenance role.
The current database lives on the host's encrypted EBS-backed Docker volume;
there is no automated database backup or multi-instance failover yet. Do not
treat this development topology as the production recovery design.
