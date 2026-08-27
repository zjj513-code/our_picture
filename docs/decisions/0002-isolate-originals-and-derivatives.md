# ADR-0002: Isolate originals and web derivatives in two private S3 buckets

- Status: Accepted
- Date: 2026-08-28

## Context

Original film scans can be large, private, and expensive or impossible to
replace. Public pages need smaller web-ready derivatives. Storing both classes
of object behind the same access policy increases the risk of exposing an
original and makes retention, processing, and delivery rules harder to audit.

Making an S3 bucket public is unnecessary because CloudFront can authenticate
to a private S3 origin.

## Decision

Each environment uses two separate S3 buckets:

```text
our-pictures-{environment}-{unique-suffix}-originals
our-pictures-{environment}-{unique-suffix}-web
```

Both buckets retain Block Public Access and default server-side encryption.
Production originals enable versioning.

The originals bucket has no public delivery path. It stores source scans under
an `originals/` prefix and may store private processing-control results under a
separate `processing-results/` prefix. The S3 processing notification is
filtered to the source prefix.

The web bucket stores only approved display derivatives. Amazon CloudFront reads
it through Origin Access Control with signed origin requests. Direct public S3
reads remain denied. The older Origin Access Identity mechanism is not used for
new infrastructure.

MySQL stores object keys rather than S3 URIs or CloudFront URLs. Public URLs are
constructed through a configured delivery base URL.

## Consequences

- A web-delivery policy cannot accidentally grant access to original scans.
- The buckets can have different lifecycle, versioning, deletion, and IAM
  policies.
- CloudFront can be replaced or assigned a custom domain without rewriting
  Photo rows.
- Infrastructure requires two buckets and explicit cross-service policies.
- Development and production require separate bucket pairs.
- Reversing the isolation boundary requires a superseding ADR and an explicit
  security review.

## References

- [Restrict access to an Amazon S3 origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
