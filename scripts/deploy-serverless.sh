#!/bin/bash
set -euo pipefail

profile="our-pictures-dev"
region="ap-northeast-1"
account="066899195278"
table="our-pictures-dev"
role="OurPicturesDevApiRole"
function_name="our-pictures-dev-api"
api_name="our-pictures-dev-api"
web_bucket="our-pictures-dev-066899195278-web"
originals_bucket="our-pictures-dev-066899195278-originals"
distribution="E27LBWNJWHPBCQ"
public_origin="https://z.ziwu.win"
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
task_dir="$(mktemp -d)"
trap 'rm -r "$task_dir"' EXIT

aws_cmd=(aws --profile "$profile" --region "$region")

if ! "${aws_cmd[@]}" iam get-role --role-name "$role" >/dev/null 2>&1; then
  "${aws_cmd[@]}" iam create-role --role-name "$role" \
    --assume-role-policy-document "file://$repo_root/infrastructure/iam/serverless-api-role-trust-policy.json" \
    --tags Key=Project,Value=OurPictures Key=Environment,Value=dev >/dev/null
fi
"${aws_cmd[@]}" iam put-role-policy --role-name "$role" --policy-name OurPicturesServerlessRuntime \
  --policy-document "file://$repo_root/infrastructure/iam/serverless-api-runtime-policy.json"

if ! "${aws_cmd[@]}" dynamodb describe-table --table-name "$table" >/dev/null 2>&1; then
  "${aws_cmd[@]}" dynamodb create-table --table-name "$table" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
    --tags Key=Project,Value=OurPictures Key=Environment,Value=dev >/dev/null
  "${aws_cmd[@]}" dynamodb wait table-exists --table-name "$table"
fi
ttl_status="$("${aws_cmd[@]}" dynamodb describe-time-to-live --table-name "$table" --query 'TimeToLiveDescription.TimeToLiveStatus' --output text)"
if [ "$ttl_status" = "DISABLED" ]; then
  "${aws_cmd[@]}" dynamodb update-time-to-live --table-name "$table" \
    --time-to-live-specification Enabled=true,AttributeName=ttl >/dev/null
fi

npm install --prefix "$repo_root/infrastructure/aws/api" --omit=dev >/dev/null
(cd "$repo_root/infrastructure/aws/api" && zip -qr "$task_dir/api.zip" index.mjs node_modules)

role_arn="arn:aws:iam::$account:role/$role"
function_arn="arn:aws:lambda:$region:$account:function:$function_name"
if "${aws_cmd[@]}" lambda get-function --function-name "$function_name" >/dev/null 2>&1; then
  "${aws_cmd[@]}" lambda update-function-code --function-name "$function_name" --zip-file "fileb://$task_dir/api.zip" >/dev/null
  "${aws_cmd[@]}" lambda wait function-updated-v2 --function-name "$function_name"
  "${aws_cmd[@]}" lambda update-function-configuration --function-name "$function_name" \
    --runtime nodejs24.x --handler index.handler --memory-size 512 --timeout 30 \
    --environment "Variables={TABLE_NAME=$table,ORIGINALS_BUCKET=$originals_bucket,WEB_BUCKET=$web_bucket,PUBLIC_ORIGIN=$public_origin}" >/dev/null
else
  sleep 10
  "${aws_cmd[@]}" lambda create-function --function-name "$function_name" --runtime nodejs24.x \
    --architectures arm64 --handler index.handler --role "$role_arn" --zip-file "fileb://$task_dir/api.zip" \
    --memory-size 512 --timeout 30 --environment "Variables={TABLE_NAME=$table,ORIGINALS_BUCKET=$originals_bucket,WEB_BUCKET=$web_bucket,PUBLIC_ORIGIN=$public_origin}" \
    --tags Project=OurPictures,Environment=dev >/dev/null
fi
"${aws_cmd[@]}" lambda wait function-active-v2 --function-name "$function_name"
"${aws_cmd[@]}" logs create-log-group --log-group-name "/aws/lambda/$function_name" >/dev/null 2>&1 || true
"${aws_cmd[@]}" logs put-retention-policy --log-group-name "/aws/lambda/$function_name" --retention-in-days 14

api_id="$("${aws_cmd[@]}" apigatewayv2 get-apis --query "Items[?Name=='$api_name'].ApiId | [0]" --output text)"
if [ -z "$api_id" ] || [ "$api_id" = "None" ]; then
  api_id="$("${aws_cmd[@]}" apigatewayv2 create-api --name "$api_name" --protocol-type HTTP --target "$function_arn" \
    --query ApiId --output text)"
fi
"${aws_cmd[@]}" lambda add-permission --function-name "$function_name" --statement-id AllowApiGateway \
  --action lambda:InvokeFunction --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$region:$account:$api_id/*/*" >/dev/null 2>&1 || true

api_endpoint="$("${aws_cmd[@]}" apigatewayv2 get-api --api-id "$api_id" --query ApiEndpoint --output text)"
api_host="${api_endpoint#https://}"

(cd "$repo_root" && npm run build >/dev/null)
"${aws_cmd[@]}" s3 sync "$repo_root/out" "s3://$web_bucket" --exclude "moments/*" --cache-control no-cache >/dev/null
"${aws_cmd[@]}" s3 cp "$repo_root/out/admin.html" "s3://$web_bucket/admin" --content-type "text/html; charset=utf-8" --cache-control no-cache >/dev/null
"${aws_cmd[@]}" s3 cp "$repo_root/out/admin/login.html" "s3://$web_bucket/admin/login" --content-type "text/html; charset=utf-8" --cache-control no-cache >/dev/null

if [ "${SWITCH_CLOUDFRONT:-false}" = "true" ]; then
  etag="$(aws --profile "$profile" cloudfront get-distribution-config --id "$distribution" --query ETag --output text)"
  aws --profile "$profile" cloudfront get-distribution-config --id "$distribution" --query DistributionConfig --output json > "$task_dir/current.json"
  node "$repo_root/scripts/configure-serverless-cloudfront.mjs" "$task_dir/current.json" "$task_dir/serverless.json" "$api_host"
  aws --profile "$profile" cloudfront update-distribution --id "$distribution" --if-match "$etag" \
    --distribution-config "file://$task_dir/serverless.json" >/dev/null
  aws --profile "$profile" cloudfront create-invalidation --distribution-id "$distribution" --paths "/*" >/dev/null
fi

echo "$api_id $api_endpoint"
