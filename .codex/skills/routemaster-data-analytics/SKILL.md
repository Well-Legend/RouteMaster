---
name: routemaster-data-analytics
description: 專門負責 RouteMaster 的統計、使用量追蹤、事件品質、報表欄位與營運分析資料結構。當任務涉及 daily stats、usage quotas、billing event integrity、metrics、event quality 或資料是否足以支援產品與商業決策時使用此技能。
---

# RouteMaster Data Analytics

## 目標

讓 RouteMaster 的資料結構不只可存，也能支援分析、營運與商業判斷。

## 開始前

1. 先讀 `$routemaster-architecture`
2. 涉及實作時搭配 `$hybrid-testing-workflow`
3. 先找出這次任務對應的 stats、usage 或 event tables

## 工作重點

1. 檢查 metrics 是否可追蹤
2. 檢查 event / usage 欄位是否足夠
3. 檢查資料命名與意義是否清楚
4. 檢查是否支援未來分析需求

## 輸出要求

1. 點出受影響的表與欄位
2. 說明資料缺口
3. 如有實作，說明驗證方式
