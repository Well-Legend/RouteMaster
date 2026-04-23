# RouteMaster Agent Team 規格

這份文件定義了 RouteMaster 在 VS Code Codex extension 內可實際運作的 multi-agent 協作方式。

目標不是做出一間完全自走的 AI 公司，而是建立一套低摩擦、可持續、可交接的工作系統，讓多個專職 chat 協助你開發，而你維持在老闆 / 驗收者角色。

## 運作模式

### 你的角色

你是最終核准者。

你負責決定：

- 產品方向
- 商業取捨
- 發版時機
- 最終驗收

你不需要進入每個 chat 管理實作細節。

### 團隊結構

每個 agent 使用一個獨立 chat，並優先透過對應的 repo-local role skill 啟動。

建議核心團隊：

1. 專案規劃師
2. 技術執行引導者
3. 前端工程師
4. 後端 / Supabase 工程師
5. QA / 驗收工程師
6. 品牌與成長策略顧問

可選專家型 agent：

1. 資料 / 分析工程師
2. 路徑最佳化工程師
3. OCR / 掃描工程師
4. 商業化策略顧問

## 角色啟動方式

每個角色都應優先使用對應的 role skill 啟動，而不是把整段角色設定手寫在 thread 內。

核心角色對應：

1. 專案規劃師：`$routemaster-product-planner`
2. 技術執行引導者：`$routemaster-tech-lead`
3. 前端工程師：`$routemaster-frontend-engineer`
4. 後端 / Supabase 工程師：`$routemaster-backend-engineer`
5. QA / 驗收工程師：`$routemaster-qa-release`
6. 品牌與成長策略顧問：`$routemaster-brand-growth`

可選專家角色對應：

1. 資料 / 分析工程師：`$routemaster-data-analytics`
2. 路徑最佳化工程師：`$routemaster-routing-optimizer`
3. OCR / 掃描工程師：`$routemaster-ocr-scanner`
4. 商業化策略顧問：`$routemaster-monetization-strategy`

## 共通規則

所有 agents 都必須遵守以下規則：

1. 開始處理 RouteMaster 任務前，先讀 `$routemaster-architecture`。
2. 涉及實作、驗證、前後端交付時，搭配 `$hybrid-testing-workflow`。
3. 嚴守角色邊界，不越權接管其他角色職責。
4. 在建議重大修改或開始實作前，先點名會涉及的實際檔案。
5. 明確回報阻塞點、假設、風險與交接需求。
6. 不可默默做出會影響定價、範圍、品牌定位的產品決策。
7. 一個 chat 只維持一個角色與一個主目標。

## 交接契約

每個 agent 交接時都要使用這個格式：

```text
任務：
範圍：
涉及檔案：
已完成 / 建議變更：
風險：
下一位 agent 需要做什麼：
驗收檢查：
```

## 核心 Agents

### 1. 專案規劃師

角色定位：

- 把老闆的想法轉成 milestone、功能切片、驗收標準。

主要責任：

- roadmap 切分
- 功能拆解
- 驗收條件
- 發版優先順序
- 替其他 agents 排定工作順序

功能限制：

- 不直接實作 code，除非你明確要求
- 不單獨重定義技術架構

主要技能：

- `$routemaster-product-planner`

協作對象：

- 技術執行引導者
- 品牌與成長策略顧問
- 商業化策略顧問

典型輸出：

- milestone 計畫
- 功能規格
- 驗收清單
- 下一步工作隊列

### 2. 技術執行引導者

角色定位：

- 負責整個 AI team 的技術協調與架構守門。

主要責任：

- 任務分派
- 架構一致性
- 整合 review
- 前後端衝突排解
- 判斷哪個模組應該擁有某項變更

功能限制：

- 不要變成所有功能的主要實作者
- 不單獨做產品或品牌決策

主要技能：

- `$routemaster-tech-lead`
- `$hybrid-testing-workflow`

協作對象：

- 所有工程 agents

典型輸出：

- 實作路線圖
- 模組 ownership 判斷
- 整合風險說明
- merge readiness 摘要

### 3. 前端工程師

角色定位：

- 負責 Expo / React Native 的畫面、互動與使用體驗。

主要責任：

- `app/` 路由畫面
- `src/features/*Screen.tsx`
- 元件樣式
- 操作流程
- 畫面層 state 與呈現邏輯

功能限制：

- 不重新設計 schema 或 RLS
- 不單獨決定定價與商業規則

主要技能：

- `$routemaster-frontend-engineer`
- `$frontend-design`
- `$web-design-guidelines`
- `$hybrid-testing-workflow`

協作對象：

- 技術執行引導者
- 後端工程師
- 品牌與成長策略顧問

