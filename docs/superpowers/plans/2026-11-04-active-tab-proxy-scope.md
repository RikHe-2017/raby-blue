# Active-Tab Proxy Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict all proxy behavior to the currently focused active browser tab and move that scope when focus changes.

**Architecture:** Add an optional active `tabId` to the shared strategy configuration. `ProxyManager` reads the focused active tab through an injected dependency and refreshes strategies when the scope changes. Response interception filters its per-tab debugger lifecycle, while redirect rules move from persistent dynamic rules to session rules carrying `condition.tabIds`.

**Tech Stack:** TypeScript, Chrome MV3 `tabs`, `windows`, `webNavigation`, `debugger`, and `declarativeNetRequest` APIs, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-active-tab-proxy-scope-design.md`

## Global Constraints

- Only the focused active HTTP/HTTPS tab is proxied.
- Background tabs must not be attached to `chrome.debugger` or match generated redirect rules.
- Session redirect rules must be recreated after service-worker startup.
- Existing proxy matching, header behavior, and strategy ordering remain unchanged.
- Preserve unrelated staged and unstaged work in the shared worktree.

## Review Focus

- Switching tabs must remove the old scope before the old tab can keep receiving proxy effects.
- Switching browser windows must select the active tab in the focused window, not an arbitrary active tab in another window.
- Navigating the active tab must reconnect it; navigating an inactive tab must not attach it.
- Non-HTTP tabs must clear debugger and redirect scope without failing initialization.
- Legacy dynamic rules must not remain globally active after migration to session rules.

### Task 1: Scoped strategy data and redirect rules

**Files:**
- Modify: `src/proxy/ProxyStrategy.ts`
- Modify: `src/proxy/request-policy.ts`
- Modify: `src/types/chrome.d.ts`
- Modify: `src/proxy/RedirectProxy.ts`
- Test: `src/proxy-strategies.test.ts`
- Test: `src/proxy/RedirectProxy.test.ts`

**Interfaces:**
- `StrategyConfig.tabId?: number` identifies the only tab allowed to receive this strategy.
- `buildRedirectRules(config)` adds `condition.tabIds` only when `config.tabId` is defined.
- `RedirectProxy` replaces session rules and removes legacy dynamic rules it owns.

- [x] **Step 1: Add failing tests** for tab-scoped redirect rule generation, session-rule updates, disposal, and removal of legacy dynamic rules.
- [x] **Step 2: Run the focused redirect tests** and confirm they fail because the strategy still uses dynamic rules and does not emit `tabIds`.
- [x] **Step 3: Implement the scoped `StrategyConfig`, Chrome type declarations, tab-scoped rule generation, and session-rule lifecycle.** Keep updates atomic and preserve abort handling.
- [x] **Step 4: Run `npx vitest run src/proxy-strategies.test.ts src/proxy/RedirectProxy.test.ts`** and confirm all focused tests pass.

### Task 2: Active-tab response interception

**Files:**
- Modify: `src/document-response.ts`
- Modify: `src/proxy/ResponseProxy.ts`
- Test: `src/response-connection.test.ts`

**Interfaces:**
- `ResponseProxy.update` passes `StrategyConfig.tabId` to the response driver.
- The response driver accepts an optional scoped tab ID and attaches only that tab.

- [x] **Step 1: Add failing tests** for updating a scope from tab A to tab B, skipping inactive tabs during initialization/navigation, and detaching when the scope is absent or non-HTTP.
- [x] **Step 2: Run the focused response tests** and confirm the existing implementation still attaches all HTTP tabs.
- [x] **Step 3: Implement scoped attach/detach state and filter `onBeforeNavigate`/`onUpdated` callbacks by the active scope.** Preserve child-target auto-attach within the scoped tab.
- [x] **Step 4: Run `npx vitest run src/response-connection.test.ts`** and confirm all response tests pass.

### Task 3: Active-tab refresh orchestration

**Files:**
- Modify: `src/proxy/ProxyManager.ts`
- Modify: `src/background.ts`
- Test: `src/proxy-strategies.test.ts`
- Test: `src/proxy/application.test.ts`

**Interfaces:**
- `ProxyManager` receives an injected `readActiveTabId(): Promise<number | undefined>` and includes the returned tab ID in strategy configs and configuration signatures.
- Background refreshes on `tabs.onActivated` and `windows.onFocusChanged`.

- [x] **Step 1: Add failing tests** for tab ID propagation, active-tab changes causing a refresh, and focused-window selection.
- [x] **Step 2: Run the focused manager/application tests** and confirm scope changes are currently ignored.
- [x] **Step 3: Implement active-tab reading, scope-aware signatures, and background tab/window event refreshes.** Keep serialization and timeout behavior intact.
- [x] **Step 4: Run `npx vitest run src/proxy-strategies.test.ts src/proxy/application.test.ts`** and confirm all orchestration tests pass.

### Task 4: Verification and migration audit

**Files:**
- No additional production files.

- [x] **Step 1: Run `npm test`.**
- [x] **Step 2: Run `npm run test:typecheck`.**
- [x] **Step 3: Run targeted ESLint, Prettier, and `git diff --check`.**
- [x] **Step 4: Review `git status --short` and the intended diffs without staging, reverting, or formatting unrelated session changes.**

### Task 5: Explicit no-active-tab behavior

**Finding:** An undefined active tab ID must represent an explicit empty proxy scope, not an unscoped global fallback.

- [x] Add regression coverage for `tabId: undefined` producing no redirect rules and detaching response connections.
- [x] Make scoped redirect generation return no rules when the active tab is unavailable.
- [x] Re-run focused tests, the full test suite, typecheck, lint, formatting, and diff checks.
