# RouteMaster Agent Thread Prompts

這份文件已切換為「角色 skill 優先引用」版本。

使用方式：

1. 為每個 agent 開一個新的 VS Code Codex chat
2. 先貼上該角色的專用 skill
3. 再按任務補上其他必要 skills
4. 最後填入目前任務

## 核心角色

### 專案規劃師

```text
$routemaster-product-planner

目前任務：
[在這裡描述需求]
```

### 技術執行引導者

```text
$routemaster-tech-lead
$hybrid-testing-workflow

目前任務：
[在這裡描述整合、ownership 或技術規劃問題]
```

### 前端工程師

```text
$routemaster-frontend-engineer
$hybrid-testing-workflow

目前任務：
[在這裡描述畫面、互動流程或 UI 重構]
```

如需更強設計輸出，可改用：

```text
$routemaster-frontend-engineer
$frontend-design
$web-design-guidelines
$hybrid-testing-workflow

目前任務：
[在這裡描述畫面、互動流程或 UI 重構]
```

### 後端 / Supabase 工程師

```text
$routemaster-backend-engineer
$hybrid-testing-workflow

目前任務：
[在這裡描述 schema、RLS、RPC、quota 或 data flow 任務]
```

### QA / 驗收工程師

```text
$routemaster-qa-release
$hybrid-testing-workflow

目前任務：
[在這裡描述功能驗收、release candidate 或回歸檢查]
```

### 品牌與成長策略顧問

```text
$routemaster-brand-growth

目前任務：
[在這裡描述定位、文案、paywall 或 onboarding 問題]
```

## 可選專家角色

### 資料 / 分析工程師

```text
$routemaster-data-analytics
$hybrid-testing-workflow

目前任務：
[在這裡描述 stats、usage、metrics 或 event quality 問題]
```

### 路徑最佳化工程師

```text
$routemaster-routing-optimizer
$hybrid-testing-workflow

目前任務：
[在這裡描述 routing、matrix、geo 或排序品質問題]
```

### OCR / 掃描工程師

```text
$routemaster-ocr-scanner
$hybrid-testing-workflow

目前任務：
[在這裡描述掃描、OCR、地址解析或 batch review 問題]
```

### 商業化策略顧問

```text
$routemaster-monetization-strategy

目前任務：
[在這裡描述價格、quota、free/pro 結構或升級策略]
```

## 建議技能組合

### 純規劃

```text
$routemaster-product-planner

目前任務：
[需求]
```

### 前端功能

```text
$routemaster-tech-lead
$routemaster-frontend-engineer
$hybrid-testing-workflow

目前任務：
[需求]
```

### 前端高設計要求

```text
$routemaster-frontend-engineer
$frontend-design
$web-design-guidelines
$hybrid-testing-workflow

目前任務：
[需求]
```

### 後端功能

```text
$routemaster-tech-lead
$routemaster-backend-engineer
$hybrid-testing-workflow

目前任務：
[需求]
```

### Paywall / 商業化

```text
$routemaster-brand-growth
$routemaster-monetization-strategy
$routemaster-frontend-engineer
$routemaster-backend-engineer
$hybrid-testing-workflow

目前任務：
[需求]
```

## 交接建議

每一輪工作結束後，請要求 agent 依 [agent-handoff-template.md](/home/well/RouteMaster/docs/agent-handoff-template.md) 交接。
