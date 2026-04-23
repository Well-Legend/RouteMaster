#!/bin/bash
# RouteMaster - Metro only script
# 用於「日常 JS/TS 開發」：只啟動 Metro，不重建 APK

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LAST_EXPO_LOG_FILE=""

cleanup_temp_files() {
  if [ -n "${LAST_EXPO_LOG_FILE:-}" ] && [ -f "$LAST_EXPO_LOG_FILE" ]; then
    rm -f "$LAST_EXPO_LOG_FILE"
  fi
}

trap cleanup_temp_files EXIT

is_wsl() {
  grep -qi "microsoft" /proc/version 2>/dev/null
}

require_supported_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "找不到 node。請先安裝 Node.js 20 以上版本。"
    exit 1
  fi

  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"

  if [ "$node_major" -lt 20 ]; then
    echo "目前 Node.js 版本過舊：$(node -v)"
    echo "Expo SDK 54 需要 Node.js 20 以上，否則 Metro 會出現 toReversed 相關錯誤。"
    echo "建議切換到 Node 20 或 22 後再執行。"
    echo "若你使用 nvm，可執行：nvm install 20 && nvm use 20"
    exit 1
  fi
}

resolve_expo_cli_command() {
  if [ -f "$PROJECT_ROOT/node_modules/expo/bin/cli" ]; then
    echo "node|$PROJECT_ROOT/node_modules/expo/bin/cli"
    return 0
  fi

  if command -v npx >/dev/null 2>&1; then
    echo "npx|expo"
    return 0
  fi

  if command -v npm >/dev/null 2>&1; then
    echo "npm|exec expo"
    return 0
  fi

  return 1
}

require_supported_node

resolve_android_sdk() {
  local candidates=()

  if [ -n "${ANDROID_HOME:-}" ]; then
    candidates+=("$ANDROID_HOME")
  fi
  if [ -n "${ANDROID_SDK_ROOT:-}" ]; then
    candidates+=("$ANDROID_SDK_ROOT")
  fi

  if command -v adb >/dev/null 2>&1; then
    local adb_cmd
    adb_cmd="$(command -v adb)"
    local adb_guess
    adb_guess="$(cd "$(dirname "$adb_cmd")/.." 2>/dev/null && pwd || true)"
    if [ -n "$adb_guess" ]; then
      candidates+=("$adb_guess")
    fi

    if [ -f "$adb_cmd" ]; then
      local adb_target
      adb_target="$(grep -Eo '/[^" ]+/platform-tools/adb(\.exe)?' "$adb_cmd" | head -n 1 || true)"
      case "$adb_target" in
        */platform-tools/adb.exe)
          candidates+=("${adb_target%/platform-tools/adb.exe}")
          ;;
        */platform-tools/adb)
          candidates+=("${adb_target%/platform-tools/adb}")
          ;;
      esac
    fi
  fi

  candidates+=(
    "$HOME/Android/Sdk"
    "/mnt/c/Users/$(whoami)/AppData/Local/Android/Sdk"
  )

  local sdk
  for sdk in "${candidates[@]}"; do
    if [ -z "$sdk" ]; then
      continue
    fi
    if [ -x "$sdk/platform-tools/adb" ] || [ -x "$sdk/platform-tools/adb.exe" ] || [ -d "$sdk/platforms" ]; then
      echo "$sdk"
      return 0
    fi
  done

  return 1
}

ANDROID_HOME="$(resolve_android_sdk || true)"
if [ -z "$ANDROID_HOME" ]; then
  echo "找不到 Android SDK。"
  echo "請設定 ANDROID_HOME 或 ANDROID_SDK_ROOT，或安裝到預設路徑："
  echo "  $HOME/Android/Sdk"
  echo "  /mnt/c/Users/<你的帳號>/AppData/Local/Android/Sdk"
  exit 1
fi

