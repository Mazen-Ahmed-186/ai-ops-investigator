# Investigation Agent

The investigation agent is the evidence-gathering layer of `ai-ops-investigator`.

Its responsibility is narrow:

> Given an operational incident, gather authoritative evidence, distinguish symptoms from causes, and produce a structured diagnosis.

It does **not** decide whether a remediation is allowed, request human approval, or mutate operational state.

Those responsibilities belong to later layers.

---

## 1. Why an agent is used here

Operational incidents do not always follow a fixed investigation path.

An order that appears stuck in `PROCESSING` may require checking:

- current order state
- payment state
- fulfillment attempts
- entitlement and account delivery
- notification state
- business event history
- application processing traces

The correct next question depends on the evidence already observed.

A deterministic workflow could query every source every time, but that would encode one fixed investigation path and make the diagnostic process unnecessarily rigid.

The agent is used for the part that benefits from adaptive reasoning:

```text
observe
   ↓
decide what evidence is missing
   ↓
query a narrowly scoped tool
   ↓
update working context
   ↓
repeat or diagnose
```

The system remains deterministic around the agent:

- tool implementations are code
- tool schemas are code
- duplicate-call prevention is code
- tool budgets are code
- persistence is code
- the final output must satisfy a structured schema

The model decides **what evidence to inspect next**, not what arbitrary code to execute.

---

## 2. Investigation flow

A new investigation begins with an operational goal such as:

```text
Determine why order ORD-1001 is stuck.
```

The lifecycle is approximately:

```text
create durable run
       ↓
build model context
       ↓
model requests evidence
       ↓
validate tool call
       ↓
execute registered read tool
       ↓
persist result
       ↓
project working memory
       ↓
continue investigation
       ↓
structured assessment
       ↓
COMPLETED
```

If the model cannot establish the cause safely, the correct outcome is not to guess.

It should return an assessment indicating that more evidence is required.

---

## 3. Evidence tools

The investigator currently has seven narrowly scoped read capabilities.

### `get_order`

Returns the current high-level order state.

Typical use:

```text
Is the order still PROCESSING?
Is it already FULFILLED?
Has its state changed since the incident began?
```

It deliberately does not collapse payment, fulfillment, delivery, and notification state into the order response.

---

### `get_payment_state`

Returns payment state for the order.

Typical questions:

```text
Was payment captured?
Did payment fail?
Was payment refunded?
```

Payment success is evidence that an order may proceed, but it does not prove fulfillment or delivery.

---

### `get_fulfillment_attempts`

Returns fulfillment attempts and their current outcomes.

This is critical for distinguishing:

```text
SUCCEEDED
```

from:

```text
CONFIRMED_FAILED
```

and from:

```text
UNKNOWN
```

Those states have materially different safety implications later in the system.

---

### `get_delivery_state`

Returns entitlement and authenticated account-delivery state.

The project treats successful provider fulfillment and successful customer delivery as separate facts.

A fulfilled order requires the relevant entitlement to be active and account delivery to have succeeded.

---

### `get_notification_state`

Returns customer-notification state.

Notifications are deliberately separate from fulfillment and delivery.

For example:

```text
order FULFILLED
delivery DELIVERED
email FAILED
```

is a notification incident, not a failed fulfillment.

---

### `get_order_event_history`

Returns chronological business events.

This tool answers:

```text
How did the order reach its current business state?
```

It is useful when current-state reads expose an inconsistency but do not explain how it occurred.

Business history is different from low-level execution telemetry.

---

### `get_order_processing_trace`

Returns technical execution evidence for the order-processing path.

This is used when business history establishes that an expected transition did not occur but does not explain why.

Examples include:

```text
ORDER_STATUS_UPDATE_ATTEMPTED
DATABASE_TIMEOUT
ORDER_COMPLETION_HANDLER_FAILED
```

or:

```text
PROVIDER_REQUEST_TIMED_OUT
PROVIDER_OUTCOME_UNCONFIRMED
```

Unlike the six operational read capabilities, this internal technical trace is intentionally not part of the public MCP surface.

---

## 4. Tools are intentionally narrow

The tools are not designed as large convenience APIs such as:

```text
get_everything_about_order
```

That would make the model's evidence path harder to inspect and would blur domain boundaries.

Instead:

