# Script Sidebar Design

Approved in chat on 2026-11-03.

## Scope

- Match the proxy sidebar interaction: a fixed header, favorites and script configuration collapse panels, counts and per-panel search.
- Header creates root categories only, appended at the end. Categories create nested categories or scripts. Script menus retain duplicate, edit and delete. All node commands use a click-triggered ellipsis dropdown.
- Favorites support plain lists and categorized trees. Both categorized views reuse ScriptTree; list and tree share ScriptNodeContent and command handling. Do not force script types through proxy components.
- Category favorite/unfavorite recursively affects every descendant script. Missing favorite means not favorited. Empty categories cannot be favorited. Read-only stars appear only when at least one descendant is favorited; partial categories show an outlined star.
- Favorite writes show success only after persistence, and failures show an error without dropping later edits. New or duplicated scripts start unfavorited.
- Preserve right-side editing, autosave, formatting and manual execution. Do not add enable checkboxes or a selected panel.

## Persistence

- Extend the existing userPreferences with scriptSidebar, independently from proxySidebar.
- Persist open panels, favorites list/tree mode, favorites tree expansion, main tree expansion and shared active selection.
- Missing sidebar preferences default to both panels open and favorites in list mode. Explicit empty expansion/open-panel arrays must remain empty on reload.
- Preserve group/script schemas and unknown fields. Favorites are a projection of source nodes, not a second mutable tree. Creating nodes must not expand unrelated categories.
- Export/import retains favorites; old backups without favorites remain valid.

## Approach

UI-only migration would omit approved favorites and persistence. Reusing proxy business components would introduce unrelated proxy controls and couple schemas. Use script-specific components following the proven proxy composition; retain existing shared preferences storage. No new dependency or standalone browser test scripts.

## Verification

Vitest TypeScript tests cover immutable recursive favorite operations, source projections, full/collapsed preference roundtrips, failure/queued-save behavior, category/script CRUD and backup compatibility. Run the complete suite, typecheck, lint and production compilation; inspect the running UI without modifying real extension data.
