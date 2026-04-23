#!/bin/bash
# 排單王 (RouteMaster) - 快速建置與驗證腳本
# 此腳本會執行 Release Build (內嵌 JS Bundle)，安裝到手機，並開始監控日誌。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "開始建置流程..."

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

LOCAL_PROPERTIES_PATH="${PROJECT_ROOT}/android/local.properties"

cat > "$LOCAL_PROPERTIES_PATH" <<EOF
sdk.dir=$ANDROID_HOME
EOF

# 1. 確保 Android 環境變數
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
echo "Android SDK: $ANDROID_HOME"

# 2. 執行 Gradle Release Build
# echo "🧹 清理 Gradle Project Cache..."
cd "$PROJECT_ROOT/android"
# ./gradlew --stop
# ./gradlew clean


echo "正在建立獨立 APK (Release Build)..."

./gradlew assembleRelease --no-daemon


# 3. 檢查 APK
APK_PATH="$PROJECT_ROOT/android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK_PATH" ]; then
    echo "建置失敗，找不到 APK 檔案！"
    exit 1
fi

echo "建置成功！"

# 4. 安裝到手機
echo "正在安裝到手機..."
# 自動偵測 Linux/Windows 版本 adb
ADB_CANDIDATE_UNIX="$ANDROID_HOME/platform-tools/adb"
ADB_CANDIDATE_WIN="$ANDROID_HOME/platform-tools/adb.exe"

if [ -x "$ADB_CANDIDATE_UNIX" ]; then
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

"$ADB_PATH" install -r "$APK_PATH"

# 5. 啟動 App
echo "▶️ 啟動 App..."
"$ADB_PATH" shell monkey -p com.routemaster.app -c android.intent.category.LAUNCHER 1

# 6. 監控日誌
echo "📋 開始監控日誌 (按 Ctrl+C 離開)..."
"$SCRIPT_DIR/monitor_logs.sh"
