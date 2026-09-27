# MCP Integration

`ai-ops-investigator` exposes a deliberately narrow Model Context Protocol surface for operational evidence.

The MCP integration has one responsibility:

> Make selected read-only operational capabilities discoverable through a standard protocol without exposing mutation authority.

The boundary is intentionally asymmetric:

```text id="mcp1"
MCP
→ operational reads

deterministic action layer
→ operational writes
```

MCP is not used as the execution boundary for consequential actions.

---

## 1. Why MCP is used

The investigator already works with narrowly scoped capabilities such as:

```text id="mcp2"
get_order
get_payment_state
get_fulfillment_attempts
get_delivery_state
get_notification_state
get_order_event_history
```

MCP provides a standard way to expose those same capabilities to an external MCP-compatible client.

The important architectural choice is that MCP wraps the existing capability contracts.

It does not reimplement the domain logic.

```text id="mcp3"
domain capability
      ↓
MCP adapter
      ↓
MCP client
```

---

## 2. MCP is a transport adapter

The MCP server does not own business state.

For example, `get_order` already defines:

```text id="mcp4"
name
title
description
input schema
annotations
execute()
```

The MCP server adapts those fields into protocol registration.

The underlying capability remains the source of behavior.

This keeps:

```text id="mcp5"
business capability
```

separate from:

```text id="mcp6"
protocol transport
```

---

## 3. Current MCP evidence surface

The server currently exposes six tools:

```text id="mcp7"
get_order
get_payment_state
get_fulfillment_attempts
get_delivery_state
get_notification_state
get_order_event_history
```

Together they form a coherent operational evidence surface.

---

## 4. `get_order`

Provides current high-level order state:

```text id="mcp8"
status
timestamps
```

It does not collapse payment, fulfillment, delivery, or notification information into the same tool.

---

## 5. `get_payment_state`

Provides payment evidence for one existing order.

Typical states include:

```text id="mcp9"
PENDING
CAPTURED
FAILED
REFUNDED
```

Payment state remains separate from fulfillment and delivery.

---

## 6. `get_fulfillment_attempts`

Provides current fulfillment-attempt evidence.

This includes distinctions such as:

```text id="mcp10"
PENDING
ACTIVE
UNKNOWN
RECONCILING
SUCCEEDED
CONFIRMED_FAILED
ABORTED
MANUAL_REVIEW
```

Those distinctions become important during incident diagnosis and later action safety.

---

## 7. `get_delivery_state`

Provides:

```text id="mcp11"
entitlement state
account delivery state
```

This allows clients to distinguish:

```text id="mcp12"
provider fulfillment succeeded
```

from:

```text id="mcp13"
customer actually received durable access
```

---

## 8. `get_notification_state`

Provides customer-notification attempts independently of commerce fulfillment.

For example:

```text id="mcp14"
order FULFILLED
delivery DELIVERED
notification FAILED
```

remains a notification incident.

---

## 9. `get_order_event_history`

Provides chronological business events.

Its role is:

```text id="mcp15"
how did this order reach its current business state?
```

It exposes business history rather than low-level infrastructure telemetry.

---

## 10. Internal processing trace is intentionally excluded

The investigator also has:

```text id="mcp16"
get_order_processing_trace
```

internally.

That tool exposes application-level execution evidence such as:

```text id="mcp17"
DATABASE_TIMEOUT
ORDER_COMPLETION_HANDLER_FAILED
PROVIDER_REQUEST_TIMED_OUT
PROVIDER_OUTCOME_UNCONFIRMED
```

It is intentionally not part of the MCP surface.

The architecture therefore distinguishes:

```text id="mcp18"
MCP operational evidence
        +
internal technical telemetry
        ↓
investigator
```

Not every internal diagnostic capability becomes remotely discoverable.

---

## 11. Least privilege

The MCP server enforces that every registered capability is:

```text id="mcp19"
readOnly = true
destructive = false
idempotent = true
```

The protocol annotations become:

```text id="mcp20"
readOnlyHint = true
destructiveHint = false
idempotentHint = true
```

This makes the least-privilege intent visible to MCP clients.

---

## 12. Registration is guarded

Before a capability is exposed, the server validates its annotations.

Conceptually:

