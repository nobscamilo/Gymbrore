#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_JAVA_HOME="$ROOT_DIR/tools/jdk-21.0.8+9-jre/Contents/Home"
PORTS_TO_CLEANUP=(8080 9099 4000)
EMULATOR_PID=""

kill_matching_processes() {
  local pattern="$1"

  pkill -f "$pattern" >/dev/null 2>&1 || true
  sleep 0.3
  pkill -9 -f "$pattern" >/dev/null 2>&1 || true
}

kill_port_listeners() {
  local port="$1"
  local pids=""

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "${pids}" ]]; then
    return 0
  fi

  kill ${pids} >/dev/null 2>&1 || true
  sleep 0.4

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    kill -9 ${pids} >/dev/null 2>&1 || true
  fi
}

cleanup_stale_emulators() {
  # Cleanup stale emulator processes from previous interrupted runs.
  kill_matching_processes "firebase-tools emulators:start"
  kill_matching_processes "cloud-firestore-emulator"
  kill_matching_processes "Firestore Emulator"
  kill_matching_processes "firebase emulators:start"

  for port in "${PORTS_TO_CLEANUP[@]}"; do
    kill_port_listeners "$port"
  done
}

shutdown() {
  local exit_code="$?"

  if [[ -n "${EMULATOR_PID}" ]] && kill -0 "${EMULATOR_PID}" >/dev/null 2>&1; then
    kill -TERM "-${EMULATOR_PID}" >/dev/null 2>&1 || kill -TERM "${EMULATOR_PID}" >/dev/null 2>&1 || true
    wait "${EMULATOR_PID}" >/dev/null 2>&1 || true
  fi

  cleanup_stale_emulators
  exit "${exit_code}"
}

trap shutdown EXIT INT TERM

cleanup_stale_emulators

if ! java -version >/dev/null 2>&1; then
  if [[ -x "$LOCAL_JAVA_HOME/bin/java" ]]; then
    export JAVA_HOME="$LOCAL_JAVA_HOME"
    export PATH="$JAVA_HOME/bin:$PATH"
  else
    echo "Java runtime is required for Firestore Emulator."
    echo "Install Java 21+ or place a local JRE at: $LOCAL_JAVA_HOME"
    exit 1
  fi
fi

npx firebase-tools emulators:start --only auth,firestore --project gymbrosar-e2e --config "$ROOT_DIR/firebase.json" &
EMULATOR_PID="$!"
wait "${EMULATOR_PID}"
