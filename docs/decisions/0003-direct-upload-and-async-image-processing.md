# ADR-0003: Use direct uploads and asynchronous image processing

- Status: Accepted
- Date: 2026-08-28

## Context

A normal administrator workflow uploads approximately ten large film scans at a
time. Proxying these files through Next.js would consume application bandwidth,
memory, request time, and temporary storage without adding product value.

Processing is also slower and less reliable than a normal interactive request.
It must survive browser refreshes, individual file failures, and duplicate S3
events. The current MySQL instance may still be local while Phase 3 storage is
developed, so an AWS Lambda function cannot assume direct database connectivity.

## Decision

After authenticating the administrator, Next.js creates immutable Photo IDs and
object keys and returns short-lived presigned PUT URLs. The browser uploads each
original directly to the private originals bucket with limited concurrency.
Permanent AWS credentials are never sent to the browser.

An S3 ObjectCreated notification asynchronously invokes an AWS Lambda image
processor. The processor validates the source, generates deterministic display
and thumbnail outputs, and writes them to the private web bucket.

The processor is idempotent. A repeated or out-of-order event for the same
source version or checksum must converge on the same result and must not create
duplicate Photo records or derivative names.

Until the final application hosting topology is selected, Lambda does not
connect directly to MySQL. It writes a private processing result that the
Next.js application can reconcile into durable Photo state. The application
must also detect stale processing jobs and expose a retry path.

The durable state model is:

```text
pending -> processing -> ready
                      -> failed
```

Browser-only states such as `queued` and `uploading 72%` remain transient UI
state.

## Consequences

- Large payloads do not traverse the Next.js server.
- The admin can retry one failed upload without restarting successful files.
- Local application development can use real AWS processing without exposing a
  local MySQL server to Lambda.
- Upload initialization, post-upload validation, result reconciliation,
  timeout handling, and retry behavior must be implemented explicitly.
- S3 CORS and IAM policies must be narrow enough to allow the approved browser
  upload without creating a general bucket-write capability.
- Publication and public queries must exclude every Photo that is not `ready`.
- Replacing this flow with proxied uploads or direct browser AWS credentials
  requires a superseding ADR and a security and performance justification.

## References

- [Download and upload objects with presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [Amazon S3 event notification types and destinations](https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-event-types-and-destinations.html)
- [Configure ephemeral storage for Lambda functions](https://docs.aws.amazon.com/lambda/latest/dg/configuration-ephemeral-storage.html)