ADB_CANDIDATE_UNIX="${ANDROID_HOME}/platform-tools/adb"
ADB_CANDIDATE_WIN="${ANDROID_HOME}/platform-tools/adb.exe"
EXPO_ANDROID_HOME="$ANDROID_HOME"
USING_WINDOWS_ADB_IN_WSL=0

if is_wsl && [ -x "$ADB_CANDIDATE_WIN" ]; then
  ADB_PATH="$ADB_CANDIDATE_WIN"
elif [ -x "$ADB_CANDIDATE_UNIX" ]; then
  ADB_PATH="$ADB_CANDIDATE_UNIX"
elif [ -x "$ADB_CANDIDATE_WIN" ]; then
  ADB_PATH="$ADB_CANDIDATE_WIN"
elif command -v adb >/dev/null 2>&1; then
  ADB_PATH="$(command -v adb)"
else
  echo "找不到 adb。"
  echo "已嘗試：$ADB_CANDIDATE_UNIX"
  echo "已嘗試：$ADB_CANDIDATE_WIN"
  echo "並且 PATH 中也沒有 adb。請確認 ANDROID_HOME 或安裝 platform-tools。"
  exit 1
fi

if is_wsl && [[ "$ADB_PATH" == *.exe ]]; then
  USING_WINDOWS_ADB_IN_WSL=1
fi

if is_wsl && [ ! -x "$ADB_CANDIDATE_UNIX" ] && [ -x "$ADB_CANDIDATE_WIN" ]; then
  # Expo CLI 在 Linux 會嘗試執行 $ANDROID_HOME/platform-tools/adb（不帶 .exe）。
  # 建立一個 WSL shim SDK，讓 Expo 可以透過 wrapper 呼叫 Windows adb.exe。
  EXPO_ANDROID_HOME="${TMPDIR:-/tmp}/routemaster-android-sdk"
  EXPO_PLATFORM_TOOLS_DIR="$EXPO_ANDROID_HOME/platform-tools"
  EXPO_ADB_WRAPPER="$EXPO_PLATFORM_TOOLS_DIR/adb"

  mkdir -p "$EXPO_PLATFORM_TOOLS_DIR"
  printf '#!/usr/bin/env bash\nexec %q "$@"\n' "$ADB_PATH" > "$EXPO_ADB_WRAPPER"
  chmod +x "$EXPO_ADB_WRAPPER"

  # 保留常用目錄連結，避免某些工具檢查 SDK 結構時失敗。
  for sdk_dir in platforms build-tools emulator cmdline-tools licenses; do
    if [ -e "$ANDROID_HOME/$sdk_dir" ]; then
      ln -sfn "$ANDROID_HOME/$sdk_dir" "$EXPO_ANDROID_HOME/$sdk_dir"
    fi
  done
fi

echo "檢查 ADB 裝置連線..."
ADB_DEVICES_OUTPUT="$("$ADB_PATH" devices 2>&1 || true)"
ADB_DEVICES_NORMALIZED="$(printf '%s\n' "$ADB_DEVICES_OUTPUT" | tr -d '\r')"

if printf '%s' "$ADB_DEVICES_NORMALIZED" | grep -q "UtilBindVsockAnyPort"; then
  echo "偵測到 WSL ADB 連線異常（UtilBindVsockAnyPort）。"
  echo "建議在 Windows PowerShell 執行 adb，或重啟 WSL 後再試。"
  echo "目前 adb 輸出："
  printf '%s\n' "$ADB_DEVICES_NORMALIZED"
fi

DEVICE_COUNT="$(printf '%s\n' "$ADB_DEVICES_NORMALIZED" | awk 'NR > 1 { gsub(/\r/, "", $2); if ($2 == "device") { count++ } } END { print count + 0 }')"
OFFLINE_COUNT="$(printf '%s\n' "$ADB_DEVICES_NORMALIZED" | awk 'NR > 1 { gsub(/\r/, "", $2); if ($2 == "offline") { count++ } } END { print count + 0 }')"
ADB_REVERSE_READY=0
if [ "$USING_WINDOWS_ADB_IN_WSL" -eq 1 ]; then
  DEFAULT_EXPO_HOST="tunnel"