```text id="mcp21"
if not read-only
→ reject registration

if destructive
→ reject registration

if not idempotent
→ reject registration
```

This prevents accidental exposure of a capability that violates the MCP boundary.

The server should fail early instead of quietly publishing an unsafe tool.

---

## 13. Why annotations are not just metadata

It would be possible to treat annotations as descriptive documentation only.

This project does not.

The server uses them as an explicit registration invariant.

That means:

```text id="mcp22"
read-only MCP surface
```

is partly enforced structurally rather than relying entirely on developer convention.

---

## 14. Consequential actions are excluded

The MCP server does not expose:

```text id="mcp23"
RECONCILE_ORDER_STATE
RETRY_NOTIFICATION
CREATE_FULFILLMENT_ATTEMPT
ISSUE_REFUND
CANCEL_ORDER
```

No corresponding mutation tools are published.

This is intentional.

---

## 15. Why mutation tools stay outside MCP

Consequential actions require more than a valid protocol call.

They may require:

```text id="mcp24"
grounded remediation
deterministic policy
human approval
fresh execution-time validation
durable audit
independent verification
```

Publishing those mutations as generic MCP tools would create another path around the action-safety architecture.

Instead:

```text id="mcp25"
MCP
→ evidence

action layer
→ authority
```

---

## 16. MCP clients cannot bypass policy

An MCP-capable client may discover and call the operational read tools.

It cannot directly invoke:

```text id="mcp26"
create another entitlement
refund the customer
cancel the order
change order status
```

through this MCP server.

This means protocol access does not automatically grant operational write privilege.

---

## 17. MCP does not imply agent autonomy

The existence of an MCP tool does not mean the model is authorized to use arbitrary external functionality.

The server itself defines the available capability set.

The current set is intentionally constrained to evidence gathering.

This preserves the broader rule:

```text id="mcp27"
tool availability is a system decision
not a model decision
```

---

## 18. Existing schemas are reused

Each capability already defines its input schema.

For example:

```text id="mcp28"
get_order
→ orderId required
```

The MCP registration reuses that schema.

The MCP layer does not introduce a second, independently maintained validation definition.

This reduces contract drift.

---

## 19. Protocol-level validation

Invalid MCP arguments are rejected before normal tool execution.

For example:

```text id="mcp29"
get_order({})
```

produces an input validation error because:

```text id="mcp30"
orderId
```

is required.

This demonstrates that the MCP transport preserves capability input contracts.

---

## 20. Domain errors remain domain errors

A valid tool request can still fail at the domain layer.

For example:

```text id="mcp31"
get_order({
  orderId: "ORD-DOES-NOT-EXIST"
})
```

returns a structured tool result containing:

```text id="mcp32"
ORDER_NOT_FOUND
NOT_FOUND
retryable = false
```

The MCP adapter then exposes that as an MCP error result.

This keeps two failure classes distinct:

```text id="mcp33"
invalid protocol/tool arguments
```

versus:

```text id="mcp34"
valid request, domain operation failed
```

---

## 21. Tool results remain structured internally

The underlying capabilities return:

```text id="mcp35"
ToolResult<T>
```

with either:

```text id="mcp36"
ok = true
data = ...
```

or:

```text id="mcp37"
ok = false
error = ...
```

The MCP adapter serializes that result into text content and sets:

```text id="mcp38"
isError
```

according to the capability result.

The MCP protocol is therefore an adapter around the existing result contract.

---

## 22. The smoke client proves discovery

The MCP smoke client connects over stdio and requests:

```text id="mcp39"
listTools()
```

It verifies that all expected read capabilities are discoverable.

Expected names are:

```text id="mcp40"
get_order
get_payment_state
get_fulfillment_attempts
get_delivery_state
get_notification_state
get_order_event_history
```

---

## 23. The smoke client also proves absence

The test does not only assert that safe tools exist.

It also asserts that consequential tools do **not** exist.

Examples of prohibited MCP tool names include:

```text id="mcp41"
reconcile_order_state
retry_notification
create_fulfillment_attempt
issue_refund
cancel_order
```

This is important because least privilege is partly about what the interface does **not** expose.

---

## 24. Exact surface validation

The smoke client rejects unexpected tools.

