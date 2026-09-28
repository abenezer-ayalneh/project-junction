#!/bin/sh
set -eu

# Docker Compose mounts each host-protected file here without putting its value
# in image metadata or the Compose environment.
for name in DATABASE_URL REDIS_URL BETTER_AUTH_SECRET RESEND_API_KEY SUMSUB_APP_TOKEN SUMSUB_SECRET_KEY SUMSUB_WEBHOOK_SECRET MEDIA_S3_ACCESS_KEY_ID MEDIA_S3_SECRET_ACCESS_KEY STAGING_BASIC_AUTH_HASH; do
	file="/run/secrets/$name"
	if [ -f "$file" ]; then
		value=$(cat "$file")
		export "$name=$value"
		unset value
	fi
done

exec "$@"