```text
order
payment
fulfillment
delivery
notification
history
technical trace
```

remain separate.

This gives the agent explicit choices and makes tool behavior measurable.

It also lets evaluations detect whether the model gathered evidence that was actually relevant to the diagnosis.

---

## 5. Authoritative evidence only

The investigator is instructed to use only:

- information supplied in the incident
- information returned by registered tools

It must not invent application state.

For example, observing:

```text
order = PROCESSING
fulfillment = SUCCEEDED
```

does not allow the model to invent:

```text
database write failed
```

A database failure may only become part of the diagnosis if authoritative evidence establishes it.

This distinction is fundamental:

```text
plausible explanation
≠
observed system fact
```

---

## 6. ISSUE versus EVIDENCE

Every investigation finding is classified as either:

```text
ISSUE
```

or:

```text
EVIDENCE
```

An `ISSUE` is an observed problem.

An `EVIDENCE` finding supports or constrains the diagnosis.

For the stale-order incident, for example:

```text
ORDER_STATE
ISSUE
Order remains PROCESSING.
```

while:

```text
PAYMENT
EVIDENCE
Payment is CAPTURED.
```

and:

```text
FULFILLMENT
EVIDENCE
Fulfillment SUCCEEDED.
```

These facts matter because they eliminate other explanations.

A successful payment is not itself the root cause.

Successful fulfillment is not itself the root cause.

They help establish what did **not** fail.

---

## 7. Symptoms are not automatically root causes

A central investigation rule is:

> Choose the root-cause category for the established causal failure, not merely for the business object whose state is incorrect.

Consider:

```text
order remains PROCESSING
```

That is an `ORDER_STATE` issue.

But if technical evidence establishes:

```text
PROCESSING → FULFILLED attempted
database operation timed out
transition was not persisted
```

then the diagnosis is:

```text
rootCauseCategory = INFRASTRUCTURE
```

not:

```text
rootCauseCategory = ORDER_STATE
```

The incorrect order state is the symptom.

The persistence failure explains why that symptom exists.

`ORDER_STATE` should be the root cause only when the lifecycle or state-transition logic itself is established as the primary failure and no more specific underlying operational cause is known.

---

## 8. Operational category beats technical location

The model also must not classify incidents solely according to the technical boundary where an error surfaced.

For example:

```text
external fulfillment provider
        ↓
request timeout
        ↓
fulfillment attempt UNKNOWN
```

The timeout occurred at an external dependency boundary.

However, the operational problem is the unresolved fulfillment outcome.

The correct category is therefore:

```text
FULFILLMENT
```

rather than automatically:

```text
DEPENDENCY
```

`DEPENDENCY` is reserved for cases where the external dependency itself is the primary operational problem and no more specific business-domain category applies.

This prevents infrastructure terminology from obscuring the business workflow that actually requires attention.

---

## 9. Known failure versus unknown outcome

The investigator explicitly distinguishes:

```text
CONFIRMED_FAILED
```

from:

```text
UNKNOWN
```

This distinction matters even before remediation begins.

### Confirmed failure

Example:

```text
provider explicitly rejected fulfillment
no entitlement issued
attempt = CONFIRMED_FAILED
```

The operational cause is known.

The investigator can produce:

```text
DIAGNOSIS_READY
rootCauseCategory = FULFILLMENT
requiresMoreEvidence = false
```

The private internal reason inside the external provider does not need to be known if the provider's authoritative terminal failure already explains why the workflow stopped.

---

### Unknown outcome

Example:

```text
provider request sent
timeout occurred after possible side-effect boundary
provider outcome unconfirmed
attempt = UNKNOWN
```

The diagnosis may still be ready:

```text
DIAGNOSIS_READY
rootCauseCategory = FULFILLMENT
requiresMoreEvidence = false
```

because the operational incident itself is established:

> Fulfillment is unresolved because the external operation has an unknown outcome.

`requiresMoreEvidence = false` does **not** mean the provider outcome is known.

It means the system has enough evidence to correctly characterize the incident.

This distinction becomes critical during remediation, where an unknown outcome must not be treated like a confirmed failure.

---

## 10. Independent failures remain independent

The agent must not invent causal relationships between separate observed failures.

For example:

```text
database timeout
+
email notification failure
```

does not imply:

```text
email failure caused order persistence failure
```

