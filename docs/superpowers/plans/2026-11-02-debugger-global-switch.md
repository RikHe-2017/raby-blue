# Debugger Cancellation and Global Switch Implementation Plan

> Execution: implement in this session without subagents or automatic commits.

**Goal:** Closing Chrome's debugging banner turns off the existing global proxy switch; one explicit enable resumes proxying. Preserve all rule selections and remove the red error badge.

**Architecture:** The debugger driver emits a cancellation callback once per connection batch. The background persists global disable through the same serialized configuration writer used by popup saves. Storage changes drive both proxy cleanup and popup switch synchronization; the driver retains only a transient cancellation guard for in-flight work.

**Tech Stack:** Existing TypeScript, Vue/Pinia, Chrome APIs and Vitest; no new dependencies.

**Spec:** User-approved design in this conversation: global disable on banner cancellation, preserve individual selections, synchronize open popup, remove red badge, no automatic reconnection.

## Constraints

- `proxyConfig.enabled` remains the sole persisted global enable state.
- User cancellation disables; closing a tab does not.
- Repeated cancellation events must not produce repeated writes or connection attempts.
- Pending automatic saves must not re-enable a disabled proxy. Only an explicit toggle may change the global enable state.
- Do not change storage schemas, unrelated preferences or in-progress editor contents.
- Keep actual proxy errors logged; do not display a red badge.
- Leave the user's pending README-MY.md edits untouched.

## TODO

### 1. Cancellation Signal and Badge

- [x] Update existing Vitest cancellation scenarios to assert one callback, no callback on ordinary tab close, and restart from persisted global configuration.
- [x] Confirm callback assertions fail before changing production code.
- [x] Pass the callback through ResponseProxy; remove the separate persisted pause flag while retaining transient in-flight guards.
- [x] Remove red badge writes and retain clearing of badges left by older builds.

Files: `src/document-response.ts`, `src/proxy/ResponseProxy.ts`, `src/debugger-cancellation.test.ts`, `src/response-connection.test.ts`.

### 2. Serialized Source Configuration Writes

- [x] Test immutable disable, duplicate disable, pending saves, explicit re-enable and failure recovery with Vitest.
- [x] Add a background-owned writer that serializes saves and disable operations. Ordinary saves preserve the latest persisted global switch; explicit toggles update it.
- [x] Wire cancellation to disable and popup save messages to this writer. Existing storage change handling performs cleanup of both strategies.

Files: `src/proxy/config-persistence.ts`, its Vitest suite, `src/background.ts`.

### 3. Popup Synchronization and Verification

- [x] Test source switch changes, pending popup saves and store disposal with Vitest.
- [x] Send extension configuration saves through the background writer; keep standalone storage fallback.
- [x] Subscribe once per Pinia store to source switch changes, without replacing rule/editor data. Remove the listener on disposal.
- [x] Run `npm test`, `npm run test:typecheck`, `npm run lint:check`, targeted Prettier, `npm run build` and `git diff --check`.

Files: `src/stores/proxy.ts`, its Vitest suite.

## Review Focus

- Cancellation during attach must stop the remaining batch without deadlocking the manager queue.
- Disabling must clean up native redirects as well as debugger sessions.
- Multiple tab detach events must produce one cancellation intent.
- A queued save must preserve disabled state; a subsequent explicit toggle must restore it.
- Already-open popup changes must not overwrite ongoing name/header edits.

## Verification Record

- Cancellation callback assertion observed failing before implementation; passed after wiring.
- Explicit-enable failure regression observed failing before rollback; passed after restoring only the persisted switch.
- Full suite: 16 files, 108 tests passing.
- Type check, ESLint, targeted Prettier, production build and whitespace check passed.
- Production build retains existing eval and large-chunk warnings.
- Real Chrome banner-click verification was not performed in this run.
- No commits or additional dependencies; user README-MY.md edits left untouched.
