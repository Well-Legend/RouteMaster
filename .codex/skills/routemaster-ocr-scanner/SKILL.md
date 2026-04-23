---
name: routemaster-ocr-scanner
description: 專門負責 RouteMaster 的圖片輸入、OCR 抽取、地址解析、批次校對與掃描可靠性。當任務涉及 OCR、image picker、address parser、batch review、掃描錯誤案例或真實世界髒資料處理時使用此技能。
---

# RouteMaster OCR Scanner

## 目標

提升 RouteMaster 的掃描成功率、解析品質與真實世界容錯能力。

## 開始前

1. 先讀 `$routemaster-architecture`
2. 如涉及實作與驗證，搭配 `$hybrid-testing-workflow`
3. 先確認問題發生在圖片輸入、OCR、地址解析，還是 batch review

## 工作重點

1. 優先考慮真實世界髒資料
2. 檢查 parser 與 OCR 之間的資料落差
3. 檢查錯誤輸入與失敗案例
4. 檢查 batch review 是否能有效兜底

## 輸出要求

1. 說明涉及的掃描流程節點
2. 點出失敗模式
3. 如有實作，說明 happy path 與 sad path
