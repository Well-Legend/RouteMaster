#!/bin/bash
# RouteMaster - Debug build + install script
# 用於「原生設定有變更」時：重建 Debug APK、安裝到手機、設定 Metro 轉發

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
APK_PATH="${PROJECT_ROOT}/android/app/build/outputs/apk/debug/app-debug.apk"

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
LOCAL_PROPERTIES_PATH="${PROJECT_ROOT}/android/local.properties"

export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME

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

cat > "$LOCAL_PROPERTIES_PATH" <<EOF
sdk.dir=$ANDROID_HOME
EOF

echo "Android SDK: $ANDROID_HOME"

echo "正在建置 Debug APK..."
cd "$PROJECT_ROOT/android"
echo "清理舊編譯快取（確保新原生模組會被連結）..."
rm -rf "$PROJECT_ROOT/android/app/.cxx"
rm -rf "$PROJECT_ROOT/android/app/build/generated/autolinking"
rm -rf "$PROJECT_ROOT/android/build/generated/autolinking"
rm -rf "$PROJECT_ROOT/android/app/build/intermediates/cxx"

# Dex merge 常因 JVM heap 不足失敗，提供可覆寫但較安全的預設值
GRADLE_JVMARGS="${ORG_GRADLE_JVMARGS:--Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8}"
GRADLE_MAX_WORKERS="${GRADLE_MAX_WORKERS:-2}"
echo "Gradle JVM args: $GRADLE_JVMARGS"
echo "Gradle max workers: $GRADLE_MAX_WORKERS"
./gradlew assembleDebug --no-daemon --max-workers="$GRADLE_MAX_WORKERS" -Dorg.gradle.jvmargs="$GRADLE_JVMARGS"

if [ ! -f "$APK_PATH" ]; then
  echo "建置失敗，找不到 APK：$APK_PATH"
  exit 1
fi

echo "正在安裝 Debug APK..."
"$ADB_PATH" install -r "$APK_PATH"

echo "重置 ADB 連線並設定 Port Forwarding..."
"$ADB_PATH" reverse --remove-all
"$ADB_PATH" reverse tcp:8081 tcp:8081

echo "嘗試啟動 App..."
if ! "$ADB_PATH" shell monkey -p com.routemaster.app -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; then
  echo "無法自動啟動 App，請在手機上手動開啟 RouteMaster。"
fi

echo "完成：Debug APK 已安裝，且已設定 8081 轉發。"
