# RouteMaster Project Map

## Product Summary

RouteMaster is a React Native + Expo delivery workflow app for:

- scanning addresses from images
- creating and reordering delivery orders
- optimizing route order
- tracking completed deliveries and daily stats
- gating optimization usage with billing and quotas

## Runtime Shape

### App shell

- `app/_layout.tsx`
  - Root stack.
  - Defines modal-style routes such as `batch-review`, `account-management`, and `paywall`.
- `app/(tabs)/_layout.tsx`
  - Auth-gated tab shell.
  - Tabs are `index`, `manifest`, `logbook`, and `settings`.

### Main screens

- `app/(tabs)/index.tsx`: dashboard entry
- `app/(tabs)/manifest.tsx`: order list / manifest
- `app/(tabs)/logbook.tsx`: history entry
- `app/(tabs)/settings.tsx`: settings entry
- `app/login.tsx`: Google sign-in screen
- `app/paywall.tsx`: billing modal

## Feature Ownership

### Auth

- `src/auth/AuthContext.tsx`
  - Owns session bootstrap, Google sign-in, sign-out, account deletion, and one-time local import.

### Orders and cloud data

- `src/hooks/useOrders.ts`
  - Main consumer-facing hook for orders.
  - Handles loading, add, complete, delete, reorder, and archive actions.
- `src/supabase/dataService.ts`
  - Main data service for orders, stats, gamification unlocks, and cloud persistence.
  - This is the primary runtime data layer.

### Scanner

- `src/features/scanner/ocrService.ts`
- `src/features/scanner/addressParser.ts`
- `src/features/scanner/BatchReviewScreen.tsx`
- `src/features/scanner/useImagePicker.ts`

### Dashboard

- `src/features/dashboard/DashboardScreen.tsx`
- `src/features/dashboard/NeoBrutalistOrderCard.tsx`
- `src/features/dashboard/SortableOrderItem.tsx`

### History

- `src/features/history/HistoryScreen.tsx`

### Routing

- `src/features/routing/roadRouteOptimizer.ts`
- `src/features/routing/roadMatrixService.ts`
- `src/features/routing/tspSolver.ts`
- `src/features/routing/directionsService.ts`

### Billing

- `src/features/billing/PaywallScreen.tsx`
- `src/features/billing/subscriptionService.ts`
- `src/features/billing/useBillingSummary.ts`
- `supabase/functions/revenuecat-webhook/index.ts`

### Settings and account

- `src/features/settings/SettingsScreen.tsx`
- `src/features/account/AccountManagementScreen.tsx`

### Gamification

- `src/features/gamification/hexGrid.ts`
- `src/features/gamification/progression.ts`
- `src/features/gamification/districtCompletion.ts`

## Data Boundaries

### Cloud-first source of truth

Supabase is the live backend for:

- `orders`
- `daily_stats`
- `user_hex_unlocks`
- `user_entitlements`
- `daily_usage_quotas`
- `billing_webhook_events`

See `supabase/schema.sql`.

### Local database status

- `src/database/` still exists.
- It is used for legacy/local storage behavior and one-time migration support.
- Current product direction in `README.md` is not offline-editable cloud sync.
- Do not treat WatermelonDB/local DB as the primary source of truth unless the task explicitly changes that strategy.

### One-time migration path

- `src/supabase/localMigration.ts`
  - Imports legacy local orders and daily stats into Supabase once per user after sign-in.
- `AuthContext` triggers that import after session creation.

## Auth Flow

1. Google Sign-In returns an `idToken`.
2. Supabase `signInWithIdToken` creates or restores the user session.
3. On first sign-in for a user, local data is imported once.
4. Account deletion calls the `delete_my_account` RPC.

## Billing State

- Billing UI exists now.
- Store purchase and restore flows are not fully wired yet.
- `src/features/billing/subscriptionService.ts` currently contains placeholder alerts for restore and monthly purchase.
- Billing summaries and optimization quota checks depend on Supabase RPCs.

## Route Optimization Rules

- Prefer ORS road matrix optimization when configured.
- Fall back to haversine / direct distance behavior when ORS is unavailable.
- Environment flag: `EXPO_PUBLIC_USE_ORS_MATRIX_OPTIMIZATION`

## Environment Dependencies

Required core values live in `.env`:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_MAPS_SERVER_KEY`
- `EXPO_PUBLIC_ORS_API_KEY`

## Native Development Constraints

- This is an Expo Dev Client app, not Expo Go.
- Native dependency changes require rebuild/install, typically via `./scripts/build_install_debug.sh`.
- Normal JS/TS iteration typically uses `./scripts/start_metro.sh --tunnel -c`.

## Architecture Notes

- `README.md` reflects the current cloud-first direction more accurately than `.agent/rules/architecture.md`.
- `.agent/rules/architecture.md` is partially outdated because the real project now includes billing, account, settings, gamification, Supabase services, and local-to-cloud migration logic.
- When in doubt, prefer the actual source tree and runtime call sites over the older rule file.
