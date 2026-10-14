# Optional managed AI connection: implementation design

Status: proposed architecture, not an implemented or deployed service. The current
app offers owner-configured API/local connections and sample mode. It must not
advertise a Sidekick subscription, account, trial, or managed service as available.
The project owner must identify the service operator, hosting/account, authentication
provider, commercial terms, and data-retention agreement before implementation.
No remote listener, billing account, subscription, purchase, or hosted infrastructure
has been added by this usability change.

## User experience

Offer an optional “Sign in to Sidekick” route beside “Use my own AI connection.” Open
the user's system browser for sign-in. Show the service price, usage allowance,
retention policy, and cancellation rules before any enrollment; enrollment and
payment require explicit user action. Guided setup selects a supported model behind
the scenes and performs a fixed data-free connection check. Continue to show the
chosen service and what league context is shared when creating a report. Existing
API/local settings remain supported and are not silently replaced.

Disconnect revokes the managed session and removes local tokens without deleting
leagues or reports. Expired sessions lead to sign-in, exhausted allowance leads to
an explanation plus sample/owner-connection options, and an outage preserves drafts
and durable requests. Automatic delivery policy stays local and never defaults on.

## Boundaries and authentication

The managed gateway is a separate authenticated HTTPS service; the local API remains
loopback-only with its current origin/host checks. No inbound remote management or
remote delivery into the local app is introduced. Keep gateway-specific behavior
behind a typed `AIProvider` adapter in `packages/integrations`; server-vendor secrets
never ship in the desktop package, source, settings, or dashboard.

Native sign-in uses authorization code plus PKCE through the external browser,
following [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252). A short-lived loopback
callback, if required, has one allowlisted path, a cryptographic state/nonce bound
to the initiating session, one-use completion, a timeout, and strict redirect/issuer/
audience validation. Tokens remain inside the local API/OS credential vault. Browser
pages receive only connection/account status. Use an audited identity provider rather
than hand-written password storage. Browser-only clients need their own reviewed
session/callback flow; do not reuse a native secret in a public web client.

Gateway requests require a user-bound access token and per-user authorization;
refresh-token rotation and server revocation support are mandatory. Enforce fixed
approved HTTPS gateway origins, request timeouts, cancellation, response/body bounds,
validated response schemas, and retry-safe request IDs. Runtime selection must use
fresh revision checks and explicit consent; do not send a newly entered token to an
old/custom endpoint.

## Threat model and mitigations

| Asset / threat                               | Required design                                                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Gateway provider key theft                   | Server-side secret manager; no vendor key embedded in clients; redacted logs.                                                                 |
| Session interception or callback forgery     | External browser, PKCE, nonce/state, exact callback/issuer/audience checks, bounded one-use sessions.                                         |
| Cross-account data disclosure                | Tenant authorization on every request/resource; opaque IDs are not authorization.                                                             |
| Usage theft or runaway costs                 | Per-user rate/token/concurrency limits and hard billing allowances; explicit paid enrollment; no silent overage.                              |
| Prompt injection requesting extra access     | Gateway only generates bounded text; it has no tools, vault access, delivery capability, or arbitrary URL fetch.                              |
| Sensitive league/member context exposure     | Minimize requests, preserve separate member-context consent, publish retention policy, disable prompt/body logging, support account deletion. |
| Duplicate generation and charging            | User-scoped idempotency IDs, bounded result retention, atomic allowance accounting; connection tests do not contain league data.              |
| Compromised external site reaching local API | Retain loopback/origin/host checks; no gateway CORS exception for the local API; no remote administration routes.                             |
| Misleading cost or delivery state            | Server-authored allowance/cost status; local send confirmation remains authoritative; outage does not trigger a send.                         |

The gateway accepts only generation requests and account/usage operations. It does
not accept delivery commands, OS commands, account session cookies for ESPN/Yahoo,
backup archives, or clipboard contents. Separate operational logs from report text;
ensure error responses cannot echo bearer tokens, prompts, or vendor credentials.
Data retention and region must be chosen before production use, not inferred from
an unspecified provider.

## Reviewable implementation sequence

1. Resolve operator/domain, account/auth provider, budget and commercial terms, data
   policy, and supported desktop/browser environments with the owner.
2. Implement the authenticated gateway with authorization/idempotency/allowance
   tests using fake vendor responses and no production billing enrollment.
3. Add the typed outbound adapter, vault session handling, PKCE sign-in/cancel/logout,
   revision-aware provider selection, and account/allowance status.
4. Add guided setup without replacing existing connections; test expired sessions,
   wrong issuer/audience, callback replay, cross-tenant access, quota exhaustion,
   cancellation, and outages using controlled interfaces.
5. Complete manual code/security review and privacy/account deletion tests. Do not
   run automated security scans, per the owner’s repository instructions.
6. Present a concrete staging build, operating costs, and policy for the owner to
   approve before deploying a paid public service or enrolling users.

The existing service remains unchanged until the account/hosting choices are supplied.
This design is the prerequisite for the repository's explicit remote-access threat
model and authentication requirement, not evidence that production hosting is ready.
