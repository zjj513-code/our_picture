# Our Pictures Phase 3A infrastructure

This directory contains the auditable configuration used to create the
development S3, Lambda, and CloudFront resources described in
`docs/ARCHITECTURE.md`.

## Current Phase 3A boundary

- Regional resources use `ap-northeast-1` (Tokyo).
- Both S3 buckets are private, use S3-managed encryption, enforce bucket-owner
  object ownership, and keep Block Public Access enabled.
- CloudFront reads only from the private web bucket through an Origin Access
  Control (OAC) that always signs origin requests.
- The Lambda function initially contains a Phase 3A placeholder handler. Real
  image validation and derivative generation remain Phase 3C work.
- The originals bucket notification is not applied while the placeholder is
  deployed. This prevents an upload event from being acknowledged before real
  processing exists.

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

## Event activation gate

Before enabling `s3/originals-notification.json`, replace the placeholder
Lambda code with the idempotent Phase 3C processor and add the narrowly scoped
S3 invoke permission documented in `infrastructure/iam/README.md`. The
notification filters events to the `originals/` prefix so private processing
result writes cannot recursively invoke the function.
