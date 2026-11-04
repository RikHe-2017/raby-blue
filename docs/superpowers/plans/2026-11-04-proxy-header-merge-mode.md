# Proxy Header Merge Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each configured request or response header to choose whether an existing same-named header is overwritten or retained alongside the configured value.

**Architecture:** Extend `HeaderSetting` with an optional backward-compatible mode, keep the behavior in the existing pure `mergeHeaderSettings` function, and add one UI selector per header row. Missing modes are interpreted as overwrite so persisted configurations remain compatible.

**Tech Stack:** Vue 3, TypeScript, Element Plus, Vitest.

**Spec:** Conversation-approved design on 2026-11-04: merge preserves original same-named header entries and appends the configured entry; overwrite removes all same-named original entries and appends the configured entry.

## Global Constraints

- Do not overwrite or revert unrelated modifications from other sessions.
- Preserve immutable-input behavior in JavaScript/TypeScript functions.
- Do not introduce a new CSS layout system; use the existing table layout.
- Existing configurations without `mode` must retain current overwrite behavior.
- Keep the existing case-insensitive header-name matching and validation rules.

## Review Focus

- A missing mode must behave exactly like overwrite; test legacy settings.
- Merge must preserve all duplicate original entries; test duplicate input names.
- Overwrite must remove all case variants of an existing name; test case-insensitive matching.
- Disabled settings must not affect originals; retain the current test coverage.
- Both request and response paths consume the same merge function; retain integration coverage.

### Task 1: Header merge behavior

**Files:**

- Modify: `src/proxy/header-settings.test.ts`
- Modify: `src/proxy/header-settings.ts`
- Modify: `src/types/proxy.ts`

**Interfaces:**

- Produces `HeaderSetting.mode?: 'overwrite' | 'merge'`.
- Preserves `mergeHeaderSettings(original, settings)` as the shared pure API.

- [x] **Step 1: Write failing tests** for merge mode, overwrite mode, legacy settings without mode, case-insensitive names, and duplicate original entries.
- [x] **Step 2: Run `npx vitest run src/proxy/header-settings.test.ts`** and confirm the new merge-mode assertions fail because the mode field and behavior do not exist.
- [x] **Step 3: Add the backward-compatible mode type and implement the minimal mode-aware merge behavior.** Missing mode defaults to overwrite; merge retains matching original entries and appends the configured entry.
- [x] **Step 4: Run `npx vitest run src/proxy/header-settings.test.ts`** and confirm all tests pass.

### Task 2: Header settings editor

**Files:**

- Modify: `src/components/proxy/HeaderSettings.vue`
- Modify: `src/proxy/header-drafts.test.ts`

**Interfaces:**

- Consumes `HeaderSetting.mode` from Task 1.
- Emits the same immutable `HeaderSetting[]` updates as before.

- [x] **Step 1: Add a failing pure-function assertion** that newly created rows default to `overwrite`.
- [x] **Step 2: Run the focused test and confirm it fails before the default-row helper exists.**
- [x] **Step 3: Add the mode selector and initialize newly added rows with `mode: 'overwrite'`; preserve the existing table layout and immutable update pattern.**
- [x] **Step 4: Run `npx vitest run src/proxy/header-settings.test.ts src/components/proxy/header-drafts.test.ts`** and confirm all focused tests pass.

### Task 3: Verification

**Files:**

- No additional production files.

- [x] **Step 1: Run `npx vitest run src/proxy/header-settings.test.ts src/components/proxy/header-drafts.test.ts src/response-connection.test.ts`.**
- [x] **Step 2: Run `npm run test:typecheck`; record unrelated pre-existing session failures if present.**
- [x] **Step 3: Inspect `git diff --stat` and `git status --short` to verify only the intended new plan and feature files changed; do not stage or alter unrelated session changes.**

### Task 4: Full replacement request path

**Files:**

- Modify: `src/document-response.ts:431-438`
- Test: `src/response-connection.test.ts`

**Interfaces:**

- Consumes the shared array result from `mergeHeaderSettings` without converting it to an object.

- [x] **Step 1: Add a failing integration test** proving a rewritten XHR in merge mode passes both original and configured same-named request headers to `fetch`.
- [x] **Step 2: Run the focused test and confirm `Object.fromEntries` collapses the duplicate into the configured value.**
- [x] **Step 3: Pass the merged header tuple array directly as `fetch` headers.**
- [x] **Step 4: Run the focused test and confirm both values are preserved.**
