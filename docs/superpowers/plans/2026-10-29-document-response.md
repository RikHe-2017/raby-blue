# HTTP Response Replacement

Historical implementation stage. The current hybrid strategy and verification
are documented in `2026-10-30-proxy-strategies.md`: document requests use response
replacement; other resources use redirects. The all-response behavior described
below has been superseded, and the browser integration test now verifies hybrid routing.

Keep the existing proxy configuration and script execution unchanged. All matched
HTTP/HTTPS requests use debugger Fetch interception and receive the mapped target
response. No resource-type or MIME filter; remove old declarative redirects.

## Tasks

- [x] Add pure matching, header and binary-upload tests, then implement.
- [x] Intercept HTTP requests, bounded target fetch, binary fulfillment, lifecycle
  cleanup, iframe/worker sessions and visible connection-failure indication.
- [x] Integrate configuration updates and remove old redirect rules.
- [x] Verify real-extension HTML, iframe, resources, APIs, disabled rules,
  failed target requests, unchanged addresses and production build.

## Boundaries

The extension needs debugger and webNavigation permissions. Attaching during an
already-started navigation can miss the first request; refresh after attachment.
While rules are enabled, attach to ordinary HTTP/HTTPS tabs even if the page URL
does not match: requests from that page may match an API-only rule. Unmatched
requests continue unmodified. Disable proxy to release debugger connections.
No automatic reload, new UI modes, configuration migration, HTML rewriting or
hot-reload websocket rewriting. No guarantee of login-cookie equivalence between
original and target origins. Do not forward original cookies to a different host.
Do not commit or create archives unless requested.
WebSocket and persistent streaming responses are not supported by whole-response
buffering. No WebSocket rewrite or transparent streaming proxy is implemented.

## Verification

- `npm run test:document-response`: six pure-rule tests and two connection-recovery tests.
- Existing sidebar, configuration-transfer and preference suites: 23 tests.
- `npm run build`: type checking and production output in `dist`.
- `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/test-document-response.mjs`:
  uses an isolated Chrome profile and temporary local HTTP services. Playwright is
  a test-only external runtime, not a new application dependency. Set `CHROME_PATH`
  when Chrome is not installed at the default macOS path.
- Browser checks: unchanged URLs and no redirects; gzip/Unicode; cross-site iframe;
  JS/CSS, binary responses/uploads, Fetch, XHR and Worker requests replaced;
  non-HTML documents accepted; POST method/body and authorization preserved;
  unmatched navigation continues supporting API-only rules; disabling removes
  debugger connections; unreachable targets produce a visible badge and fail.
- Browser test does not grant local/loopback site permissions or disable browser
  security. Target responses are fetched in the extension, not by redirecting the
  webpage. Real websites may still have other CSP/CORS or server restrictions.

## Manual Test

Reload the extension from `dist`, accept the added debugger/navigation permissions,
enable the existing rule, then refresh the original page after debugger attachment.
Chrome must be version 125 or newer for flattened iframe sessions. After a debugger
disconnect, explicit main-frame navigation permits reconnection and validates
cached connection state. A request already in flight can still miss interception;
refresh after connection, or re-enable the proxy first. Target fetches omit
cookies and transport/browser-generated request headers, but forward application
headers including Authorization, Content-Type and Range to the configured target.
Cookie-authenticated requests may behave differently. HTML, script paths and HMR connections are not
rewritten. Actual private-network application/HMR compatibility remains a manual
test on the user's running service, not a claim from the synthetic browser test.

## Disconnection Investigation

The actual development extension had the correct enabled source/target rule, but
its debugger command reported no connection to the testing tab. Background logs
contained repeated disconnection messages. The page still referenced the hashed
production vendor bundle, unlike the un-hashed local development vendor bundle.
The original detach reason was not logged, so its trigger is not established.

An isolated headed browser run with automatically opened DevTools passed all
response-replacement checks. Do not assume that opening DevTools necessarily
caused this particular failure. Add `OPEN_DEVTOOLS=1` to the browser test command
to repeat that configuration.

Regression tests first reproduced two recovery defects: explicit navigation could
not reconnect a dismissed tab, and a stale cached attachment was never validated.
Both now pass. Recovery is user-navigation-driven, not a periodic loop, and does
not automatically reload pages or override proxy configuration. Disconnect logs
now include the tab identifier and the platform-provided reason.
