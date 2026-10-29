# Proxy Sidebar Implementation Plan

**Goal:** Three independently expandable Element Plus panels: configuration, selected proxies, favorites.

**Approved design:** Selected and favorite panels default to a compact name/path list. Each header has an independent switch to a categorized tree. Checkboxes edit the original rule; deselection removes it only from selected proxies. Stars manage favorites independently of enablement. All views retain full directory context and open the same editor.

**Architecture:** Derive compact entries and pruned trees from the original configuration with pure functions. Favorites belong to the optional `ProxyRule.favorite` field; absent means not favorited for old configurations. Store all UI preferences in the single `userPreferences` key through one Pinia store. Reuse Element Plus Collapse, Switch, Tree, Checkbox, Button, Tooltip and Empty. Do not add dependencies.

## Tasks

- [x] Add failing tests for ordered full paths, duplicate names, selected/favorite filtering and input immutability; implement pure projections.
- [x] Add persistent sidebar preferences and a shared favorite button. Extend the configuration tree with favorites and synchronized active rows.
- [x] Add quick-view panels and compose them with the existing configuration tree inside Collapse; independently persist display switches.
- [x] Run unit tests, targeted lint, build and extension UI checks for both display modes, cross-view checkbox state, favorites, reload, empty state and narrow layouts.

## Verification

- Eight sidebar/rule/preference tests and nine transfer tests pass.
- Targeted ESLint and production build pass. Existing eval/chunk-size build warnings remain unchanged.
- Real Chrome extension checks cover independent switches (mouse and keyboard), full paths, checkbox synchronization, favorite persistence, editor navigation, empty states, restored panel expansion and narrow sidebar layout.
- Existing end-to-end import/export checks pass, including replacement confirmation/cancellation and invalid data handling.
- Preferences are normalized at the storage boundary to support Chrome's existing object-form array compatibility without changing proxy configuration data.

**Boundaries:** Favorites are source-rule metadata, not copied rules or a separate ID list. Proxy exports carry the optional favorite field, replacement follows the imported file, and same-name incremental imports retain local favorites. Deleting a rule or group automatically removes its favorites. Global disablement does not clear selected proxies.

## Source-Driven Update Follow-Up

- [x] Move favorites into source rules; derive favorite entries with computed. The subsequent unified-preferences request explicitly removes old ID-list compatibility.
- [x] Route configuration/selected/favorite checkbox events through Sidebar with rule ID and explicit target value. The actual enablement field is `enabled`, not `enable`.
- [x] Use one store action backed by a pure rule updater. Replace only the changed rule and ancestor path, including the root reference, so Tree receives an explicit data update. Preserve references on no-op updates.
- [x] Check actual extension storage and rendered checkboxes during repeated deselection in both display modes, including deselecting the last item and expanding a previously collapsed group.
- [x] Verify source favorites survive export/reload, follow replacement/merge policies, and disappear on rule/group deletion.

The original stale-checkbox symptom was not reproduced in the isolated pre-change extension check: source `enabled` and the configuration checkbox both became false. The suspected stale-node cause is not confirmed. The follow-up removes duplicated toggle handlers and strengthens immutable source-to-view updates without introducing watch-based synchronization or forced component remounts.

## Unified User Preferences

- [x] Store active tab, proxy/sidebar display settings, proxy tree state and script tree state under `userPreferences` only. Do not read or migrate legacy preference keys.
- [x] Remove independent sidebar preference storage and favorite ID migration. Keep proxy/script business configuration and source favorite flags unchanged.
- [x] Use one update queue and pure nested patches so simultaneous section saves retain unrelated preferences. Proxy/script stores expose computed views instead of additional UI-state copies.
- [x] Commit replacement imports and relevant tree-state resets together; retain other UI preferences and surface save failures.
- [x] Mount sidebars after configuration/editor restoration so tree initialization uses actual business data.
- [x] Verify pure defaults/merging, all existing tests, type-check/build and Chrome extension preference restoration. Legacy keys are ignored, not deleted or imported.
