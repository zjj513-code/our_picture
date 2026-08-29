#!/bin/bash
set -euo pipefail

region="ap-northeast-1"
account_id="066899195278"
repository="our-pictures-dev-web"
image_tag="admin-zh-20260829-01"
image_uri="${account_id}.dkr.ecr.${region}.amazonaws.com/${repository}:${image_tag}"
site_url="https://d1v1mg445zdh54.cloudfront.net"
parameter_prefix="/our-pictures/dev/hosting"

dnf install -y docker
systemctl enable --now docker
mkdir -p /opt/our-pictures
chmod 700 /opt/our-pictures

get_secret() {
  aws ssm get-parameter \
    --region "$region" \
    --name "${parameter_prefix}/$1" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text
}

mysql_root_password="$(get_secret mysql-root-password)"
mysql_app_password="$(get_secret mysql-app-password)"
database_url="mysql://our_pictures:${mysql_app_password}@our-pictures-mysql:3306/our_pictures"

aws ecr get-login-password --region "$region" \
  | docker login --username AWS --password-stdin "${account_id}.dkr.ecr.${region}.amazonaws.com"
docker pull "$image_uri"
docker pull mysql:8.4
docker logout "${account_id}.dkr.ecr.${region}.amazonaws.com" >/dev/null

docker network inspect our-pictures >/dev/null 2>&1 \
  || docker network create our-pictures
docker volume inspect our-pictures-mysql >/dev/null 2>&1 \
  || docker volume create our-pictures-mysql

docker rm -f our-pictures-web our-pictures-mysql >/dev/null 2>&1 || true
docker run -d \
  --name our-pictures-mysql \
  --network our-pictures \
  --restart unless-stopped \
  --volume our-pictures-mysql:/var/lib/mysql \
  --env "MYSQL_ROOT_PASSWORD=${mysql_root_password}" \
  --env MYSQL_DATABASE=our_pictures \
  --env MYSQL_USER=our_pictures \
  --env "MYSQL_PASSWORD=${mysql_app_password}" \
  mysql:8.4

for attempt in $(seq 1 60); do
  if docker exec our-pictures-mysql mysqladmin ping \
    --user=our_pictures --password="$mysql_app_password" --silent; then
    sleep 5
    if docker exec our-pictures-mysql mysqladmin ping \
      --user=our_pictures --password="$mysql_app_password" --silent; then
      break
    fi
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "MySQL did not become ready." >&2
    exit 1
  fi
  sleep 2
done

docker run --rm \
  --network our-pictures \
  --env "DATABASE_URL=${database_url}" \
  "$image_uri" node scripts/migrate-production.mjs

bootstrap_data="$(
  aws ssm get-parameter \
    --region "$region" \
    --name "${parameter_prefix}/bootstrap-data" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || true
)"
if [ -n "$bootstrap_data" ]; then
  printf '%s' "$bootstrap_data" \
    | base64 --decode \
    | gzip --decompress \
    | docker exec -i our-pictures-mysql mysql \
        --user=our_pictures --password="$mysql_app_password" our_pictures
fi

docker run -d \
  --name our-pictures-web \
  --network our-pictures \
  --restart unless-stopped \
  --publish 80:3000 \
  --env NODE_ENV=production \
  --env "SITE_URL=${site_url}" \
  --env "DATABASE_URL=${database_url}" \
  --env AWS_REGION=ap-northeast-1 \
  --env AWS_ORIGINALS_BUCKET=our-pictures-dev-066899195278-originals \
  --env "PHOTO_CDN_BASE_URL=${site_url}" \
  --env AWS_UPLOAD_URL_TTL_SECONDS=900 \
  "$image_uri"

for attempt in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1/health >/dev/null; then
    exit 0
  fi
  if [ "$attempt" -eq 60 ]; then
    docker logs our-pictures-web >&2
    exit 1
  fi
  sleep 2
done
