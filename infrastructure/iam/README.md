# Our Pictures IAM policies

These policies define the Phase 3 development environment security boundary.
Adding a policy file alone does not create or modify an AWS resource. The
development assignments described below are active; deployed resource IDs are
recorded separately in `../aws/state/dev.json`.

## Fixed development resource names

| Resource | Name or ARN |
| --- | --- |
| Region | `ap-northeast-1` |
| Account | `066899195278` |
| Originals bucket | `our-pictures-dev-066899195278-originals` |
| Web bucket | `our-pictures-dev-066899195278-web` |
| Image processor | `our-pictures-dev-image-processor` |
| Processor role | `OurPicturesDevImageProcessorRole` |
| Local application role | `OurPicturesDevApplicationRole` |
| Deployment role | `OurPicturesDeployerRole` |
| Web-host role | `OurPicturesDevWebHostRole` |
| Web-host instance profile | `OurPicturesDevWebHostProfile` |

The account ID is used as the development bucket suffix. Production must use a
separate environment, bucket pair, and policy set.

## Policy assignment

| Principal or resource | Policy |
| --- | --- |
| `our-pictures-cli` | `user-assume-roles-policy.json` |
| `OurPicturesDeployerRole` | `deployer-maintenance-policy.json` after Phase 3A; `deployer-bootstrap-policy.json` only while creating resources |
| `OurPicturesDevApplicationRole` | `application-runtime-policy.json` |
| `OurPicturesDevImageProcessorRole` | `image-processor-runtime-policy.json` |
| `OurPicturesDevWebHostRole` | `web-host-runtime-policy.json` plus AWS-managed `AmazonSSMManagedInstanceCore` |
| Originals bucket | `originals-bucket-policy.json` |
| Web bucket | rendered `web-bucket-policy.template.json` |
| Lambda function | one S3 invoke permission described below |
| `OurPicturesDeployerRole` hosting extension | `hosting-maintenance-policy.json` |

The deployment role deliberately cannot create roles, change role trust
policies, or attach IAM policies. An administrator must create the two runtime
roles from the checked-in trust and permissions policies. This prevents the
deployment role from turning an application or Lambda role into a privilege
escalation path.

The bootstrap policy has no delete permissions. CloudFront creation/list
actions and `logs:DescribeLogGroups` must use `Resource: "*"` because AWS does
not support a narrower resource for those operations. Distribution creation is
still constrained by required `Project=OurPictures` and `Environment=dev`
request tags. Remove the bootstrap policy after the resource IDs are known and
replace it with a generated maintenance policy scoped to the exact distribution
and OAC IDs.

`deployer-maintenance-policy.json` is that generated post-bootstrap policy. It
cannot create buckets, functions, log groups, distributions, or OACs; it can
only maintain the fixed development resources recorded in
`../aws/state/dev.json`.

## Trust policies

- `application-role-trust-policy.json` permits only the MFA-authenticated
  `our-pictures-cli` IAM user to assume the local application role.
- `image-processor-role-trust-policy.json` permits only the Lambda service to
  assume the processor role.
- `web-host-role-trust-policy.json` permits only the EC2 service to assume the
  web-host runtime role.
- `user-assume-roles-policy.json` is the IAM user's complete project role
  allowlist. It permits the deployment and local application roles, but not the
  Lambda execution role.

## Lambda permission for S3 events

Lambda resource policies are managed through `AddPermission`, not by uploading
a complete JSON policy document. `OurPicturesDeployerRole` deliberately does
not receive that permission-management action. After the function exists, an
administrator adds exactly this one permission:

```sh
aws lambda add-permission \
  --region ap-northeast-1 \
  --function-name our-pictures-dev-image-processor \
  --statement-id AllowOurPicturesOriginalsBucket \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-account 066899195278 \
  --source-arn arn:aws:s3:::our-pictures-dev-066899195278-originals
```

The command must be run from a separately authenticated administrator session,
or applied through the AWS console after its values have been checked. The
originals bucket notification must filter keys to the `originals/` prefix.
This keeps `processing-results/` writes from recursively invoking the function.

## CloudFront bucket policy rendering

`web-bucket-policy.template.json` contains one intentional
`${CLOUDFRONT_DISTRIBUTION_ID}` placeholder. Do not apply it until CloudFront
returns the development distribution ID. Replace that placeholder and validate
the rendered policy before calling `PutBucketPolicy`. The resulting `SourceArn`
allows only that one distribution to read web derivatives.

## Deliberate exclusions

These policies do not grant:

- access to any bucket outside the fixed development pair;
- `s3:DeleteObject`, `s3:DeleteBucket`, Lambda deletion, or CloudFront deletion;
- public reads of either bucket or reads of original scans through CloudFront;
- KMS permissions (the first development version uses S3-managed encryption);
- RDS, ECS, Secrets Manager, Route 53, ACM, or production access;
- IAM role/policy administration to the deployment role;
- application access to Lambda invocation or remote-object deletion.

The hosting extension is limited to the one ECR repository, the
`/our-pictures/dev/hosting/*` SSM parameter path, read-only EC2 state, and SSM
commands on the correctly tagged web-host instance. It cannot create, terminate,
resize, or reconfigure EC2 resources. CloudFront maintenance remains restricted
to the exact tagged development distribution, including reading the status of
an invalidation that the same role created.

Direct PUT uploads cannot enforce content length through an IAM condition. The
application must validate the requested metadata before signing, use a 900
second URL lifetime, and verify the stored object's size, checksum, media type,
and decodability after upload. The originals bucket policy also rejects PUT
signatures older than 15 minutes.
