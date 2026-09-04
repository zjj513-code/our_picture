# AWS deployment

Regional resources use `ap-northeast-1`.

| Component | Resource |
| --- | --- |
| Static site and derivatives | private web S3 bucket + CloudFront OAC |
| Original uploads | private originals S3 bucket |
| Application API | API Gateway HTTP API + `our-pictures-dev-api` Lambda |
| Data | `our-pictures-dev` DynamoDB table, `PAY_PER_REQUEST` |
| Image processing | `our-pictures-dev-image-processor` Lambda |

`api/` contains the application Lambda package. `lambda/` contains the image processor.
The originals-bucket notification invokes only the image processor for source objects.

Run `npm run deploy` from the repository root to update the API and static files.
Set `SWITCH_CLOUDFRONT=true` only when the distribution configuration should also be
re-applied.

The live, non-secret resource identifiers are in [`state/dev.json`](state/dev.json).
