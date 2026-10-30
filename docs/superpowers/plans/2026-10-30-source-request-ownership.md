# Source Request Ownership Implementation Plan

**Goal:** Match proxy rules by source URL once, independently apply URL mapping and request/response headers, and remove event-order-dependent header omissions.

**Architecture:** Keep the existing document response strategy and native resource redirects. Bind the first matching source rule to each intercepted request. Network metadata associates native redirect hops with their original source; Fetch request IDs preserve the bound rule through the response stage. Target URLs verify an existing mapping, never select a rule by destination alone.

**Spec:** User-approved source matching flow in this conversation. No UI or storage changes, no business request replays, no commits or archives.

## Decisions

- Direct source matching must work before Network metadata arrives and without an optional network ID.
- Keep in-flight rule snapshots when configuration changes; new requests consume new rules. No indefinite waiting for metadata.
- A native mapped target uses its original source rule even when it also matches another source rule. Direct requests to that target use their own source rule normally.
- Clear request associations on response, failure, tab/session teardown and interception scope changes. Do not carry custom headers onto unconfigured downstream redirects.
- Pure matching helpers own source matching and redirect attribution. The existing driver owns browser commands and transient lifecycle state.

## TODO

- [x] Add failing driver tests for Fetch-before-Network, absent network IDs, independent header settings, rule snapshots, mapped-target attribution and cleanup. Add concurrent JSON POST coverage to real-extension fixtures.
- [x] Implement source ownership and per-Fetch response correlation, retaining document native URL rewrite and DNR resource redirects.
- [x] Run the full unit suite, header/browser integration suites, formatting/lint, production build and diff checks. Review the final changes in the primary agent and record results in the existing ledger.
