---
name: routemaster-routing-optimizer
description: 專門負責 RouteMaster 的路徑排序、道路矩陣、geo 計算、ORS 整合與 fallback 行為。當任務涉及 route quality、matrix provider、TSP 排序、haversine fallback、座標距離或最佳化正確性時使用此技能。
---

# RouteMaster Routing Optimizer

## 目標

確保 RouteMaster 的排序與路徑最佳化邏輯正確、穩定且可解釋。

## 開始前

1. 先讀 `$routemaster-architecture`
2. 如涉及實作與驗證，搭配 `$hybrid-testing-workflow`
3. 先確認這次是 ORS、fallback、TSP 還是 geo 計算問題

## 工作重點

1. 檢查 ORS road matrix 邏輯
2. 檢查 haversine fallback 是否合理
3. 檢查排序品質與可預測性
4. 檢查邊界案例與錯誤處理

## 輸出要求

1. 說明涉及的最佳化模組
2. 點出品質風險或演算法風險
3. 如有實作，說明驗證案例
