#!/usr/bin/env bash
# DC6 端：回声独立服务，数据库及附件停写后成套备份。
set -euo pipefail
umask 077
deploy_path="${1:?}"
project="${2:?}"
image="${3:?}"
upload="${4:?}"
[[ "$deploy_path" =~ ^/[A-Za-z0-9_./-]+$ && "$deploy_path" != / ]]
[[ ! "$deploy_path" =~ (^|/)\.\.?(/|$) ]]
[[ "$deploy_path" == */echo-feedback ]]
[[ "$project" == echo-feedback ]]
[[ "$image" =~ ^ghcr\.io/fuego-zero/echo-feedback:(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]
[[ "$upload" == /* && "$upload" =~ /echo-deploy\.[A-Za-z0-9]{8}$ ]]
cd "$deploy_path"
for entry in .env compose.yml data backups; do
  [[ ! -L "$entry" ]] || { echo "部署目录不能通过符号链接指向其他产品" >&2; exit 1; }
done
test -f .env
test -f "$upload/compose.yml"
export COMPOSE_PROJECT_NAME="$project"
export DOCKER_CONFIG="$upload/docker"
exec 9>.deploy.lock
flock -n 9 || { echo "另一个回声部署正在进行" >&2; exit 1; }
# 验证服务边界，避免操作其他产品。
[[ "$(ECHO_IMAGE="$image" docker compose -f "$upload/compose.yml" --project-directory "$PWD" config --services)" == echo ]]
if [[ -f compose.yml ]]; then
  [[ "$(docker compose config --services)" == echo ]]
fi
# 拉取失败不停止服务、不更换配置。
docker pull "$image"
# 为已拉取的版本镜像添加本地同版本标签，容器列表保持简洁。
local_image="echo-feedback:${image##*:}"
docker tag "$image" "$local_image"
mkdir -p data backups
chown 1000:1000 data
chmod 700 data backups
backup="$(mktemp -d "$PWD/backups/release-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX")"
stopped=false
activated=false
recover() {
  result=$?
  if ((result != 0)); then
    if [[ "$activated" == false ]]; then
      [[ ! -f "$backup/.env" ]] || cp "$backup/.env" .env
      [[ ! -f "$backup/compose.yml" ]] || cp "$backup/compose.yml" compose.yml
    fi
    if [[ "$stopped" == true && "$activated" == false ]]; then
      docker compose start echo || true
    fi
    echo "部署失败，检查日志；备份目录：$backup。迁移后不要盲目切换旧镜像。" >&2
  fi
}
trap recover EXIT
if [[ -f compose.yml ]]; then
  cp compose.yml "$backup/compose.yml"
  if [[ -n "$(docker compose ps --status running -q echo)" ]]; then
    stopped=true
  fi
  # 即使处于重启状态也先停止，防止备份期间继续写入。
  docker compose stop echo
fi
cp .env "$backup/.env"
tar -czf "$backup/data.tar.gz" data
printf '%s\n' "$image" > "$backup/target-image"
# 持久镜像引用，使服务器重启后仍使用相同版本。
awk '!/^[[:space:]]*ECHO_IMAGE[[:space:]]*=/' .env > .env.next
printf 'ECHO_IMAGE=%s\n' "$local_image" >> .env.next
cp "$upload/compose.yml" compose.yml.next
mv .env.next .env
mv compose.yml.next compose.yml
activated=true
if ! docker compose up -d --pull never --wait --wait-timeout 180; then
  docker compose stop echo || true
  exit 1
fi
docker compose ps
printf '%s\n' "$image" > .deployed-image
printf '回声部署完成：%s；备份：%s\n' "$image" "$backup"