The expected boundary is not:

```text id="mcp42"
at least these six read tools
```

but effectively:

```text id="mcp43"
these are the intended exposed operational capabilities
```

An accidental seventh mutation-like tool should cause the smoke check to fail.

---

## 25. Annotation validation from the client side

The client verifies that every discovered tool reports:

```text id="mcp44"
readOnlyHint = true
destructiveHint = false
idempotentHint = true
```

This validates the contract from both ends:

```text id="mcp45"
server registration guard
+
client discovery assertion
```

---

## 26. Happy-path execution

The smoke test calls every exposed capability against:

```text id="mcp46"
ORD-1001
```

and expects all six to return successfully.

This proves more than server startup.

It proves that each registered MCP handler is wired to a functioning underlying domain capability.

---

## 27. Error-path execution

The smoke test also validates:

```text id="mcp47"
missing order
```

and:

```text id="mcp48"
invalid arguments
```

This demonstrates that both domain errors and protocol/schema errors survive the transport boundary correctly.

---

## 28. Current smoke guarantees

The MCP smoke test therefore proves:

```text id="mcp49"
protocol connectivity
tool discovery
six expected evidence capabilities
correct read-only annotations
absence of action capabilities
successful read execution
domain-error propagation
schema-validation behavior
```

That is the actual MCP integration contract.

---

## 29. Why not expose every investigator tool

The investigator has seven evidence sources.

MCP exposes six.

That is intentional.

Least privilege does not mean:

```text id="mcp50"
expose everything that is technically read-only
```

It means:

```text id="mcp51"
expose the capabilities appropriate to this boundary
```

Internal application traces are useful to the local investigator but do not need to become part of the externally discoverable operational interface.

---

## 30. Operational data versus implementation telemetry

The six MCP capabilities describe business-operational state:

```text id="mcp52"
orders
payments
fulfillment
delivery
notifications
business history
```

The processing trace describes implementation-level behavior:

```text id="mcp53"
handler execution
database timeout
provider request timing
application failure
```

Keeping these separate reduces unnecessary disclosure and preserves a cleaner protocol contract.

---

## 31. MCP and provenance

MCP responses still contain operational provenance such as:

```text id="mcp54"
observedAt
source
```

Those values retain their meaning after transport.

An MCP call therefore remains an operational observation with source provenance.

The protocol does not convert retrieved state into model-owned truth.

---

## 32. MCP observations remain T1 evidence

A model may gather an observation through MCP:

```text id="mcp55"
payment = CAPTURED
```

That observation can support investigation.

It still does not become execution-time authority.

Before mutation:

```text id="mcp56"
fresh deterministic reads
```

are required through the action layer.

Therefore:

```text id="mcp57"
MCP observation at T1
≠
authorization to mutate at T2
```

---

## 33. MCP does not participate in approvals

The MCP server does not expose:

```text id="mcp58"
approve_action
reject_action
consume_approval
```

Approval lifecycle belongs to the deterministic automation/action system.

This avoids turning an evidence protocol into an authorization control plane.

---

## 34. MCP does not participate in execution recovery

Crash recovery reasons over:

```text id="mcp59"
automation state
approval state
action execution audits
structured effects
fresh authoritative reads
```

It does not ask an MCP-connected model to decide whether an action should be replayed.

That recovery boundary remains deterministic.

---

## 35. Stdio transport

The current MCP demonstration uses stdio:

```text id="mcp60"
MCP client
   ↕
stdio
   ↕
MCP server
```

This keeps the protocol integration easy to run locally and inspect.

The transport is not an architectural commitment for production.

---

## 36. Production transport can change

A deployment could use a different supported MCP transport depending on its environment.

The important contract is not stdio itself.

It is:

```text id="mcp61"
same capability schemas
same read-only boundary
same least-privilege semantics
same domain behavior
```

Transport substitution should not change authorization semantics.

---

## 37. MCP is not the business API

The MCP server should not become the only interface to operational systems.

The same capability may be used:

```text id="mcp62"
directly by the local investigator
```

and:

```text id="mcp63"
through MCP by another compatible client
```

The capability abstraction sits below both.

Conceptually:

```text id="mcp64"
                 ToolCapability
                 /            \
                /              \
local investigator          MCP adapter
```

