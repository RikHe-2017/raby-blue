# Proxy Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Work is performed by the primary agent; no subagents or commits without user authorization.

**Goal:** Add independent request-header and response-header settings to each proxy rule without changing the existing document-response/other-resource-redirect policy.

**Architecture:** Store optional header arrays on the canonical ProxyRule. Reuse one controlled Element Plus editor for both sections. Validate and apply headers through shared pure functions, with strategy-specific network adapters and no additional persisted configuration source.

**Tech Stack:** Vue 3, TypeScript, Pinia, Element Plus, Chrome DNR/CDP, Node test runner, existing isolated Chrome/Playwright integration harness.

**Spec:** User-approved design in this conversation, 2026-10-30: four stacked right-hand sections; per-row checkbox/name/value/delete; autocomplete names; 500ms valid-input autosave; set semantics only; settings travel with proxy imports/exports/copies; no global header settings.

## Global Constraints

- Keep the existing source rule tree and proxyConfig storage key; absent header arrays mean no overrides.
- Preserve the default request-type policy and existing URL matching behavior.
- Header names are case-insensitive. Setting a header replaces existing occurrences; removing an editor row removes the override, not the original network header.
- Row values may be empty. Reject invalid names, CR/LF injection, duplicate names and unsupported browser-controlled headers with visible errors.
- Do not prefill CORS or credentials. Do not promise that headers bypass local-network/security-context checks.
- Do not mutate incoming rules, arrays or header tuples. Use flex, existing components and theme variables; no new dependencies, SCSS nesting or CSS Grid.
- Save status means persisted successfully, not necessarily applied successfully by Chrome. Surface runtime application errors separately.
- Do not create archives, alter browser security settings, push or commit as part of implementation.

## Review Focus

- Direct target traffic and two source rules sharing a target must not silently inherit the wrong headers.
- Rapid typing, switching rules and storage failures must not mark unsaved data as saved or apply another rule's draft.
- Credential headers must not leak to unrelated redirects or third-party downstream destinations.
- Case variants, empty values, disabled rows and malformed imported arrays must behave consistently in both strategies.
- Copies, deletion, disabling and import/export must preserve or remove headers with their owning rule and leave no stale DNR rules.

## Task 1: Verify Network Application Boundaries

**Files:** `scripts/test-document-response.mjs`, new `scripts/test-proxy-headers.mjs` if separating fixtures makes the scenarios clearer.

**Interfaces:** Consumes the built extension and canonical proxyConfig; produces an isolated integration scenario with source/target servers recording actual request headers and the page observing response headers.

- [x] Add failing integration cases for a document replacement and a redirected script/API: a custom request header reaches the target, and a custom response header reaches the browser; original response headers remain otherwise intact.
- [x] Test a direct target request, an unrelated initiating origin, two different source prefixes sharing a target, and a downstream cross-origin redirect; assert no cross-rule credential/header leakage.
- [x] Verify request attribution using Network request IDs and actual DNR redirect events. Target-URL-only DNR rules are not used.
- [x] Exact header scope is enforced with CDP metadata rather than broadened target conditions; resource requests remain native redirects. See execution-ledger rulings.

## Task 2: Source Model and Pure Header Operations

**Files:** `src/types/proxy.ts`, new `src/proxy/header-settings.ts`, new `src/proxy/header-settings.test.mjs`, `src/stores/proxy-rules.ts`, `src/components/config-transfer/transfer.ts`, existing transfer/store tests.

**Interfaces:** HeaderSetting has `id: string`, `enabled: boolean`, `name: string`, `value: string`; ProxyRule gains optional `requestHeaders` and `responseHeaders`. Shared functions validate arrays and return new merged header tuples without changing inputs.

