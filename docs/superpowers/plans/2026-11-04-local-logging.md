# Local Logging Implementation Plan

**Goal:** Persist extension diagnostics locally and manage logging from Settings.

**Architecture:** Keep existing logger calls, route extension UI messages to a background manager, and store records in IndexedDB. Keep logging preferences inside userPreferences. Use alarms and startup cleanup for retention. No page data, response bodies, or unmodified request headers are logged. User explicitly requested NO redaction: preserve URLs and changed header values.

**Approved behavior:** Levels are info, warning, error; save error only by default. Retain 30 days by default, with 1/7/30/90/365 day choices. Export JSON filtered by intersecting local date range and levels. Clear all with confirmation. Proxy records include source URL, target URL, rule name, and only changed request headers with original values.

## Tasks

- [x] Write failing tests for preference normalization, serialization, IndexedDB operations and manager filtering/cleanup.
- [x] Implement pure log model, indexed storage and serialized background manager. Database failures never interrupt proxying.
- [x] Wire shared logger, extension messages, startup/alarm cleanup and proxy operations. Test actual redirect and request-header logging independently of page notifications.
- [x] Add Settings tabs preserving configuration transfer, plus logging settings/export/clear controls.
- [x] Verify focused/full tests, types, lint, production build and self-review scoped diff.

## Verification

- `npm test`: 29 files, 188 tests passed.
- `npm run test:typecheck`, `npm run lint:check`, `git diff --check`: passed.
- `npm run build`: passed; existing eval and large-chunk warnings remain.
- Independent temporary Chromium profile loaded the production extension. Verified default levels, settings persistence, raw header values, empty/filtered JSON exports, retention shortening, clear confirmation/cancellation, configuration tab and 800x600/390px modal bounds. No page errors. No personal browser profile was opened or modified.
- Native IndexedDB cursor exports currently assemble matching records in memory; exceptionally large exports may require future paginated delivery. No new runtime dependency; fake-indexeddb is test-only.

## Review Focus

- Preserve original URLs and header values (no redaction); exclude scripts, response/request bodies or whole configurations and safely serialize nested/cyclic objects and errors.
- Changing preferences must preserve all unrelated preferences and immediately apply retention.
- IndexedDB transaction completion, not only request success, determines persistence success.
- Date end includes the selected local day; export excludes later writes and expired records.
- Native redirect observation must not claim success before the matching redirected request completes.
- No automatic commit, push, archive generation or browser profile manipulation.
