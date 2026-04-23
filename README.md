# RouteMaster

RouteMaster 是一個為外送員、物流司機與需要跑多點任務的人設計的 Android 路線規劃 App。它把原本零散的「看圖片抄地址、手動排序、切換地圖導航、送完再回頭記錄」流程，收斂成一條可直接操作的主線：

`掃描或匯入地址 -> 批次校對 -> 一鍵最佳化 -> 導航 -> 完成配送 -> 回看紀錄`

## App 簡介

目前 app 的核心能力包含：

- OCR 掃描圖片中的地址，並做地址解析
- 批次校對配送單，避免直接污染路線
- 根據道路矩陣或 fallback 距離做多點路徑最佳化
- 一鍵開啟 Google Maps 導航
- 完成配送後回看歷史成果與統計
- 以 Supabase 做帳號、資料隔離與雲端同步

目前 repo 公開版本以 Android 為主，IOS版本尚未開發

## Director-MAS (Multi-Agent System)

這個專案是將 AI agents 拆分成一個有角色分工的小團隊，並由其作為主要開發者，而我只擔任方向決策的角色當成來協作。

開發流程：

1. 先用架構規則鎖定專案邊界，避免 agent 憑印象亂改目錄或資料流。
2. 再用不同角色的 skill 啟動對應 agent，例如前端、後端、OCR、routing、QA、tech lead。
3. 每個 agent 只處理自己那條線的任務，並依交接模板回報已完成項目、風險與下一棒。
4. 最後由我做方向決策、驗收與收斂。

這套 workflow 的核心文件都保留在 repo 內：

- 架構規則：[.agent/rules/architecture.md](/home/well/RouteMaster/.agent/rules/architecture.md)
- Agent team spec：[docs/agent-team-spec.md](/home/well/RouteMaster/docs/agent-team-spec.md)
- Agent thread prompts：[docs/agent-thread-prompts.md](/home/well/RouteMaster/docs/agent-thread-prompts.md)
- Agent handoff template：[docs/agent-handoff-template.md](/home/well/RouteMaster/docs/agent-handoff-template.md)
- Role skills：`.codex/skills/*`

簡單說，這個 repo 想呈現的不只是成品，也包含「我如何用多 agent 協作，把產品從需求拆解、功能實作、驗證到收尾交付完整走完」。

## 開發技術

### App / Frontend

- React Native
- Expo SDK 54
- Expo Router
- TypeScript
- React Native Maps
- Expo Camera / Image Picker / Location

### Backend / Data

- Supabase Auth
- Supabase Postgres
- RLS
- OpenRouteService Matrix
- Google Maps Geocoding / Places / Navigation 相關能力

### AI / Development Workflow

- Codex multi-agent workflow
- repo-local architecture rule
- role-based skills
- executable evidence scripts

## 系統架構

專案採用 `Expo Router + feature modules + Supabase cloud-first` 結構。

```text
app/
  _layout.tsx               # root stack / modal routes
  (tabs)/_layout.tsx        # authenticated tab shell
  (tabs)/*.tsx              # route entrypoints

src/
  auth/                     # session, Google sign-in, account lifecycle
  components/               # shared UI primitives
  config/                   # env-driven runtime config
  database/                 # legacy local storage / migration support
  features/
    account/                # account management
    billing/                # paywall / entitlement UI
    dashboard/              # main delivery flow
    gamification/           # territory / progression logic
    geocoding/              # geocode / place lookup
    history/                # history and insights
    routing/                # matrix, optimization, geo math
    scanner/                # OCR, parser, batch review
    settings/               # settings UI
  hooks/                    # reusable app-facing hooks
  picture/                  # feature-owned bitmap assets
  supabase/                 # cloud data callers and migration bridge
  theme/                    # shared design tokens

android/                    # committed Android native project
supabase/                   # schema and edge function code
scripts/                    # build / Metro / evidence scripts
```


## 初始化設定

### 1. 環境需求

- Node.js 20 以上
- npm
- Java 17
- Android SDK
- adb

### 2. 安裝依賴

```bash
npm install
```

### 3. 建立環境變數

把 `.env.example` 複製為 `.env`，至少填入以下欄位：

```bash
GOOGLE_MAPS_ANDROID_API_KEY=你的_ANDROID_GOOGLE_MAPS_API_KEY
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=你的_SUPABASE_ANON_KEY
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=你的_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_MAPS_SERVER_KEY=你的_SERVER_API_KEY
EXPO_PUBLIC_ORS_API_KEY=你的_ORS_API_KEY
```




### 4. 初始化 Supabase

1. 建立 Supabase 專案
2. 在 Authentication 中啟用 Google
3. 執行 [supabase/schema.sql](/home/well/RouteMaster/supabase/schema.sql)
4. 把對應的 Supabase URL / anon key 填進 `.env`

### 5. 初始化 Google OAuth / Maps

1. 在 Google Cloud Console 建立 OAuth 2.0 Web client
2. 把 client id 填進 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
3. 建立 Android Maps SDK key，填進 `GOOGLE_MAPS_ANDROID_API_KEY`
4. 建立 Geocoding / Places / Directions 用 server key，填進 `EXPO_PUBLIC_GOOGLE_MAPS_SERVER_KEY`

## 開發指令

### 安裝後初次啟動

```bash
./scripts/build_install_debug.sh
```

適用情境：

- 第一次把 app 安裝到實機或模擬器
- 原生依賴有變更
- 想重新產出 debug APK

### 日常 JS / TS 開發

```bash
./scripts/start_metro.sh --tunnel -c
```

適用情境：

- 只修改畫面、互動、hook、feature logic
- 不需要重建原生 APK

### Release APK build

```bash
./scripts/build_release.sh
```

### 直接用 Expo 指令

```bash
npm run start
npm run android
npm run web
```

### 工程驗證

```bash
npm run evidence:verify
```

也可拆開執行：

```bash
npm run evidence:verify-scanner
npm run evidence:verify-routing
npm run evidence:verify-release
```
