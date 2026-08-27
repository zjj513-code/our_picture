# Our Pictures Product Specification

## Status and authority

This document defines the product boundaries for Our Pictures. It describes
what the product must remain, independently of the implementation phase or
cloud provider details.

The requirements in this document are frozen. They may be changed only by an
explicit product decision. Infrastructure and implementation work must not
silently broaden or reinterpret them.

## Product identity

Our Pictures is a restrained, book-like film photography archive maintained by
two people. It is not a social network, a general-purpose cloud photo library,
or a photography portfolio optimized for promotion.

The public experience should feel quiet and editorial: photographs, dates,
spacing, and sequence are more important than controls, metrics, or decorative
interaction.

## Core content model

- A `Moment` is the primary editorial and timeline unit.
- A `Photo` must belong to exactly one Moment.
- A Moment owns its date, optional title, optional location, optional caption,
  publication status, and ordered Photos.
- The Moment date is entered and corrected manually by an administrator.
- EXIF metadata must not determine the canonical Moment date.
- Photo order within a Moment is editorial and must be preserved.
- A draft Moment may be incomplete or contain no Photos.
- A published Moment must contain at least one Photo that is ready for public
  delivery.
- Photos that are pending, processing, or failed must never appear on the public
  site.

## Public experience

- The approved Phase 1 public visual design is frozen unless an explicit design
  change is requested.
- The design must remain minimal, with generous whitespace and a warm off-white
  background.
- Photographs should normally retain their complete aspect ratio and must not
  be cropped merely to force a uniform grid.
- A 3:2 frame is the primary photographic presentation, but other source
  orientations must remain supported.
- The public feed is organized by Moment date rather than upload time.
- The timeline is an optional navigation layer and is hidden by default.
- Timeline navigation should reveal or move to Moments without replacing the
  photography with a dashboard-like interface.
- Motion, when present, must be restrained and must not block reading or image
  loading.
- Public pages must use web-ready derivatives, never original film scans.

## Administration

- The product has exactly two administrator accounts.
- Administrators authenticate with username and password through the private
  admin area.
- There is no public registration, OAuth login, role hierarchy, or public user
  profile.
- Administrators can create and edit Moments, order Photos, preview drafts, and
  publish or return Moments to draft status.
- The real upload workflow must support a normal batch of approximately ten
  large film scans, show per-file progress, preserve successful uploads when
  another file fails, and allow failed items to be retried.
- Browser upload progress is transient UI state. Durable processing state must
  survive refreshes and be stored or recoverable server-side.
- Publishing must be blocked when a Moment has no ready Photos.

## Storage and delivery boundaries

- Amazon Web Services is the primary cloud platform.
- The primary AWS Region is `ap-northeast-1` (Tokyo).
- Accessibility from mainland China is not a hard requirement.
- Original film scans and public web derivatives must be separated by both
  logical object layout and access control.
- Original film scans must never be publicly accessible.
- Public web derivatives should be delivered through Amazon CloudFront from a
  private Amazon S3 origin.
- Permanent AWS credentials must never be exposed to browser code.
- Large files must upload directly from the administrator's browser to Amazon
  S3 rather than being proxied through the Next.js application server.
- Database storage fields must contain object keys, not full S3 or CloudFront
  URLs.
- A change to a Moment date must not require copying or renaming large stored
  objects.

## Security and privacy

- All admin mutations must require an authenticated server-side session and
  same-origin validation.
- S3 buckets must remain private and retain Block Public Access.
- Public access to web derivatives must pass through the approved delivery
  layer; it must not rely on public S3 object permissions.
- AWS permissions must follow least privilege and be separated by application,
  image processor, and delivery responsibilities.
- Production workloads must use IAM roles or equivalent short-lived AWS
  credentials instead of long-lived access keys in application environment
  files.
- Real credentials, private URLs, and secrets must never be committed to the
  repository.

## Explicit non-goals

The following are outside the approved product scope unless separately
requested:

- public accounts, registration, password-reset email, OAuth, or social login;
- likes, comments, follower relationships, activity feeds, or notifications;
- albums, tags, search, maps, or analytics;
- automatic EXIF, GPS, camera, lens, or scanner metadata workflows;
- mainland-China-specific hosting, CDN, DNS, or compliance architecture;
- original-image delivery to public visitors;
- infrastructure introduced only for architectural complexity, including
  microservices, Kubernetes, or a mandatory multi-service container platform;
- changing the approved public design as a side effect of storage work.

## Change policy

Implementation work may refine technical details while preserving these product
boundaries. A change that affects the product identity, public behavior,
administrator count, publication rules, privacy boundary, or storage principles
requires an explicit update to this document before code is changed.
