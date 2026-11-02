#!/usr/bin/env bash
set -euo pipefail

release_sha="${1:?缺少发行提交 SHA}"
previous_sha="${2:-}"
repository="${GITHUB_REPOSITORY:?缺少仓库名称}"
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]]
[[ "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]
git merge-base --is-ancestor "$release_sha" origin/main

read_version() {
  git show "$1:$2" | node -p 'JSON.parse(require("node:fs").readFileSync(0,"utf8")).version'
}
valid_version() {
  [[ "$1" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]
}
greater_version() {
  node -e 'const a=process.argv[1].split(".").map(BigInt),b=process.argv[2].split(".").map(BigInt);const i=a.findIndex((v,i)=>v!==b[i]);process.exit(i>=0&&a[i]>b[i]?0:1)' "$1" "$2"
}
json_field() {
  node -e 'let value=JSON.parse(require("node:fs").readFileSync(0,"utf8"));for(const key of process.argv[1].split(".")){value=value?.[key]}process.stdout.write(String(value??""))' "$1"
}
version="$(read_version "$release_sha" package.json)"
valid_version "$version"
tag="v$version"

if [[ -n "$previous_sha" ]]; then
  [[ "$previous_sha" =~ ^[0-9a-f]{40}$ ]]
  git merge-base --is-ancestor "$previous_sha" "$release_sha"
  previous_version="$(read_version "$previous_sha" package.json)"
  valid_version "$previous_version"
  if [[ "$previous_version" == "$version" ]]; then
    echo "服务版本号未变，跳过 GitHub Release。"
    exit 0
  fi
  if ! greater_version "$version" "$previous_version"; then
    echo "服务版本号必须递增。" >&2
    exit 1
  fi
fi

mkdir -p .tmp/github-release
scratch="$(mktemp -d .tmp/github-release/run-XXXXXXXX)"
api_read() {
  if gh api "$1" > "$scratch/response.json" 2> "$scratch/error.log"; then
    cat "$scratch/response.json"
  elif [[ "$(< "$scratch/error.log")" == *"(HTTP 404)"* ]]; then
    echo '{}'
  else
    cat "$scratch/error.log" >&2
    return 1
  fi
}

if [[ -z "$previous_sha" ]]; then
  # 补录只接受已有成功 Verify 的 main 历史提交，不构建镜像或触发部署。
  runs="$(api_read "repos/$repository/actions/workflows/ci.yml/runs?head_sha=$release_sha&per_page=100")"
  printf '%s' "$runs" | node -e 'const data=JSON.parse(require("node:fs").readFileSync(0,"utf8"));if(!data.workflow_runs?.some(run=>run.head_sha===process.argv[1]&&run.conclusion==="success"))throw new Error("补录提交尚无成功的 Verify 记录")' "$release_sha"
fi

reference="$(api_read "repos/$repository/git/ref/tags/$tag")"
object_type="$(printf '%s' "$reference" | json_field object.type)"
object_sha="$(printf '%s' "$reference" | json_field object.sha)"
if [[ -n "$object_sha" ]]; then
  # 兼容已有附注标签，但绝不移动或覆盖版本标签。
  for _attempt in 1 2 3 4 5; do
    [[ "$object_type" == tag ]] || break
    object="$(api_read "repos/$repository/git/tags/$object_sha")"
    object_type="$(printf '%s' "$object" | json_field object.type)"
    object_sha="$(printf '%s' "$object" | json_field object.sha)"
  done
  if [[ "$object_type" != commit || "$object_sha" != "$release_sha" ]]; then
    echo "版本标签 $tag 已指向其他提交，请增加服务版本号。" >&2
    exit 1
  fi
fi

release="$(api_read "repos/$repository/releases/tags/$tag")"
if [[ -n "$(printf '%s' "$release" | json_field id)" ]]; then
  [[ -n "$object_sha" ]]
  [[ "$(printf '%s' "$release" | json_field name)" == "$tag" ]]
  [[ "$(printf '%s' "$release" | json_field draft)" == false ]]
  [[ "$(printf '%s' "$release" | json_field prerelease)" == false ]]
  echo "GitHub Release $tag 已存在，无需重复发行。"
  exit 0
fi

latest="$(api_read "repos/$repository/releases/latest")"
latest_tag="$(printf '%s' "$latest" | json_field tag_name)"
latest_option=--latest
if [[ -n "$latest_tag" ]]; then
  latest_version="${latest_tag#v}"
  if ! valid_version "$latest_version" || ! greater_version "$version" "$latest_version"; then
    latest_option=--latest=false
  fi
fi

if [[ -z "$object_sha" ]]; then
  gh api --method POST "repos/$repository/git/refs" -f "ref=refs/tags/$tag" -f "sha=$release_sha" > /dev/null
fi

sdk_version="$(read_version "$release_sha" packages/sdk/package.json)"
[[ "$sdk_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][A-Za-z0-9.-]+)?$ ]]
image="ghcr.io/${repository,,}:$version"
cat > "$scratch/notes.md" <<EOF
服务版本：\`$version\` · SDK 独立版本：\`$sdk_version\`。

\`\`\`sh
docker pull $image
\`\`\`

- [配置、部署和恢复](https://github.com/$repository/blob/$tag/docs/deployment.md)
- [SDK 接入](https://github.com/$repository/blob/$tag/docs/sdk.md)
- [源码提交](https://github.com/$repository/commit/$release_sha)

本发行版记录已发布的服务镜像；生产部署结果以 Release image 工作流中的部署任务为准。浏览器自动化不替代真实宿主联调或手机真机验收。
EOF
gh release create "$tag" --repo "$repository" --verify-tag --target "$release_sha" --title "$tag" --generate-notes --notes-file "$scratch/notes.md" "$latest_option"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  echo "已发行 [$tag](https://github.com/$repository/releases/tag/$tag)，对应提交 $release_sha。" >> "$GITHUB_STEP_SUMMARY"
fi
