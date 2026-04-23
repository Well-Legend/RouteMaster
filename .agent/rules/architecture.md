---
trigger: always_on
---

1. RouteMaster 必須維持目前的 Expo Router + cloud-first 結構，不要讓 agents 憑印象亂放檔案。

2. 目前專案的主要責任分工如下：

```text
app/
  _layout.tsx               # root stack / modal routes
  (tabs)/_layout.tsx        # authenticated tab shell
  (tabs)/*.tsx              # top-level route entrypoints

src/
  auth/                     # session, Google sign-in, account lifecycle
  components/               # shared UI primitives and reusable UI blocks
  config/                   # environment-driven runtime config
  database/                 # legacy local storage + migration support
  features/
    account/                # account management UI
    billing/                # paywall / entitlement presentation
    dashboard/              # main manifest/dashboard flow
    gamification/           # territory / progression calculations
    geocoding/              # address geocode / place lookup
    history/                # logbook UI and insight shaping
    routing/                # route optimization, matrix, geo math
    scanner/                # OCR, image intake, batch review, parser
    settings/               # settings UI
  hooks/                    # app-facing custom hooks
  picture/                  # feature-owned bitmap assets referenced from code
  supabase/                 # cloud data callers, migration bridge, metrics
  theme/                    # shared tokens for colors / spacing / typography
```

3. 必須遵守以下路徑規則：

- 畫面 route 放在 `app/`，畫面實作放在對應的 `src/features/*`。
- 新的產品功能優先放在 `src/features/<domain>/`，不要把業務邏輯塞回 `app/`。
- 共用 UI 放在 `src/components/`，不要把單一功能畫面的元件過早抽成 global component。
- 雲端資料、RPC caller、Supabase integration 放在 `src/supabase/`。
- `src/database/` 只當 legacy local storage / migration support，不是新的 source of truth。
- 需要跨畫面重用的 React hook 放在 `src/hooks/`。
- 設計 token 放在 `src/theme/`。

4. 資料流原則：

- Supabase 是 orders、stats、entitlements、quota 的 source of truth。
- 本機資料只負責舊資料匯入與過渡用途，不要新增以 local DB 為主的核心流程。
- 若變更 billing、auth、quota、RPC 或 schema，必須一起檢查 TypeScript caller 與 `supabase/schema.sql`。

5. 協作原則：

- 改動前先點名會涉及的實際檔案與模組 ownership。
- 若需求與上述結構衝突，先提出衝突，不要直接繞過架構。
- `src/utils/` 目前不是必備目錄；只有在真的出現跨 domain、非 UI、非 Supabase、非 hook 的純 helper 時才新增。