else
  DEFAULT_EXPO_HOST="lan"
fi

if [ "$DEVICE_COUNT" -gt 0 ]; then
  echo "偵測到 $DEVICE_COUNT 台裝置，設定 ADB Port Forwarding..."
  "$ADB_PATH" reverse --remove-all >/dev/null 2>&1 || true
  if "$ADB_PATH" reverse tcp:8081 tcp:8081 >/dev/null 2>&1; then
    ADB_REVERSE_READY=1
    if [ "$USING_WINDOWS_ADB_IN_WSL" -eq 1 ]; then
      echo "ADB reverse 成功；目前環境為 WSL + Windows adb，Metro 預設改用 tunnel 以提高穩定性。"
    else
      DEFAULT_EXPO_HOST="localhost"
      echo "ADB reverse 成功，Metro 預設將使用 localhost。"
    fi
  else
    echo "警告：adb reverse 設定失敗，將繼續啟動 Metro。"
    echo "已自動改用 LAN 模式，請確保手機與電腦在同一網段。"
  fi
else
  echo "未偵測到裝置/模擬器，跳過 ADB Port Forwarding。"
  if [ -n "$ADB_DEVICES_NORMALIZED" ]; then
    echo "adb devices 輸出："
    printf '%s\n' "$ADB_DEVICES_NORMALIZED"
  fi
  if [ "$OFFLINE_COUNT" -gt 0 ]; then
    echo "偵測到 $OFFLINE_COUNT 台裝置處於 offline。"
    echo "請先重新啟動模擬器，或執行 adb kill-server && adb start-server 後再試。"
  fi
  echo "若要 USB 連線除錯，請先連上手機並確認 'adb devices' 可看到裝置。"
fi

# 提供 Expo CLI 明確的 Android SDK 路徑，避免退回錯誤預設值（~/Android/sdk）
export ANDROID_HOME="$EXPO_ANDROID_HOME"
export ANDROID_SDK_ROOT="$EXPO_ANDROID_HOME"

if [ -z "${NODE_OPTIONS:-}" ]; then
  export NODE_OPTIONS="--max-old-space-size=2048"
fi

echo "------------------------------------------------"
echo "Metro 即將啟動 (Port 8081)"
echo "若你只改 JS/TS，不需要重新 build/install APK"
echo "------------------------------------------------"

cd "$PROJECT_ROOT"

# 依裝置狀態決定預設 host，並允許 CLI 參數覆寫。
FILTERED_ARGS=()
SELECTED_EXPO_HOST="$DEFAULT_EXPO_HOST"
SKIP_NEXT=0
for arg in "$@"; do
  if [ "$SKIP_NEXT" -eq 1 ]; then
    case "$arg" in
      lan|localhost|tunnel)
        SELECTED_EXPO_HOST="$arg"
        ;;
      *)
        echo "警告：不支援的 --host 參數 '$arg'，將交給 Expo CLI 自行處理。"
        FILTERED_ARGS+=("--host" "$arg")
        ;;
    esac
    SKIP_NEXT=0
    continue
  fi

  case "$arg" in
    --host|-m)
      SKIP_NEXT=1
      ;;
    --lan)
      SELECTED_EXPO_HOST="lan"
      ;;
    --localhost)
      SELECTED_EXPO_HOST="localhost"
      ;;
    --tunnel)
      SELECTED_EXPO_HOST="tunnel"
      ;;
    *)
      FILTERED_ARGS+=("$arg")
      ;;
  esac
done

if [ "$SKIP_NEXT" -eq 1 ]; then
  echo "警告：偵測到 --host 但未提供參數，將使用預設 host：$SELECTED_EXPO_HOST"
fi

if [ "$USING_WINDOWS_ADB_IN_WSL" -eq 1 ] && [ "$SELECTED_EXPO_HOST" = "localhost" ]; then
  echo "警告：WSL + Windows adb 使用 localhost 可能導致連線中斷（unexpected end of stream）。"
  echo "建議改用 --tunnel，或在 Dev Client 內選擇 exp.direct 的 server。"
