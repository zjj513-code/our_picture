# Our Pictures Phase 3 infrastructure

This directory contains the auditable configuration used to create the
development S3, Lambda, and CloudFront resources described in
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
  `originals/` prefix. A browser upload has been verified through automatic
  processing, application reconciliation, and CloudFront delivery.

## Fixed resources

| Resource | Value |
| --- | --- |
| Originals bucket | `our-pictures-dev-066899195278-originals` |
| Web bucket | `our-pictures-dev-066899195278-web` |
| Lambda function | `our-pictures-dev-image-processor` |
| Lambda log group | `/aws/lambda/our-pictures-dev-image-processor` |
| CloudFront OAC | `our-pictures-dev-web-oac` |

The generated CloudFront distribution ID, domain, and OAC ID are recorded in
`state/dev.json` after deployment. They are resource identifiers, not secrets.

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
