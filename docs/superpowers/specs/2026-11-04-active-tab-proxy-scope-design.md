# Active-Tab Proxy Scope

## Intent

Make the entire proxy scope follow the currently focused browser tab. Document response interception, request/response header handling, and declarative redirects must affect only that tab; background tabs must not be attached to `chrome.debugger` or match proxy redirect rules.

## Goals

- Initialize and maintain at most one HTTP/HTTPS tab connection for response interception.
- Move both response interception and redirect rules when the active tab or focused window changes.
- Apply the same tab scope to scripts, stylesheets, images, XHR/fetch, and other redirect-managed resources.
- Reconnect the scoped tab through existing navigation lifecycle events.
- Remove stale dynamic redirect rules left by the previous implementation.

## Non-goals

- Do not change proxy matching, header merge behavior, or request/response replacement semantics.
- Do not proxy background tabs merely because they are open.
- Do not add a second network interception mechanism.

## Design

`StrategyConfig` carries an optional active `tabId`. `ProxyManager` obtains the active tab from an injected reader and includes that ID in its applied-configuration signature, so tab switches trigger a strategy refresh. `ResponseProxy` passes the scope to `document-response`, which filters attach/navigation events and only attaches the scoped tab.

The production strategy configuration always carries the scope property, including when no active tab ID is available. An explicit `tabId: undefined` means there is no proxy target: response interception detaches all debugger connections and redirect generation produces no rules. It must never fall back to an unscoped global redirect.

`RedirectProxy` uses session-scoped declarativeNetRequest rules because `RuleCondition.tabIds` is supported for session rules. It adds `tabIds: [tabId]` to generated rules and atomically replaces the session rules when the active tab changes. During migration it removes the extension's old dynamic rules; session rules are rebuilt after service-worker startup.

The background listens to `tabs.onActivated` and `windows.onFocusChanged` to refresh the scope. Navigation events remain responsible for reconnecting the currently scoped tab after navigation; they do not attach unrelated tabs.

## Constraints

- Preserve existing strategy ordering: response cleanup, redirect update, then response update.
- Keep all TypeScript functions immutable and pure where they transform configuration.
- Preserve existing request policy and tests, extending them only for tab scope.
- Do not overwrite unrelated session changes in the shared worktree.