fi

EXPO_CLI_RESOLUTION="$(resolve_expo_cli_command || true)"
if [ -z "$EXPO_CLI_RESOLUTION" ]; then
  echo "找不到 Expo CLI 執行方式。"
  echo "請確認已安裝依賴（node_modules），且系統至少能使用 node 或 npx/npm。"
  exit 1
fi

IFS='|' read -r EXPO_RUNNER EXPO_TARGET <<< "$EXPO_CLI_RESOLUTION"

run_expo_start() {
  local host="$1"
  shift

  cleanup_temp_files
  LAST_EXPO_LOG_FILE="$(mktemp -t routemaster-expo-start.XXXXXX.log)"

  set +e
  case "$EXPO_RUNNER" in
    node)
      node "$EXPO_TARGET" start --"$host" --dev-client "$@" 2>&1 | tee "$LAST_EXPO_LOG_FILE"
      local exit_code=${PIPESTATUS[0]}
      ;;
    npx)
      npx "$EXPO_TARGET" start --"$host" --dev-client "$@" 2>&1 | tee "$LAST_EXPO_LOG_FILE"
      local exit_code=${PIPESTATUS[0]}
      ;;
    npm)
      npm exec expo start --"$host" --dev-client "$@" 2>&1 | tee "$LAST_EXPO_LOG_FILE"
      local exit_code=${PIPESTATUS[0]}
      ;;
    *)
      set -e
      echo "未知的 Expo CLI 執行器：$EXPO_RUNNER"
      return 1
      ;;
  esac
  set -e

  return "$exit_code"
}

is_tunnel_start_failure() {
  if [ -z "${LAST_EXPO_LOG_FILE:-}" ] || [ ! -f "$LAST_EXPO_LOG_FILE" ]; then
    return 1
  fi

  grep -Eiq \
    'failed to start tunnel|remote gone away|Tunnel connection has been closed|ngrok tunnel took too long to connect|NGROK_CONNECT|NGROK_ADB' \
    "$LAST_EXPO_LOG_FILE"
}

get_tunnel_fallback_host() {
  if [ "$ADB_REVERSE_READY" -eq 1 ] && [ "$USING_WINDOWS_ADB_IN_WSL" -eq 0 ]; then
    echo "localhost"
  else
    echo "lan"
  fi
}

echo "Expo host 模式：$SELECTED_EXPO_HOST"
if run_expo_start "$SELECTED_EXPO_HOST" "${FILTERED_ARGS[@]}"; then
  exit 0
fi
EXPO_EXIT_CODE=$?

if [ "$SELECTED_EXPO_HOST" = "tunnel" ] && \
   [ "${ROUTEMASTER_DISABLE_TUNNEL_FALLBACK:-0}" != "1" ] && \
   is_tunnel_start_failure; then
  FALLBACK_EXPO_HOST="$(get_tunnel_fallback_host)"

  if [ "$FALLBACK_EXPO_HOST" != "$SELECTED_EXPO_HOST" ]; then
    echo ""
    echo "偵測到 Expo tunnel 啟動失敗，將自動改用 ${FALLBACK_EXPO_HOST} 重試一次。"
    if [ "$FALLBACK_EXPO_HOST" = "localhost" ]; then
      echo "原因：已完成 adb reverse，本機直連通常比 tunnel 更穩定。"
    else
      echo "原因：目前沒有可用 tunnel，改用區網連線避免 Metro 直接中止。"
    fi
    echo "若你想保留原行為，可加上 ROUTEMASTER_DISABLE_TUNNEL_FALLBACK=1。"
    echo ""
    echo "Expo host 模式：$FALLBACK_EXPO_HOST"

    if run_expo_start "$FALLBACK_EXPO_HOST" "${FILTERED_ARGS[@]}"; then
      exit 0
    fi
    EXPO_EXIT_CODE=$?
  fi
fi

exit "$EXPO_EXIT_CODE"