unless evidence explicitly establishes that relationship.

This allows one investigation to contain multiple issues while still identifying the correct primary root cause.

For `ORD-1001`, both are true:

```text
ORDER_STATE issue
NOTIFICATION issue
```

but the established cause of the stuck order is:

```text
INFRASTRUCTURE
```

The failed notification remains a separate issue.

---

## 11. Evidence escalation

The agent should prefer the least invasive source capable of resolving the current uncertainty.

A typical investigation may progress like:

```text
current order
      ↓
payment
      ↓
fulfillment
      ↓
delivery
      ↓
business history
      ↓
technical trace if still needed
```

This is not a mandatory fixed sequence.

The agent may choose a different order when the current evidence makes another source more relevant.

The important rule is:

> If an available unqueried tool can materially reduce uncertainty, use it before finalizing a diagnosis.

At the same time, unnecessary evidence gathering should stop once the operational cause is established.

---

## 12. Stopping criteria

The investigation should stop with `DIAGNOSIS_READY` when the available authoritative evidence establishes the operational cause strongly enough to explain the incident.

It should not continue querying merely to obtain every possible detail.

For example, a provider's authoritative terminal failure is sufficient to diagnose fulfillment failure even if the provider's private internal implementation error is unavailable.

Conversely, when the current evidence supports only hypotheses, the investigation should indicate that more evidence is required rather than promoting one hypothesis to fact.

The distinction is:

```text
enough evidence to explain the incident
→ DIAGNOSIS_READY
```

versus:

```text
multiple material explanations remain unresolved
→ requiresMoreEvidence
```

---

## 13. Structured assessment

A completed investigation produces a structured assessment rather than unrestricted prose.

Conceptually:

```text
diagnosisStatus
rootCauseCategory
confidence
summary
findings[]
requiresMoreEvidence
```

A representative result is:

```json
{
  "diagnosisStatus": "DIAGNOSIS_READY",
  "rootCauseCategory": "INFRASTRUCTURE",
  "confidence": "HIGH",
  "summary": "The completion transition was not persisted because the database operation timed out.",
  "findings": [
    {
      "category": "ORDER_STATE",
      "kind": "ISSUE",
      "summary": "The order remains PROCESSING."
    },
    {
      "category": "PAYMENT",
      "kind": "EVIDENCE",
      "summary": "Payment is CAPTURED."
    },
    {
      "category": "FULFILLMENT",
      "kind": "EVIDENCE",
      "summary": "Fulfillment SUCCEEDED."
    }
  ],
  "requiresMoreEvidence": false
}
```

The actual assessment is schema validated before it becomes trusted application data.

Structured output validity is necessary, but it does not by itself prove that the diagnosis is semantically or factually correct.

Those are separate evaluation concerns.

---

## 14. Tool-call budget

The investigation has a bounded tool budget.

Current evaluations require:

```text
tool calls <= 8
```

The budget prevents an agent from turning uncertainty into an unbounded loop.

If the model exceeds the allowed tool count, the investigation terminates with:

```text
TOOL_BUDGET_EXHAUSTED
```

rather than silently continuing.

This makes cost and behavior bounded by system policy rather than model discretion.

---

## 15. Duplicate-call prevention

The runtime records signatures for executed calls using the tool name and normalized arguments.

If the model attempts to invoke the same tool again with identical arguments without an explicit retry condition, the run terminates with:

```text
REPEATED_TOOL_CALL
```

This prevents loops such as:

```text
get_order(ORD-1001)
get_order(ORD-1001)
get_order(ORD-1001)
...
```

from consuming the remaining budget without gathering new evidence.

Duplicate prevention is enforced in code, not merely requested in the model instructions.

---

## 16. Durable progress

After a successful tool execution, the investigation persists:

```text
tool execution
tool result
tool-call signature
updated working memory
continuation state
```

before proceeding.

This is important because a model loop should not exist only inside one process invocation.

If the process crashes after a tool call, the evidence already gathered remains durable.

The run can later be resumed from persisted investigation state.

---

## 17. Resume semantics

A resumed investigation does not simply assume that the previous model process still exists.

The system reloads its durable investigation state and reconstructs the context required to continue.

A completed run is returned directly rather than executed again.

A failed or otherwise invalid lifecycle state cannot silently restart as a new investigation.

This makes investigation identity explicit:

