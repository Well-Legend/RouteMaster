# RouteMaster

RouteMaster is an Android route-planning project built through a Multi-Agent collaborative development model. It is designed for delivery drivers, logistics couriers, and anyone who needs to handle multi-stop tasks. It consolidates a previously fragmented workflow of "reading addresses from images, manually sorting stops, switching to map navigation, and reviewing results afterward" into a single usable flow:

`Scan or import addresses -> Batch review -> One-tap optimization -> Navigate -> Complete deliveries -> Review history`

## App Overview

RouteMaster is not only a delivery route-planning app, but also a demonstration of how a Multi-Agent collaborative development model can be applied to a real, working product.  
The app's core capabilities currently include:

- OCR scanning of addresses from images, with address parsing
- Batch review of delivery orders to avoid directly polluting the route
- Multi-stop route optimization based on a road matrix
- One-tap launch into Google Maps navigation
- Reviewing history results and statistics after deliveries are completed
- Using Supabase for account isolation and cloud sync

The current public version of this repo is Android-focused, and the iOS version has not been developed yet.

## Director-MAS (Multi-Agent System)

This project intentionally adopts a Multi-Agent collaborative development model:  
AI agents are split into a small team with clear role ownership, responsible for planning, implementation, validation, and handoff, while I mainly handle direction, tradeoffs, and final acceptance.
Its purpose is to demonstrate how Multi-Agent collaboration can carry a product all the way from requirement breakdown, feature implementation, and validation to final delivery.

Development flow:

1. First, lock down project boundaries with architecture rules, so agents do not modify directories or data flow based on assumptions.
2. Then, start the corresponding agents with different role skills, such as frontend, backend, OCR, routing, QA, and tech lead.
3. Each agent only handles its own workstream and reports completed work, risks, and the next handoff target through the handoff template.
4. Finally, I make the product decisions, perform acceptance, and drive final convergence.

The core documents of this workflow are all kept inside the repo:

- Architecture rule: [.agent/rules/architecture.md](/home/well/RouteMaster/.agent/rules/architecture.md)
- Agent team spec: [docs/agent-team-spec.md](/home/well/RouteMaster/docs/agent-team-spec.md)
- Agent thread prompts: [docs/agent-thread-prompts.md](/home/well/RouteMaster/docs/agent-thread-prompts.md)
- Agent handoff template: [docs/agent-handoff-template.md](/home/well/RouteMaster/docs/agent-handoff-template.md)
- Role skills: `.codex/skills/*`

## Tech Stack

### App / Frontend

- React Native
- Expo SDK 54
- Expo Router
- TypeScript
- React Native Maps
- Expo Camera / Image Picker / Location

### Backend / Data

- Supabase Auth
- Supabase Postgres
- RLS
- OpenRouteService Matrix
- Google Maps Geocoding / Places / Navigation capabilities

### AI / Development Workflow

- Codex multi-agent workflow
- repo-local architecture rule
- role-based skills
- executable evidence scripts

## System Architecture

The project uses an `Expo Router + feature modules + Supabase cloud-first` structure.

```text
app/
  _layout.tsx               # root stack / modal routes
  (tabs)/_layout.tsx        # authenticated tab shell
  (tabs)/*.tsx              # route entrypoints

src/
  auth/                     # session, Google sign-in, account lifecycle
  components/               # shared UI primitives
  config/                   # env-driven runtime config
  database/                 # legacy local storage / migration support
  features/
    account/                # account management
    billing/                # paywall / entitlement UI
    dashboard/              # main delivery flow
    gamification/           # territory / progression logic
    geocoding/              # geocode / place lookup
    history/                # history and insights
    routing/                # matrix, optimization, geo math
    scanner/                # OCR, parser, batch review
    settings/               # settings UI
  hooks/                    # reusable app-facing hooks
  picture/                  # feature-owned bitmap assets
  supabase/                 # cloud data callers and migration bridge
  theme/                    # shared design tokens

android/                    # committed Android native project
supabase/                   # schema and edge function code
scripts/                    # build / Metro / evidence scripts
```


## Initial Setup

### 1. Requirements

- Node.js 20 or above
- npm
- Java 17
- Android SDK
- adb

### 2. Install dependencies

```bash
npm install
```

### 3. Set environment variables

Copy `.env.example` to `.env` and fill in at least the following fields:

```bash
GOOGLE_MAPS_ANDROID_API_KEY=your_ANDROID_GOOGLE_MAPS_API_KEY
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_SUPABASE_ANON_KEY
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_MAPS_SERVER_KEY=your_SERVER_API_KEY
EXPO_PUBLIC_ORS_API_KEY=your_ORS_API_KEY
```




### 4. Initialize Supabase

1. Create a Supabase project
2. Enable Google under Authentication
3. Run [supabase/schema.sql](/home/well/RouteMaster/supabase/schema.sql)
4. Fill the corresponding Supabase URL / anon key into `.env`

### 5. Initialize Google OAuth / Maps

1. Create an OAuth 2.0 Web client in Google Cloud Console
2. Put the client id into `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
3. Create an Android Maps SDK key and put it into `GOOGLE_MAPS_ANDROID_API_KEY`
4. Create a server key for Geocoding / Places / Directions and put it into `EXPO_PUBLIC_GOOGLE_MAPS_SERVER_KEY`

## Development Commands

### First launch after setup

```bash
./scripts/build_install_debug.sh
```

Use when:

- Installing the app onto a real device or emulator for the first time
- Native dependencies have changed
- You want to regenerate the debug APK

### Daily JS / TS development

```bash
./scripts/start_metro.sh --tunnel -c
```

Use when:

- You only changed screens, interactions, hooks, or feature logic
- You do not need to rebuild the native APK

### Release APK build

```bash
./scripts/build_release.sh
```

### Use Expo commands directly

```bash
npm run start
npm run android
npm run web
```

### Engineering evidence

```bash
npm run evidence:verify
```

You can also run them separately:

```bash
npm run evidence:verify-scanner
npm run evidence:verify-routing
npm run evidence:verify-release
```
