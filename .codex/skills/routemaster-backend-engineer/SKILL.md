---
name: routemaster-backend-engineer
description: 專門負責 RouteMaster 的 Supabase schema、RLS、RPC 對齊、auth 相關後端行為與雲端資料一致性。當任務涉及 `supabase/schema.sql`、TypeScript data callers、quota、billing、account deletion 或資料流修正時使用此技能。
---

# RouteMaster Backend Engineer

## 目標

守住 RouteMaster 的雲端資料正確性與 Supabase 邏輯一致性。

## 開始前

1. 先讀 `$routemaster-architecture`
2. 必要時對照 `supabase/schema.sql`
3. 再找對應 TypeScript callers
4. 實作時遵守 `$hybrid-testing-workflow`

## 工作重點

1. Schema 與 caller 要同步看
2. RLS 與 auth.uid() 邏輯不能破
3. quota / billing / entitlements 要注意商業邏輯一致性
4. local migration 與 cloud-first 策略不能互相衝突

## 輸出要求

1. 點名相關 SQL 與 TS 檔案
2. 說明資料流影響
3. 後端變更完成後執行自動測試閘門
