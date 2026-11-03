# Script Sidebar Implementation Plan

> Execute inline using executing-plans. No subagents, commits, dependency installation, or changes to unrelated pending work.

**Goal:** Bring the script directory to proxy-sidebar parity without losing editing or execution functionality.

**Architecture:** Keep script config as source of truth. Use immutable script tree transforms and read-only projections; share script node rendering/actions across the tree and plain list. Extend the existing user preferences queue for independent panel/tree states.

**Tech Stack:** Vue 3, Pinia, Element Plus, TypeScript, SCSS, Vitest.

**Spec:** ../specs/2026-11-03-script-sidebar-design.md

## Global Constraints

- Keep existing rule data and user work unchanged. No new SCSS ampersands or CSS Grid.
- Two panels: favorites and script configuration; initially open, favorites initially a list.
- Missing favorites are false; all-collapsed state is valid, not missing data.
- Only root categories from header; all actions must retain original capability and ordering.

## Review Focus

- Partial favorite projections must not truncate a category command's scope.
- Failed storage writes and overlapping edits must not silently remove data or falsely announce success.
- Clearing a search or adding data must not permanently expand unrelated categories.
- Deleting nested categories must not reorder surviving siblings or invalidate active editor selection.
- Import/export and old preferences must not drop favorites or interfere with proxy preferences.

## Task 1: Models, persistence and tests

- [x] Write Vitest regressions for script recursive favorites/CRUD, projections, independent preferences and backup validation.
- [x] Run tests and observe missing behavior (RED).
- [x] Add optional favorite field, immutable tree operations, queued store persistence and script sidebar preferences.
- [x] Run focused tests and typecheck (GREEN).

## Task 2: Sidebar components and integration

- [x] Extract ScriptNodeContent and shared script commands retaining category/script-specific operations.
- [x] Implement plain ScriptList, favorites panel, ScriptTree reuse and source-node resolution.
- [x] Integrate collapsible sidebar and preference bindings; synchronize selection with ScriptView.
- [x] Ensure explicit expansion state survives filtering and node additions; no event bubbling from menu controls.

## Task 3: Verification

- [x] Run all Vitest tests, typecheck, lint, formatting/whitespace checks and production compilation.
- [x] Inspect UI with isolated browser data, including menus, favorites/list/tree, selection and persisted collapsed panels.
- [x] Self-review scoped changes against the spec, update this ledger and report any unverified behavior.

## Progress

- Plan and approved scope recorded. Existing dirty files belong to preceding work or the user and will not be reverted.
- Task 1: 23 model/projection/preferences/backup tests and 4 store tests passed after observed RED runs. Command tests (4) verified source-category scope, fresh copies, edit/delete and error-only notices.
- Task 2: implemented shared script presentation/actions; observed isolated UI creation, rename, editing, favorites, search and list/tree switch. Refresh restored both collapsed panels, active script, editor content, mode and main-tree expansion. Harmless test script executed successfully in standalone development mode.
- Self-review: serialized config reads with pending writes; regression observed RED before the fix. Draft name/content saves are enqueued together before navigation/unmount. No changes to script execution or formatting implementation.
- Final self-review fix: commands flush editor drafts before looking up source nodes, verified by a duplicate-content regression RED -> GREEN. Added pending-load ordering regression RED -> GREEN.
- Final verification: `npm test` passed 133 tests in 20 files; `npm run test:typecheck`, `npm run lint:check`, `npm run build` and scoped whitespace checks passed. Changed sources formatted with Prettier. Existing eval/chunk-size build warnings remain.
- UI verification used isolated localhost preview data only: both-panel collapse/reload, selected script and contents restoration, independent proxy/script preferences, favorites search/list/tree, fresh unfavorited copies, immediate tab-switch name save, and standalone script execution succeeded. Screenshot: `/tmp/raby-blue-script-sidebar.jpg`.
- Not manually verified: actual Chrome extension execution and browser-process restart. The Chrome execution path was not changed; local-storage restoration was exercised with page reload and tab remount. No commits or pushes performed.