```text
same run ID
same durable evidence history
same tool-call history
same investigation goal
```

rather than:

```text
start another model conversation and hope it remembers
```

The detailed context reconstruction and provenance model is documented separately in `CONTEXT_AND_PROVENANCE.md`.

---

## 18. Model continuation is not durable authority

During a live run, provider response identifiers may be useful for efficient continuation.

They are not the source of truth.

The durable investigation record contains the evidence needed to reconstruct a safe context after restart.

This preserves the broader system rule:

```text
model remembers ≠ system knows
```

Provider conversation state is an optimization.

Persisted system facts are authority.

---

## 19. Failure behavior

Investigation failures are persisted.

A runtime exception does not leave the investigation silently appearing active.

The run transitions to a failed state with a durable failure reason.

Special control outcomes such as:

```text
TOOL_BUDGET_EXHAUSTED
REPEATED_TOOL_CALL
```

remain distinguishable from successful diagnosis.

This distinction matters for observability and evaluation:

```text
agent failed to finish
```

is different from:

```text
agent finished with an incorrect diagnosis
```

and both are different from a later:

```text
unsafe state mutation
```

---

## 20. What the investigation agent cannot do

The investigator has no authority to:

- reconcile an order
- retry a notification
- create a fulfillment attempt
- issue a refund
- cancel an order
- approve an action
- consume an approval

Its output is information:

```text
structured diagnosis
```

not authority:

```text
permission to mutate
```

That separation is intentional.

The architecture is:

```text
investigator
     ↓
what happened?

remediation
     ↓
what operational action would address it?

policy
     ↓
is that action allowed?

approval
     ↓
does a human need to authorize it?

executor
     ↓
perform the exact allowed action

verification
     ↓
did authoritative state actually change as expected?
```

The LLM participates heavily in the first two questions.

It does not own the remaining safety boundaries.

---

## 21. Proven investigation cases

The live evaluation set currently demonstrates four different diagnostic situations.

### Stale completed order

```text
ORD-1001

payment CAPTURED
fulfillment SUCCEEDED
delivery DELIVERED
order still PROCESSING
database timeout during completion transition

→ INFRASTRUCTURE
```

The stale order state is an issue; the database persistence failure is the established cause.

---

### Confirmed fulfillment failure

```text
ORD-2001

payment CAPTURED
fulfillment CONFIRMED_FAILED
no entitlement
no delivery

→ FULFILLMENT
```

The provider's terminal failure is enough to establish the operational diagnosis.

---

### Unknown fulfillment outcome

```text
ORD-3001

payment CAPTURED
provider request crossed possible side-effect boundary
request timed out
fulfillment UNKNOWN

→ FULFILLMENT
```

The outcome is unknown, but the nature of the operational incident is known.

---

### Notification-only failure

```text
ORD-4001

payment CAPTURED
fulfillment SUCCEEDED
entitlement ACTIVE
delivery DELIVERED
order FULFILLED
notification FAILED

→ NOTIFICATION
```

The failed notification does not contaminate the already-successful commerce path.

---

## 22. Design invariants

The investigation layer should preserve these rules:

```text
Use authoritative evidence.

Do not invent application state.

Observed issue ≠ root cause.

Technical error location ≠ operational category.

Confirmed external failure can be a sufficient operational boundary.

Unknown business outcome can still have a known diagnosis.

Do not invent causal relationships between independent failures.

Gather more evidence when material uncertainty remains.

Stop when the operational cause is sufficiently established.

Tool use is bounded.

Identical tool calls are not repeated blindly.

Successful observations are persisted before continuation.

Resume from durable state, not model memory.

Structured output is validated before downstream use.

Investigation produces diagnosis, never mutation authority.
```

---

## Related documentation

- `CONTEXT_AND_PROVENANCE.md` — durable facts, observations, inference, working-memory projection, and context reconstruction
- `RAG_AND_RUNBOOKS.md` — operational knowledge retrieval
- `REMEDIATION.md` — converting diagnosis into grounded remediation
- `ACTION_SAFETY.md` — policy, approval, execution, and verification
- `OBSERVABILITY.md` — investigation telemetry and regression detection
- `EVALUATIONS.md` — live and deterministic evaluation methodology
- `PRODUCTION_ARCHITECTURE.md` — production persistence and process boundaries
