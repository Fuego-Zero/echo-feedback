#!/usr/bin/env bash
# Actions 端：使用固定主机密钥和一次性凭据目录。
set -euo pipefail
umask 077
: "${SSH_HOST:?}" "${SSH_PORT:?}" "${SSH_USER:?}" "${SSH_PRIVATE_KEY:?}" "${SSH_KNOWN_HOSTS:?}"
: "${DEPLOY_PATH:?}" "${COMPOSE_PROJECT_NAME:?}" "${GHCR_USER:?}" "${GHCR_TOKEN:?}" "${RELEASE_SHA:?}"
[[ "$SSH_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]]
[[ "$SSH_PORT" =~ ^[0-9]{1,5}$ ]] && ((10#$SSH_PORT > 0 && 10#$SSH_PORT <= 65535))
[[ "$SSH_USER" =~ ^[A-Za-z0-9_][A-Za-z0-9._-]*$ ]]
[[ "$DEPLOY_PATH" =~ ^/[A-Za-z0-9_./-]+$ && "$DEPLOY_PATH" != / ]]
[[ ! "$DEPLOY_PATH" =~ (^|/)\.\.?(/|$) ]]
[[ "$DEPLOY_PATH" == */echo-feedback ]]
[[ "$COMPOSE_PROJECT_NAME" == echo-feedback ]]
[[ "$GHCR_USER" =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]]
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]
image="ghcr.io/fuego-zero/echo-feedback:sha-${RELEASE_SHA}"
local_tmp="$(mktemp -d)"
remote_tmp=""
remote="${SSH_USER}@${SSH_HOST}"
ssh_opts=(-p "$SSH_PORT" -i "$local_tmp/key" -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$local_tmp/known_hosts")
cleanup() {
  if [[ "$remote_tmp" =~ ^/tmp/echo-deploy\.[A-Za-z0-9]{8}$ ]]; then
    ssh "${ssh_opts[@]}" "$remote" "rm -rf -- '$remote_tmp'" || true
  fi
  rm -rf -- "$local_tmp"
}
trap cleanup EXIT
printf '%s\n' "$SSH_PRIVATE_KEY" | tr -d '\r' > "$local_tmp/key"
printf '%s\n' "$SSH_KNOWN_HOSTS" | tr -d '\r' > "$local_tmp/known_hosts"
remote_tmp="$(ssh "${ssh_opts[@]}" "$remote" 'umask 077; mktemp -d /tmp/echo-deploy.XXXXXXXX')"
[[ "$remote_tmp" =~ ^/tmp/echo-deploy\.[A-Za-z0-9]{8}$ ]]
scp -P "$SSH_PORT" -i "$local_tmp/key" -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$local_tmp/known_hosts" \
  .tmp/release/compose.yml scripts/deployRemote.sh "$remote:$remote_tmp/"
# 不改变 DC6 上其他项目的 Docker 登录状态。
printf '%s' "$GHCR_TOKEN" | ssh "${ssh_opts[@]}" "$remote" \
  "docker --config '$remote_tmp/docker' login ghcr.io -u '$GHCR_USER' --password-stdin"
ssh "${ssh_opts[@]}" "$remote" \
  "bash '$remote_tmp/deployRemote.sh' '$DEPLOY_PATH' '$COMPOSE_PROJECT_NAME' '$image' '$remote_tmp'"
