#!/bin/bash
# Install only after review, root-owned, at /usr/local/sbin/wanwu-maintenance.
# No host Node, sudo delegation, user-owned scripts, arbitrary paths, shell eval or daemon changes.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
action="${1:-}"
if [ "$#" -ne 1 ]; then echo 'Specify one fixed Wanwu maintenance action.' >&2; exit 1; fi
case "$action" in backup|cleanup|status|foundation|storage) ;; *) echo 'Unsupported Wanwu maintenance action.' >&2; exit 1;; esac
if [ "$(uname -s)" != Linux ] || [ "$(id -u)" -ne 0 ]; then echo 'A reviewed root-owned Linux maintenance entry is required.' >&2; exit 1; fi
directory=/etc/wanwu-sound/maintenance
private_root_file() {
  local file="$1" uid mode
  [ -f "$file" ] && [ ! -L "$file" ] || return 1
  uid=$(stat -c %u "$file"); mode=$(stat -c %a "$file")
  [ "$uid" = 0 ] && (( (8#$mode & 077) == 0 ))
}
for folder in /etc/wanwu-sound "$directory"; do
  [ -d "$folder" ] && [ ! -L "$folder" ] && [ "$(stat -c %u "$folder")" = 0 ] || { echo 'Unsafe maintenance directory.' >&2; exit 1; }
  mode=$(stat -c %a "$folder")
  (( (8#$mode & 022) == 0 )) || { echo 'Writable maintenance directory refused.' >&2; exit 1; }
done
for file in compose.yml .env.release .env.ops .env.api .env.models .env.worker .env.database backup-public.pem seccomp-profile.json; do
  private_root_file "$directory/$file" || { echo 'Root-owned private maintenance configuration required.' >&2; exit 1; }
done
# Only the reviewed model namespace may override the API env_file. Never source/evaluate this file.
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in ''|\#*) continue;; esac
  field=${line%%=*}
  case "$field" in WANWU_LLM_BASE_URL|WANWU_LLM_MODEL|WANWU_LLM_API_KEY|WANWU_AUDIO_MODEL|WANWU_MUSIC_PROVIDER|WANWU_MUSIC_BASE_URL|WANWU_MUSIC_MODEL|WANWU_MUSIC_API_KEY|WANWU_GUEST_AI_DAILY_LIMIT) ;;
    *) echo 'Unsupported model environment field; values suppressed.' >&2; exit 1;; esac
  [[ "$line" == *=* && "$line" != *'$'* && "$line" != *'`'* ]] || exit 1
done <"$directory/.env.models"
# Serialize the scheduled host actions as well as the database-level GC guard.
if [ -e "$directory/.maintenance.lock" ]; then private_root_file "$directory/.maintenance.lock"; fi
umask 077
exec 9>"$directory/.maintenance.lock"
/usr/bin/flock --exclusive --wait 300 9
docker=(/usr/bin/env -i PATH="$PATH" /usr/bin/docker --host unix:///var/run/docker.sock)
seen='|'; images=(); source_digest=''
while IFS= read -r line || [ -n "$line" ]; do
  field=${line%%=*}; value=${line#*=}
  case "$seen" in *"|$field|"*) echo 'Duplicate release field refused.' >&2; exit 1;; esac
  seen="$seen$field|"
  case "$field" in
    WANWU_API_IMAGE|WANWU_WORKER_IMAGE|WANWU_OPS_IMAGE|WANWU_CATALOGUE_IMAGE)
      [[ "$value" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Unpinned maintenance image refused.' >&2; exit 1; }
      images+=("$value");;
    WANWU_SOURCE_DIGEST)
      [[ "$value" =~ ^[a-f0-9]{64}$ ]] || exit 1
      source_digest=$value;;
    *) echo 'Unsupported release field refused.' >&2; exit 1;;
  esac
done <"$directory/.env.release"
[ "${#images[@]}" = 4 ] && [ -n "$source_digest" ] || exit 1
for image in "${images[@]}"; do
  [ "$("${docker[@]}" image inspect --format '{{index .Config.Labels "ink.proterm.wanwu.source"}}' "$image")" = "$source_digest" ] || { echo 'Maintenance image/source mismatch.' >&2; exit 1; }
done
compose=("${docker[@]}" compose --project-name wanwu-sound --project-directory "$directory" --env-file "$directory/.env.release" --file "$directory/compose.yml")
"${compose[@]}" config --quiet
case "$action" in
  backup) entry=backup-cli.ts;; cleanup) entry=gc-cli.ts;; status) entry=health-cli.ts;; storage) entry=storage-cli.ts;;
  foundation)
    database=$("${compose[@]}" ps --quiet database)
    [ -n "$database" ] || { echo 'Wanwu database container missing.' >&2; exit 1; }
    [ "$("${docker[@]}" inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$database")" = wanwu-sound ]
    [ "$("${docker[@]}" inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$database")" = database ]
    [ "$("${docker[@]}" inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Type}}{{end}}{{end}}' "$database")" = volume ] || { echo 'PostgreSQL persistent volume not verified.' >&2; exit 1; }
    [ "$("${docker[@]}" inspect --format '{{len .HostConfig.PortBindings}}' "$database")" = 0 ] || { echo 'Wanwu database host port must not be published.' >&2; exit 1; }
    entry=foundation-cli.ts;;
esac
exec "${compose[@]}" run --rm --no-deps --pull never ops "apps/api/src/maintenance/$entry"
