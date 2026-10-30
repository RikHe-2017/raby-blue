# Proxy Strategies

Keep stored proxy rules, UI and script execution unchanged. Use a ProxyStrategy
interface with RedirectProxy and ResponseProxy implementations. ProxyManager is
the only coordinator: it loads source configuration in a serialized queue and
derives both strategy inputs from one request policy. Shared matching remains pure.

Default policy: page documents (including iframe navigation, without MIME checks)
use response replacement; all other request types use declarative redirects.
Expose policy selection in code only; no new user preference or UI in this change.

## Tasks

- [x] Test routing exclusivity, redirect generation, policy changes and lifecycle.
- [x] Add strategy contract, pure request policy, two implementations and manager.
- [x] Scope the existing response driver from policy while preserving reconnection.
- [x] Integrate background refresh without duplicate configuration queues.
- [x] Verify hybrid browser behavior, unit suites, lint and production build.

Policy changes remove old redirects before changing interception scope, preventing
the same request from being handled by both mechanisms during a transition.
Ordinary configuration refreshes use the same disjoint scope without reconnecting
every tab. Errors reject the update and stop conflicting implementations. Disposal
releases connections and rules; no code commit or archive unless requested.

Browser integration must grant local-network permission in the isolated test
profile for redirecting local resources. This does not bypass browser policies in
the user's profile. CORS/local-network restrictions remain separate from routing.

## Implementation Map

- `src/proxy/ProxyStrategy.ts`: shared lifecycle contract and normalized request types.
- `src/proxy/request-policy.ts`: immutable default routing, protocol type mapping,
  disjoint strategy inputs and browser redirect generation. Fetch/XHR share one
  policy type because Chrome declarative redirects cannot distinguish them.
- `src/proxy/RedirectProxy.ts`: atomic browser redirect updates and cleanup.
- `src/proxy/ResponseProxy.ts`: lifecycle adapter for the tested response driver.
- `src/proxy/ProxyManager.ts`: serialized loading, policy transitions and failure cleanup.
- `src/document-response.ts`: transport-specific interception and reconnection.

Unsupported response scopes (including WebSocket) fail validation explicitly;
they are not silently routed through whole-response buffering. Neither class
persists business configuration. Classes own browser lifecycle effects; matching,
classification, request routing and header/body conversion remain pure functions.

## Verification

`npm run test:document-response` includes strategy, matching and reconnection tests.
The browser integration command remains
`PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/test-document-response.mjs`.
It verifies document/iframe URL preservation, non-HTML document acceptance, POST
documents, resource/API redirects, disjoint browser scopes, binary transfers,
disabled state and unreachable targets. It grants local-network permissions only
inside its temporary profile. No additional runtime dependencies are introduced.

Result: 39 unit tests passed; targeted ESLint and Prettier checks passed; the real
Chrome extension integration passed; production build passed. Existing eval and
large-chunk build warnings remain unchanged. No commit or archive was created.
