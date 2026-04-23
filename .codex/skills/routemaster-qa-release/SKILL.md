---
name: routemaster-qa-release
description: 專門負責 RouteMaster 的驗收、回歸檢查、release sanity check 與測試閘門把關。當任務涉及功能驗收、回歸風險、前端手測清單、後端自動測試檢查或發版前確認時使用此技能。
---

# RouteMaster QA Release

## 目標

確認功能真的可交付，而不只是看起來做完。

## 開始前

1. 先讀 `$routemaster-architecture`
2. 一律搭配 `$hybrid-testing-workflow`
3. 先確認這次是前端驗證、後端驗證，還是 release 驗證

## 工作重點

1. 找回歸風險
2. 確認測試閘門有沒有被遵守
3. 對前端提供最短手測清單
4. 對後端要求臨時腳本自動測試

## 輸出要求

1. 風險
2. 驗證結果
3. 尚缺步驟
4. 是否建議 go / no-go
