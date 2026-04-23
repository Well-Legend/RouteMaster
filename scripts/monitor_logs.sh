#!/bin/bash
# 排單王 (RouteMaster) - 日誌監控腳本
# 用於在無法使用 Metro Server 時查看手機上的 console.log

set -euo pipefail

# 設定 ADB 路徑 (指向我們建立的 wrapper 或 Windows 版本)
ANDROID_HOME="${ANDROID_HOME:-/mnt/c/Users/a0970/AppData/Local/Android/Sdk}"
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

echo "正在連接手機日誌..."
echo "請在手機上開啟 App"
echo "----------------------------------------"

# 清除舊日誌
"$ADB_PATH" logcat -c

# 過濾並顯示日誌
# - ReactNative: 顯示 React Native 的 console.log
# - RouteMaster: 顯示原生層的相關日誌 (如果有)
# - AndroidRuntime: 顯示崩潰錯誤
"$ADB_PATH" logcat -v time *:S ReactNative:V ReactNativeJS:V AndroidRuntime:E com.routemaster.app:V
