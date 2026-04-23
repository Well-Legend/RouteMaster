---
name: routemaster-architecture
description: Ground RouteMaster work in the current project structure, data flow, and implementation constraints. Use when tasks involve RouteMaster architecture, file discovery, feature ownership, Supabase schema or data flow, auth, billing, routing, scanner, dashboard, history, settings, or when Codex needs project-specific context before editing.
---

# RouteMaster Architecture

## Overview

Use this skill to orient RouteMaster tasks before making changes. Read the project map in `references/project-map.md` when you need the current module layout, data boundaries, entrypoints, or implementation constraints.

## Start Here

1. Read `README.md` for product purpose, setup, and run commands.
2. Read `references/project-map.md` for the current architecture and file entrypoints.
3. Verify the target feature area before editing files.

## Working Rules

1. Treat RouteMaster as a cloud-first app. Supabase is the source of truth for orders, stats, entitlements, and quotas.
2. Treat `src/database/` as legacy local storage plus migration support, not the primary runtime backend.
3. Preserve the current app shell:
   - `app/_layout.tsx` owns the root stack and modal routes.
   - `app/(tabs)/_layout.tsx` owns authenticated tab navigation.
4. Keep feature logic inside `src/features/<domain>/` whenever possible.
5. Use shared hooks and services before adding new cross-cutting abstractions.
6. When work touches billing, auth, or Supabase RPCs, verify both the TypeScript caller and `supabase/schema.sql`.

## Task Routing

### UI and navigation

- Start from `app/` route files.
- Then inspect the corresponding screen in `src/features/`.

### Orders and dashboard flow

- Start from `src/hooks/useOrders.ts`.
- Follow into `src/supabase/dataService.ts`.
- Inspect dashboard UI in `src/features/dashboard/`.

### Scanner and batch review

- Start from `src/features/scanner/`.
- Check OCR, parser, and review screen before changing ingestion behavior.

### Routing and optimization

- Start from `src/features/routing/`.
- Confirm whether the change affects ORS road-matrix behavior, haversine fallback, or TSP ordering.

### Auth and account management

- Start from `src/auth/AuthContext.tsx`.
- Check `src/supabase/localMigration.ts` when changing login or first-run migration behavior.

### Billing and quotas

- Start from `src/features/billing/`.
- Confirm related schema and RPC expectations in `supabase/schema.sql`.

## Output Expectations

1. Name the specific RouteMaster files and modules involved in the task.
2. Call out cloud-vs-local implications when data flow changes.
3. Surface architectural conflicts early if a request bypasses existing feature boundaries or Supabase rules.

## Reference

- Read `references/project-map.md` for the current project map, data flow, and business constraints.
