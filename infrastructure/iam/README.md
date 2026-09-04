# IAM boundary

The checked-in policies keep runtime roles separate:

- `serverless-api-runtime-policy.json` gives the application Lambda access only to the
  on-demand table and the required S3 object prefixes.
- `image-processor-runtime-policy.json` gives the processor only its source, result,
  derivative, and logging permissions.
- `serverless-deployer-policy.json` is the temporary deployment-role extension for the
  exact development resources.
- the remaining deployer policies maintain the existing private buckets, CloudFront,
  and image processor.

Use MFA-protected temporary credentials. Do not store Root credentials, access keys,
passwords, or session tokens in the project.
