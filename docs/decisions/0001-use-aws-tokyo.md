# ADR-0001: Use AWS with Tokyo as the primary Region

- Status: Accepted
- Date: 2026-08-28

## Context

Earlier product exploration treated mainland-China accessibility as a hard
constraint and considered China-specific cloud services. That constraint has
been removed. The project needs one primary cloud direction before real image
storage and processing are implemented.

The expected administrators and primary operational location are well served by
the AWS Tokyo Region, and the planned storage and image-processing workflow can
use managed AWS services without selecting the final Next.js hosting service
yet.

## Decision

Amazon Web Services is the primary cloud platform for the target architecture.

Regional storage and processing resources use:

```text
ap-northeast-1 (Tokyo)
```

Mainland-China accessibility is not a hard product or infrastructure
requirement. China-specific hosting, CDN, DNS, and compliance constraints must
not shape the architecture unless the product specification is explicitly
changed later.

AWS adoption does not require every application component to use a separate AWS
managed service. The final hosting choice for Next.js and MySQL remains a later
decision and must prioritize cost and maintainability for a small personal
site.

## Consequences

- S3, Lambda, IAM, and regional supporting resources will be designed for
  `ap-northeast-1`.
- CloudFront may be used as the global public delivery layer.
- Documentation and code must remove previous-provider and
  mainland-China-specific assumptions.
- The project avoids unnecessary AWS infrastructure introduced only for
  architectural completeness.
- Reversing this decision requires a superseding ADR and an explicit update to
  the product specification.
