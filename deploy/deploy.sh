#!/usr/bin/env bash
#
# Deploy or update the 9ri3a API on the VPS.
#
#   sudo -H -u qri3a /srv/qri3a/deploy/deploy.sh
#
# The restart step needs deploy/sudoers.d/qri3a-deploy installed; see
# deploy/RUNBOOK.ar.md step 7.
#
# Order matters and is deliberate: nothing that the running service depends on
# is touched until the step before it succeeded. The build lands in dist/ only
# if it typechecks (noEmitOnError), migrations run before the restart so the new
# code never meets the old schema, and the restart is only called a success once
# /health answers ok. Any failing step aborts and prints how to get back.
#
# Everything below can be overridden from the environment:
#
#   APP_DIR=/srv/qri3a   BRANCH=main   SERVICE=qri3a-api
#   ENV_FILE=/etc/qri3a/api.env        SKIP_SERVICE=1   SKIP_MIGRATIONS=1
#
# The whole body lives in main() on purpose. Bash reads a script incrementally,
# by byte offset, and this script git-merges a new version of itself partway
# through — without the wrapper, execution would continue at that offset into
# different content and splice two versions together. Defining a function forces
# bash to parse the entire file before running any of it.
#
set -Eeuo pipefail

export APP_DIR="${APP_DIR:-/srv/qri3a}"
export BRANCH="${BRANCH:-claude/ecommerce-wholesale-dropshipping-je8lgh}"
export SERVICE="${SERVICE:-qri3a-api}"
export ENV_FILE="${ENV_FILE:-/etc/qri3a/api.env}"
export SKIP_SERVICE="${SKIP_SERVICE:-0}"
export SKIP_MIGRATIONS="${SKIP_MIGRATIONS:-0}"
export HEALTH_RETRIES="${HEALTH_RETRIES:-20}"
# Set when this run is already the result of a handover, so it can happen once.
export QRI3A_REEXECED="${QRI3A_REEXECED:-0}"

BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; RESET=''
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'
  GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
fi

