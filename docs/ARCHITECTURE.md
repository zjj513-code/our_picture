# Our Pictures architecture

## Live request path

```text
Browser -> CloudFront -> private web S3 (static pages, site-data.json, WebP photos)
                    `-> API Gateway HTTP API -> application Lambda -> DynamoDB on-demand
```

There is no EC2 application host, container registry, or MySQL database. The former
EC2 instance was terminated on 2026-09-03 after data and upload verification; its
Elastic IP, ECR repository, and hosting parameters were removed.

## Upload path

```text
Admin UI -> API Lambda -> DynamoDB pending record + short-lived presigned URL
Admin UI ---------------------- direct PUT ----------------------> originals S3
originals S3 -> image-processing Lambda -> web S3 derivatives + private result
Admin UI -> API Lambda reconciliation -> DynamoDB ready/failed state
```

Originals remain private. CloudFront can read only the web bucket. A Moment can be
published only when it has at least one ready Photo; the public manifest includes only
published Moments and ready Photos.

## Authentication

The migrated administrator row retains the original Argon2 password hash. Successful
login stores only a SHA-256 hash of a random session token in DynamoDB. Sessions expire
through both application checks and DynamoDB TTL.

## Cost model

The application path is request-based: API Gateway HTTP API, Lambda, DynamoDB
on-demand, S3 storage/requests, and CloudFront transfer/requests. There is no
always-running compute or database charge. Normal storage and request charges still
apply.

## Fixed identifiers

The current non-secret identifiers live in
[`../infrastructure/aws/state/dev.json`](../infrastructure/aws/state/dev.json).
Product boundaries remain in [`../SPEC.md`](../SPEC.md).