- [x] Write failing tests for absent arrays, enabled/disabled rows, case-insensitive replacement, preserved unrelated duplicates, empty values and input immutability.
- [x] Write failing tests rejecting duplicate IDs/names, invalid token names, CR/LF, malformed imports and browser-controlled headers unsupported by either strategy.
- [x] Implement validation and merge helpers. Reject unsupported configured headers rather than silently discarding them.
- [x] Extend ProxyRuleChanges and import validation without reconstructing or dropping unrelated rule fields. Preserve the existing backup format and merge semantics.
- [x] Test export/import round trips, same-name local-rule preservation and independent copied arrays. Extend rule duplication in `use-proxy-node-actions.ts` to retain header settings with independent row IDs.
- [x] Run the new unit tests and existing transfer/store tests.

## Task 3: Apply Headers Through Both Strategies

**Files:** `src/document-response-rules.ts`, `src/document-response.ts`, `src/proxy/request-policy.ts`, `src/proxy/RedirectProxy.ts`, `src/proxy/ProxyManager.ts`, existing response/strategy tests.

**Interfaces:** Response matching returns the owning rule together with the resolved target; `findResponseTarget` remains compatible. Network IDs tie native redirects to request/response header edits without generating broad target header rules.

- [x] Add failing tests that matched rules apply only their own overrides, preserve rule order and do not affect unmatched traffic.
- [x] Merge request overrides after existing request-header sanitization; preserve protected-header restrictions. Merge response overrides before fulfillment, then maintain transport-header cleanup for decoded bodies.
- [x] Retain immutable redirect-owner snapshots for in-flight responses; configuration changes abort pending replacement fetches when necessary.
- [x] Give redirect rules deterministic IDs and priorities consistent with source-rule order. Use request-scoped CDP header edits, not persistent header DNR rules.
- [x] Test disabled rows, configuration changes, override removal, failed application and disposal. No stale header rules survive disabling/deleting the owner.
- [x] Run unit tests and the isolated network suite with actual request/response assertions. Configured document-request headers reject secondary redirects with an explicit error instead of leaking downstream.

## Task 4: Controlled Editor and Reliable Autosave

**Files:** new `src/components/proxy/HeaderSettings.vue`, `src/components/proxy/ConfigSection.vue`, `src/components/proxy/ProxyView.vue`, `src/stores/proxy.ts`; use existing `src/components/common/SaveStatus.vue`.

**Interfaces:** HeaderSettings consumes title, modelValue and save state and emits immutable model updates. ConfigSection remains presentational. ProxyView owns one draft controller keyed by rule ID with a flush operation; only valid snapshots are submitted through the Store.

- [x] Add UI regression scenarios for adding/deleting a row, switching enabled state, manual/autocomplete inputs, duplicates and invalid names; unit tests cover blank values.
- [x] Render request and response sections below the address section with 4px radius. Reuse el-table, el-checkbox, el-autocomplete, el-input textarea, icon buttons, tooltips and SaveStatus.
- [x] Use stable row IDs, readable empty states and responsive controls; no tabs or manual save button.
- [x] Debounce valid edits for 500ms, await Store persistence before showing saved, and serialize snapshots so an older save cannot overwrite a newer one. Surface failure and leave failed drafts available for retry.
- [x] Switching rules or closing/exporting flushes valid pending snapshots; invalid drafts never replace the last valid rule configuration. Preserve drafts by rule ID during the current editor session.
- [x] Test that external rule deletion/import cannot recreate deleted rules or reapply stale drafts, and that header saves do not reset pending name edits. Copy/edit/reload/delete scenarios pass in the actual extension UI.

## Task 5: Verification and Delivery

- [x] Run every repository `*.test.mjs` suite (48 pass), TypeScript checks, targeted ESLint and Prettier checks, and `git diff --check`.
- [x] Run `npm run build`; no ZIP or CRX generated. Existing eval/large-chunk warnings remain.
- [x] Run isolated Chrome network scenarios for both strategies, same-target isolation, unrelated origins, empty/disabled headers, override cleanup, storage round trips and credential leakage.
- [x] Inspect desktop/compact screenshots and verify keyboard focus, tooltip visibility and text wrapping in isolated Chrome. No user browser settings or configuration changed.
- [x] Primary-agent self-review completed against the approved design. Runtime restrictions are documented in the execution ledger and editor tooltip. Changes remain uncommitted on feat/proxy-headers.
