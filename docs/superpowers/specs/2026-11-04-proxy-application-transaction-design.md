# Proxy Configuration Application Transaction

Approved in conversation: fail closed for configuration enable/update, not for ordinary HTTP/resource failures.

- Validate and apply the whole configuration as one coordinated operation. Install resource redirects before enabling document interception, so local HTML cannot be enabled ahead of its JS/CSS routing.
- Only report active after both strategies finish initialization. A failed or hanging initialization triggers cancellation, cleanup of both strategies, and persistence of the master switch as off; preserve selected rules and all editor data.
- Chrome does not provide an atomic transaction spanning debugger and DNR APIs. Use compensating cleanup, explicit cancellation and honest cleanup-error reporting. Already completed requests cannot be undone.
- Configuration application has a 15-second deadline; each cleanup attempt has a 5-second deadline. These are implementation defaults bounding browser API hangs, not resource fetch timeouts.
- Cleanup failure is an error, never a successful disabled state. Keep a visible runtime error and allow an explicit retry, with cleanup required before applying another enabled configuration.
- Expected closed/restricted tabs are skipped, but real initialization errors must reach the coordinator rather than being swallowed. Late debugger attachments or dynamic-rule writes must not reactivate an aborted attempt.
- Runtime state is separate from persisted user intent: applying, active, disabled and error. Keep it in session storage and synchronize the open popup. Configuration-save replies wait for application, not just storage writes; duplicate storage events must not reapply identical configurations or erase the failure report.
- Banner cancellation retains existing master-off behavior; ordinary request failures never disable the master. Do not add red badge indicators, raw console.error calls, dependencies, or standalone browser test scripts.

## Verification

Vitest covers delayed/failing strategies, initialization/cleanup timeouts, late completions, recovery, preserved selections, sticky runtime errors, deduplicated storage updates and accurate save acknowledgements. Existing HTTP/headers/cancellation regressions must pass. Do not alter the user's actual proxy configuration to run failure tests.