This keeps protocol concerns out of the domain implementation.

---

## 38. Why the registration remains explicit

The current server registers each capability explicitly.

That creates some repetition.

It also keeps:

```text id="mcp65"
capability
schema
annotations
handler
```

visibly connected under strict TypeScript types.

A generic registry abstraction could reduce lines, but it is not currently necessary.

Clarity at the security boundary is more valuable than abstraction density.

---

## 39. Adding another MCP capability

A future capability should be exposed only when it satisfies the protocol boundary.

The first questions should be:

```text id="mcp66"
Is it read-only?

Is it non-destructive?

Is repeated execution safe?

Does this external boundary actually need it?
```

Passing the first three conditions does not automatically imply the fourth.

---

## 40. Adding a mutation capability requires a different design

If the project ever wanted to expose mutations through MCP, simply registering the existing action executors would not be sufficient.

The protocol would need to preserve:

```text id="mcp67"
policy
authorization
approval correlation
fresh execution validation
audit
verification
recovery
```

Until such a design exists, mutation capabilities remain excluded.

---

## 41. Least privilege is structural

The MCP boundary demonstrates several layers of least privilege:

```text id="mcp68"
only selected capabilities exposed
        ↓
all exposed capabilities read-only
        ↓
no action capabilities
        ↓
no approval capabilities
        ↓
internal technical trace remains local
```

This is stronger than merely instructing a model:

```text id="mcp69"
"Please don't mutate anything."
```

---

## 42. Relationship to the investigation agent

The local investigation agent can reason over:

```text id="mcp70"
operational reads
+
internal processing trace
```

An MCP client receives the selected operational subset.

This demonstrates that tool surfaces can vary by trust boundary while still sharing the same underlying capability architecture.

---

## 43. Relationship to action safety

The MCP boundary stops before remediation execution.

The complete architecture remains:

```text id="mcp71"
MCP / operational capabilities
        ↓
evidence
        ↓
investigation
        ↓
grounded remediation
        ↓
deterministic policy
        ↓
approval if required
        ↓
audited execution
        ↓
verification
```

MCP occupies the evidence side of that boundary.

---

## 44. Security property

An MCP client with access only to this server can gather operational context but cannot use the server itself to create a consequential commerce side effect.

That is the intended security property.

It limits the blast radius of:

```text id="mcp72"
model mistake
client misuse
prompt injection
unexpected tool selection
```

at the MCP layer.

---

## 45. What MCP does not solve

MCP does not itself solve:

- authorization policy
- approval workflows
- action safety
- crash recovery
- execution idempotency
- knowledge grounding
- model hallucination
- workflow persistence

Those are separate architectural responsibilities.

Using MCP does not remove the need for them.

---

## 46. Design invariants

The MCP layer should preserve these rules:

```text id="mcp73"
MCP is a transport adapter, not the business-logic owner.

Existing capability schemas are reused.

The exposed surface is intentionally smaller than the full internal toolset.

Only operational read capabilities are exposed.

Every exposed capability is read-only.

Every exposed capability is non-destructive.

Every exposed capability is idempotent.

Registration fails if a capability violates those guarantees.

Consequential actions are not exposed through MCP.

Approval operations are not exposed through MCP.

Internal processing traces remain outside the public MCP surface.

Protocol validation and domain errors remain distinguishable.

MCP observations retain provenance.

MCP observations are evidence, not mutation authority.

Mutation policy remains deterministic and outside the protocol boundary.

Crash recovery remains deterministic and outside the protocol boundary.

Transport implementation may change without changing capability semantics.

Least privilege is enforced structurally, not only through prompt instructions.
```

---

## Related documentation

- `INVESTIGATION_AGENT.md` — how operational evidence is used during diagnosis
- `CONTEXT_AND_PROVENANCE.md` — observation provenance and authority
- `ACTION_SAFETY.md` — mutation authority intentionally kept outside MCP
- `AUTOMATION.md` — deterministic workflow coordination
- `CRASH_RECOVERY.md` — recovery semantics outside the protocol layer
- `EVALUATIONS.md` — MCP smoke and broader safety validation
- `PRODUCTION_ARCHITECTURE.md` — production deployment and process boundaries