step()  { printf '\n%s▸ %s%s\n' "$BOLD" "$1" "$RESET"; }
info()  { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn()  { printf '  %s! %s%s\n' "$YELLOW" "$1" "$RESET"; }
ok()    { printf '  %s✔ %s%s\n' "$GREEN" "$1" "$RESET"; }

PREVIOUS_COMMIT=''
# 0 until the checkout has actually moved. Before that a failure has changed
# nothing, so the recovery advice below would only be noise.
MOVED=0
# Flipped once the restart has been issued, which is the point where a failure
# means the new code is live rather than merely built.
RESTARTED=0

recovery_hint() {
  [ "$MOVED" = "1" ] || return 0
  if [ "$RESTARTED" = "1" ]; then
    printf '\n  The new code IS running and is not healthy. To go back:\n' >&2
  else
    printf '\n  The service was not restarted, so it is still running the\n  previous code. To put the checkout back to match it:\n' >&2
  fi
  cat >&2 <<EOF

      cd $APP_DIR && git checkout $PREVIOUS_COMMIT && ./deploy/deploy.sh

  Logs:  journalctl -u $SERVICE -n 100 --no-pager
EOF
}

# `die` exits directly, so it never fires the ERR trap — both paths have to ask
# for the hint themselves.
die() { printf '\n%s✗ %s%s\n' "$RED" "$1" "$RESET" >&2; recovery_hint; exit 1; }

on_error() {
  printf '\n%s✗ deploy failed at line %s%s\n' "$RED" "$1" "$RESET" >&2
  recovery_hint
}
trap 'on_error $LINENO' ERR

main() {
  # --- preflight -------------------------------------------------------------
  step "Preflight"

  [ -d "$APP_DIR/.git" ] || die "$APP_DIR is not a git checkout. Clone the repo there first (see deploy/RUNBOOK.ar.md)."
  cd "$APP_DIR"

  command -v node >/dev/null || die "node is not installed. See deploy/RUNBOOK.ar.md step 2."
  command -v npm  >/dev/null || die "npm is not installed."

  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$node_major" -ge 20 ] || die "Node $(node -v) is too old — the API needs Node 20 or newer."
  info "node $(node -v), npm $(npm -v)"

  # `sudo -u qri3a` without -H leaves HOME pointing at the invoking user's home,
  # so npm tries to write its cache into /root/.npm and dies on permissions.
  # Correct it here rather than making everyone remember the flag.
  if [ ! -w "${HOME:-/nonexistent}" ]; then
    HOME="$(getent passwd "$(id -un)" | cut -d: -f6)"
    export HOME
    info "HOME was not writable — using $HOME"
  fi

  [ -f "$ENV_FILE" ] || die "$ENV_FILE is missing. Copy backend/api/.env.production.example there and fill it in."
  [ -r "$ENV_FILE" ] || die "$ENV_FILE exists but $(id -un) cannot read it. Expected root:qri3a 0640."

  # Refuse to clobber uncommitted edits made directly on the server. Hand-editing
  # files there is a bad habit, but silently throwing the changes away is worse.
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    git status --short --untracked-files=no >&2
    die "The checkout has uncommitted changes (above). Commit or discard them, then re-run."
  fi

  PREVIOUS_COMMIT="$(git rev-parse HEAD)"
  info "current commit ${PREVIOUS_COMMIT:0:9}"

  # systemd EnvironmentFile syntax is a subset of shell, so sourcing it is safe
  # for well-formed files. Only DATABASE_URL and friends are needed here — the
  # service itself gets them from systemd, not from this shell.
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  [ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL is not set in $ENV_FILE."

  # NODE_ENV=production belongs to the service, not to this shell. npm reads it
  # and drops every devDependency — TypeScript included — which it does even when
  # --include=dev is passed, so the build would fail on implicit any. Nothing
  # deploy.sh runs cares about NODE_ENV; systemd hands the real value to the
  # service from this same file.
  unset NODE_ENV

  ok "environment loaded from $ENV_FILE"

  # --- update the checkout ---------------------------------------------------
  step "Fetching $BRANCH"

  local attempt delay
  for attempt in 1 2 3 4; do
    if git fetch --prune origin "$BRANCH"; then break; fi
    [ "$attempt" -lt 4 ] || die "git fetch failed 4 times — check the network and the deploy key."
    delay=$((2 ** attempt))
    warn "fetch failed, retrying in ${delay}s"
    sleep "$delay"
  done

  local target_commit
  target_commit="$(git rev-parse "origin/$BRANCH")"
  if [ "$target_commit" = "$PREVIOUS_COMMIT" ]; then
    info "already at origin/$BRANCH — redeploying the same commit"
  else
    info "$(git log --oneline "$PREVIOUS_COMMIT..$target_commit" | wc -l) new commit(s)"
  fi

  # --ff-only rather than reset --hard: if the branch was force-pushed this stops
  # instead of silently discarding whatever the server had.
  git checkout --quiet "$BRANCH" 2>/dev/null || git checkout --quiet -b "$BRANCH" "origin/$BRANCH"
  git merge --ff-only "origin/$BRANCH"
  MOVED=1
  ok "checkout at $(git rev-parse --short HEAD)"

  # If that update changed this script, finish the job with the new one. Nothing
  # has been installed or built yet, so starting over costs a fetch. The env flag
  # makes it happen at most once.
  if [ "$QRI3A_REEXECED" != "1" ] &&
     ! git diff --quiet "$PREVIOUS_COMMIT" HEAD -- deploy/deploy.sh; then
    info "deploy.sh changed in this update — handing over to the new version"
    QRI3A_REEXECED=1 exec "$APP_DIR/deploy/deploy.sh" "$@"
  fi

  # --- dependencies ----------------------------------------------------------
  step "Installing dependencies"

  # Only the API workspace. The two Expo apps and shared-ui are built by CI into
  # APKs and have no business pulling ~1GB of native tooling onto a small VPS.
  #
  # --include=dev is not redundant: npm drops the *selected workspace's* dev
  # dependencies when --workspace is given, so without it TypeScript and every
  # @types package are missing and the build below fails on implicit any.
  npm ci --workspace @ecommerce/api --include-workspace-root --include=dev
  ok "node_modules installed"

  # --- build -----------------------------------------------------------------
  step "Building"

  npm run api:build
  [ -f backend/api/dist/server.js ] || die "Build finished but backend/api/dist/server.js is missing."
  ok "compiled to backend/api/dist"

  # --- migrations ------------------------------------------------------------
  if [ "$SKIP_MIGRATIONS" = "1" ]; then
    step "Migrations"
    warn "skipped (SKIP_MIGRATIONS=1)"
  else
    step "Applying migrations"
    # The built runner, not the tsx one: this must keep working even after a
    # future `npm ci --omit=dev`.
    node backend/api/dist/db/migrate.js up
    ok "schema up to date"
  fi

  # --- restart ---------------------------------------------------------------
  if [ "$SKIP_SERVICE" = "1" ]; then
    step "Restart"
    warn "skipped (SKIP_SERVICE=1) — the new code is built but not running"
    return 0
  fi

  step "Restarting $SERVICE"

  local systemctl_cmd=(systemctl)
  if [ "$(id -u)" -ne 0 ]; then
    command -v sudo >/dev/null || die "Not root and sudo is unavailable — cannot restart $SERVICE."
    systemctl_cmd=(sudo -n systemctl)
  fi

  "${systemctl_cmd[@]}" restart "$SERVICE" ||
    die "systemctl restart failed. Is deploy/sudoers.d/qri3a-deploy installed? See: journalctl -u $SERVICE -n 50 --no-pager"
  RESTARTED=1
  ok "restart issued"

  # --- verify ----------------------------------------------------------------
  step "Verifying"

  local health_url="${HEALTH_URL:-http://127.0.0.1:${PORT:-4000}/health}"
  info "GET $health_url"

  local health=''
  for attempt in $(seq 1 "$HEALTH_RETRIES"); do
    if health="$(curl -fsS --max-time 5 "$health_url" 2>/dev/null)"; then break; fi
    health=''
    [ "$attempt" -lt "$HEALTH_RETRIES" ] || break
    sleep 1
  done

  if [ -z "$health" ]; then
    if systemctl is-active --quiet "$SERVICE"; then
      die "$SERVICE is running but /health never answered. Check HOST/PORT in $ENV_FILE and: journalctl -u $SERVICE -n 50 --no-pager"
    fi
    die "$SERVICE failed to start. Read the reason: journalctl -u $SERVICE -n 50 --no-pager"
  fi

  # node rather than jq: node is already a hard requirement, jq is not.
  node -e '
    const h = JSON.parse(process.argv[1]);
    const mark = (b) => (b ? "✔" : "✗");
    console.log(`  ${mark(h.status === "ok")} status: ${h.status}`);
    console.log(`  ${mark(h.database?.ok)} database: ${h.database?.ok ? h.database.latencyMs + "ms" : h.database?.error}`);
    console.log(`  ${mark(h.payments?.configured)} payments: ${h.payments?.provider}` +
      (h.payments?.configured ? "" : " (not configured — checkout answers 503)"));
    console.log(`    environment: ${h.environment}`);
    if (h.status !== "ok") process.exit(1);
  ' "$health" || die "The API answered but reports it is not healthy (see above)."

  trap - ERR
  printf '\n%s✔ deployed %s to %s%s\n' \
    "$GREEN" "$(git rev-parse --short HEAD)" "$SERVICE" "$RESET"
  printf '  %sfollow the log: journalctl -u %s -f%s\n' "$DIM" "$SERVICE" "$RESET"
}

main "$@"
