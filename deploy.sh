#!/usr/bin/env bash
# asset-lab deploy / remote-access script
#
# Records the SSH connection to the asset-lab remote box and provides a
# tiny entry point so we don't have to remember the user / key combo.
#
# -----------------------------------------------------------------------------
# Server (verified 2026-05-05)
# -----------------------------------------------------------------------------
#   Host         : 1.14.190.95
#   User         : ubuntu                 (NOT root, NOT lighthouse)
#   Hostname     : VM-0-4-ubuntu          (Tencent Cloud CVM, Ubuntu 6.8)
#   SSH key      : ~/.ssh/jet.pem         (RSA 2048,
#                                          SHA256:5oKpQOCCDiaFL73tHoExI4wMXHCqsB839S8ZwTWToU0)
#   Server-side
#   public key   : labelled `skey-kgkoxj5l` in Tencent Cloud console
#
# Why this key (and not ~/.ssh/id_rsa)?
#   id_rsa (SHA256:Enbx...) is NOT installed on this box. Only jet.pem is
#   authorised. -i is required because IdentitiesOnly defaults off and the
#   wrong key would be tried first.
#
# Other users tried and rejected (so future-you doesn't redo this):
#   root, lighthouse, centos, jet.d  -> Permission denied (publickey,password)
# -----------------------------------------------------------------------------

set -euo pipefail

REMOTE_HOST="1.14.190.95"
REMOTE_USER="ubuntu"
SSH_KEY="${HOME}/.ssh/jet.pem"

SSH_OPTS=(
  -i "${SSH_KEY}"
  -o IdentitiesOnly=yes
  -o ServerAliveInterval=30
)

usage() {
  cat <<EOF
Usage: $(basename "$0") <command>

Commands:
  ssh                   Open an interactive shell on ${REMOTE_USER}@${REMOTE_HOST}
  run "<cmd>"           Run a one-off command on the remote host
  ping                  Quick connectivity / auth check (whoami, hostname, uptime)

Connection details are documented in the header of this file.
EOF
}

cmd_ssh() {
  exec ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}"
}

cmd_run() {
  if [[ $# -eq 0 ]]; then
    echo "run: missing command" >&2
    exit 2
  fi
  ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "$@"
}

cmd_ping() {
  ssh "${SSH_OPTS[@]}" -o ConnectTimeout=10 -o BatchMode=yes \
    "${REMOTE_USER}@${REMOTE_HOST}" 'whoami && hostname && uptime'
}

main() {
  local sub="${1:-}"
  case "${sub}" in
    ssh)   shift; cmd_ssh "$@" ;;
    run)   shift; cmd_run "$@" ;;
    ping)  shift; cmd_ping ;;
    ""|-h|--help) usage ;;
    *) echo "Unknown command: ${sub}" >&2; usage; exit 2 ;;
  esac
}

main "$@"