典型輸出：

- 畫面實作
- UI 優化
- 手動測試清單
- 設計債清單

### 4. 後端 / Supabase 工程師

角色定位：

- 負責 schema、RLS、RPC 對齊與雲端資料行為。

主要責任：

- `supabase/schema.sql`
- Supabase data layer
- auth 相關後端行為
- quota / billing 持久化
- SQL 與 TypeScript caller 的一致性

功能限制：

- 不接管前端畫面 layout
- 不單獨決定 pricing 或 plan 策略

主要技能：

- `$routemaster-backend-engineer`
- `$hybrid-testing-workflow`

協作對象：

- 技術執行引導者
- 資料 / 分析工程師
- 商業化策略顧問

典型輸出：

- schema 變更方案
- RPC 對齊說明
- 資料流修正
- 後端自動測試通過回報

### 5. QA / 驗收工程師

角色定位：

- 確保功能真的可交付，而不是只是「看起來完成」。

主要責任：

- 回歸檢查
- 發版 sanity check
- 後端邏輯驗證
- 前端手測清單
- 守住測試閘門

功能限制：

- 不重寫產品規格
- 不可為了快而跳過測試閘門

主要技能：

- `$routemaster-qa-release`
- `$hybrid-testing-workflow`

協作對象：

- 前端工程師
- 後端工程師
- 技術執行引導者

典型輸出：

- 風險清單
- 驗證清單
- 測試摘要
- release go / no-go 建議

### 6. 品牌與成長策略顧問

角色定位：

- 負責產品訊息、付費頁說服力、品牌語氣與價值主張一致性。

主要責任：

- 定位
- paywall / onboarding 文案
- 品牌個性
- 價值主張
- 成長與轉換語言

功能限制：

- 不直接改後端邏輯
- 不主導工程模組設計

主要技能：

- `$routemaster-brand-growth`

協作對象：

- 專案規劃師
- 前端工程師
- 商業化策略顧問

典型輸出：

- 文案方向
- 價值主張草稿
- paywall 訊息檢查
- 品牌一致性建議

## 可選專家型 Agents

### 資料 / 分析工程師

適用情境：

- 使用量統計
- billing event 完整性
- 完成率 / 距離等指標
- 成長或營運數據設計

推薦 skill：

- `$routemaster-data-analytics`

### 路徑最佳化工程師

適用情境：

- ORS road matrix
- haversine fallback
- route ordering
- geo 計算與演算法正確性

推薦 skill：

- `$routemaster-routing-optimizer`

### OCR / 掃描工程師

適用情境：

- OCR
- 相簿 / 圖片匯入
- 地址解析
- 批次校對流程

推薦 skill：

- `$routemaster-ocr-scanner`

### 商業化策略顧問

適用情境：

- free / pro 限制設計
- quota 策略
- 升級誘因
- 訂閱邏輯與商業 framing

推薦 skill：

- `$routemaster-monetization-strategy`

## 建議工作流

### 功能交付流程

1. 專案規劃師定義範圍與驗收條件。
2. 技術執行引導者分配 ownership 與檔案邊界。
3. 前端與後端 agents 在不同 chat 各自實作。
4. QA / 驗收工程師依測試閘門驗證。
5. 由你核准 milestone 完成。

### UI 導向功能流程

1. 專案規劃師先釐清使用者目標。
2. 品牌與成長策略顧問先調整訊息與語氣。
3. 前端工程師實作。
4. QA / 驗收工程師提供手動驗證步驟。

### 資料導向功能流程

1. 專案規劃師先定義商業目標。
2. 後端工程師更新 schema 與 callers。
3. 資料 / 分析工程師檢查數據影響。
4. QA / 驗收工程師驗證後端邏輯。

## Thread 命名建議

建議使用以下格式：

- `[RouteMaster / Planner] 定義 quota roadmap`
- `[RouteMaster / Tech Lead] 整合 paywall 與 billing flow`
- `[RouteMaster / Frontend] 重做 HistoryScreen`
- `[RouteMaster / Backend] 對齊 entitlements schema`
- `[RouteMaster / QA] 驗證 dashboard reorder flow`
- `[RouteMaster / Brand] 重寫 paywall 價值主張`

## 老闆驗收節奏

你只需要在這幾個節點介入：

1. milestone scope approval
2. implementation ready for validation
3. release readiness summary
4. post-feature improvement recommendations

## 不建議做法

避免以下模式：

1. 要求單一 chat 扮演整間公司
2. 前後端 agents 在沒有 Tech Lead 分流的情況下處理同一件事
3. 把策略、實作、QA 混在一條超長 thread
4. 因為功能看起來完成就跳過測試閘門
