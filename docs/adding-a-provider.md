# Adding a provider

If you want HookKit to support a new webhook provider, the implementation lives
in the core package and the fixture package. The rest of HookKit reads from that
shared provider registry.

**Before writing a bespoke adapter, check whether the provider is
Svix/Standard-Webhooks-powered.** A growing set of providers (Clerk, Resend,
Polar, and anything Svix-based, as of this writing) already emit spec-compliant
Standard Webhooks — `hookkit.provider("standard-webhooks", …)` (or an SDK alias
like `hookkit.clerk(…)`) already covers them with zero new code. Always confirm
against the provider's current docs, since implementations can change.

Worked example: adding a fictional provider `acme` with event
`order.shipped`.

## 1. Add the synthetic fixture

Create a fixture file for the event and register it in the fixture manifest.
Use synthetic data only.

```bash
hookkit fixtures add acme order.shipped --api-version v1
```

That creates a new payload file under `packages/fixtures/fixtures/acme/v1/` and
adds the manifest entry for `acme/order.shipped`.

## 2. Implement the provider in `@hookkit-dev/core`

Write the adapter in core and add a golden test first. The golden test should
prove that HookKit-generated signatures verify with the provider's official
verification library, when one exists.

The adapter should define:

- `sign()` to produce the provider's real headers from the exact raw bytes,
- `verify()` to validate those headers in constant time,
- `events` to map event names to fixture ids and schemas,
- `retryPolicy` to describe the provider's documented retry behavior.

Do not re-serialize the payload before signing. The raw request body is the
source of truth.

Two edge cases the shared conformance suite already accounts for, if your
provider needs them:

- **No official verify library.** Some schemes (e.g. GitLab's static
  shared-secret token) have nothing to compute, so there's no library to check
  a golden test against. Document that explicitly in the golden test and
  assert the provider's own documented behavior directly instead — the one
  deliberate exception to "verify against official library."
- **Signature doesn't bind to the body.** If the scheme validates a token
  independent of the request body (again, GitLab), set `verifiesBody: false`
  on the adapter so the conformance suite's tampered-body check skips
  correctly. Never set this to make a real bug in your `verify()` disappear —
  it's only for schemes that are genuinely, deliberately body-independent.

## 3. Register the provider

Add the adapter to the core registry and export it from the core entry point.
Once that is done, the SDK and CLI can use the provider by name.

## 4. Verify the provider end to end

Run the core tests and the full workspace verification:

```bash
pnpm --filter @hookkit-dev/core test
pnpm verify
```

When those pass, the provider is ready for users. You can optionally add a
shortcut on the SDK surface, but `hookkit.provider("acme", …)` already works.
