# iOS Transit Widget Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate bus/subway alert lists and let the user select saved routes for an iOS home-screen widget.
**Architecture:** Reuse existing Query lists and editor state. Store widget selection IDs locally; sync a credential-free configuration into an App Group using a local Expo module. A WidgetKit extension fetches existing public arrival endpoints while the app is closed.
**Tech Stack:** Expo SDK 57, Expo Router, Zustand, TanStack Query, SwiftUI/WidgetKit.
**Spec:** User approved iOS first; number/line, direction and arrival time; Android deferred.

## Global Constraints
- Preserve existing edits and notification behavior. No commits, deployment or repository test additions.
- Existing white/blue theme; selected controls retain fixed geometry.
- Widget updates are scheduled by iOS, not continuous polling. Expired arrivals must never appear current.
- No device credentials or private API keys in the shared widget configuration.

## Review Focus
- Empty/deleted selections and temporary API failures must not display invented arrivals.
- Opposite directions, station sequence and subway destination filters must remain distinct.
- App Group, extension embed/signing and build version must survive repeated config plugin runs.
- An older dev client without the module must still start and show a rebuild explanation.
- iOS reload limits and elapsed ETA must be represented honestly.

### Task 1: Alert lists
- [x] Add a reusable fixed-layout bus/subway selector.
- [x] Filter alerts by selected transport and preserve that transport when creating; per-list empty state.
- [x] Verify TypeScript and targeted lint.

### Task 2: Widget selection and route
- [x] Add widgets tab route and selection screen backed by existing Query hooks.
- [x] Persist up to four selected alert IDs per API scope; show native build and OS refresh guidance.
- [x] Sync selected route metadata from Query results to native shared configuration; keep stale/deleted entries safe.

### Task 3: iOS extension
- [x] Add local Expo bridge with atomic App Group writes and reloadTimelines.
- [x] Add WidgetKit provider/view using public arrivals, proper direction filtering, timeout/error/empty states, and stale timeline entries.
- [x] Add idempotent Expo plugin for app/extension entitlements, source target, EAS metadata and matching host build versions.
- [x] Integrate into the existing iOS project without regenerating unrelated native files.

### Verification
- [x] TypeScript, lint, Swift simulator type-check/build and plugin idempotence assertions.
- [x] Review only this task's changed files against pre-edit copies.
- [x] Document device/TestFlight checks not run; no claim of an actual uploaded build.

## Verification results
- App TypeScript and full src ESLint: passed.
- iOS production JS export: passed.
- Swift widget simulator typecheck and full arm64 simulator app+extension build: passed.
- Temporary checks for plugin idempotence, selection metadata/storage failure behavior and subway incoming/null ETA filtering: passed.
- Fixed review finding: preserve entering/arrived subway states even with null ETA.
- Fixed integration module name collision by naming the Pod TaraGoWidgetBridge.
- Repaired generated RN Debug cache using the official script after symbol comparison proved a Release binary was installed with no configuration marker. No React Native source or architecture settings changed.
- Physical device, App Group provisioning, signed Archive and TestFlight execution remain unverified; no upload/deploy was performed.

## User revision — independent compact widgets

The user replaced saved-alert selection with direct widget-only targets. Added widget-add route: bus stop search → route/direction and subway station → line/direction/destination. SQLite stores at most six direct target configurations with no alert ID or dependency. Widget list has title and compact live rows only. Small WidgetKit view renders three one-line rows; medium renders two columns with three rows each. TypeScript, full src lint, temporary store behavior assertions, iOS production export and app/extension integration build passed. Real-device visual/playback checks remain unverified.
