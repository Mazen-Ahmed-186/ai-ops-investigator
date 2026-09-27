# Context and Provenance

`ai-ops-investigator` treats model context as a projection of system knowledge, not as the system's source of truth.

This distinction matters because an operations agent reasons across:

- current operational observations
- historical durable state
- retrieved knowledge
- model-generated conclusions

Those things have different authority.

The system therefore preserves provenance explicitly instead of flattening everything into undifferentiated prompt text.

The central rule is:

```text
model remembers ≠ system knows
```

---

## 1. Why context needs a data model

A naive agent implementation often works like this:

```text
tool result
   ↓
append text to conversation
   ↓
model remembers it
   ↓
continue
```

That is convenient, but it creates several problems.

After enough steps:

- context grows continuously
- facts and interpretations become mixed together
- the model may not know which source established a claim
- stale observations may look current
- failed tool calls may be mistaken for evidence
- process restart becomes difficult
- provider conversation state becomes an accidental persistence mechanism

This project instead separates:

```text
raw durable history
        ↓
typed provenance
        ↓
projected working memory
        ↓
model context
```

The model receives the context it needs, while the system retains the underlying evidence independently.

---

## 2. Four provenance categories

The context model distinguishes four kinds of information:

```text
OBSERVATION
DURABLE_FACT
KNOWLEDGE
INFERENCE
```

They are intentionally not interchangeable.

---

## 3. Observation

An `OBSERVATION` is state read from an authoritative operational capability.

Examples:

```text
Order ORD-1001 is PROCESSING.
Payment PAY-1001 is CAPTURED.
Fulfillment attempt FUL-1001 is SUCCEEDED.
Notification NOT-4001 is FAILED.
```

An observation answers:

> What did an operational source report when we looked?

Observations normally originate from successful tool calls such as:

```text
get_order
get_payment_state
get_fulfillment_attempts
get_delivery_state
get_notification_state
get_order_event_history
get_order_processing_trace
```

They include provenance identifying the source and observation time.

Conceptually:

```text
kind: OBSERVATION
source: commerce_repository
observedAt: ...
```

An observation is evidence.

It is not automatically timeless truth.

---

## 4. `observedAt` is not `executedAt`

Tool execution history records when the investigator invoked a capability.

Operational payloads separately record when that source was observed.

For example:

```text
tool execution:
executedAt = 12:00:00.120

payload:
observedAt = 12:00:00.118
```

These fields describe different facts.

`executedAt` means:

> When did this investigator execute the tool?

`observedAt` means:

> When was this operational state observed by the tool?

The provenance projection uses the payload's observation timestamp when representing the operational fact.

It does not rewrite observation time using the orchestration timestamp.

This prevents infrastructure metadata from silently changing the meaning of evidence.

---

## 5. Successful reads become observations

A successful operational tool response may contribute facts to working memory.

For example:

```json
{
  "ok": true,
  "data": {
    "order": {
      "id": "ORD-1001",
      "status": "PROCESSING"
    },
    "observedAt": "...",
    "source": "commerce_repository"
  }
}
```

can become an observation such as:

```text
Order ORD-1001 is PROCESSING.
```

with its source and observation timestamp preserved.

The full raw tool execution remains durable separately.

Working memory is a projection of that history, not a replacement for it.

---

## 6. Failed tool calls are not observations

A failed tool invocation is durable execution history, but it does not become a successful observation of business state.

For example:

```json
{
  "ok": false,
  "error": {
    "code": "ORDER_NOT_FOUND"
  }
}
```

must not be transformed into an observation claiming some unrelated operational state.

The system distinguishes:

```text
tool was called
```

from:

```text
tool established a fact
```

That distinction protects the evidence chain.

---

## 7. Durable fact

A `DURABLE_FACT` is state owned by the investigator or automation system itself and persisted independently of the model.

Examples include facts such as:

```text
Investigation RUN-... executed get_order.
Approval APR-... is CONSUMED.
Execution ACT-... has status EXECUTED.
Automation AUTO-... is VERIFYING.
```

These are different from observations of the commerce domain.

An observation might say:

```text
Fulfillment attempt FUL-NEW-1 is PENDING.
```

A durable fact might say:

```text
Action execution ACT-1 recorded
FULFILLMENT_ATTEMPT_CREATED
with attemptId FUL-NEW-1.
```

The first comes from operational state.

The second comes from the investigator's own durable workflow state.

Both may be relevant, but their provenance is different.

---

## 8. Knowledge

`KNOWLEDGE` represents retrieved operational guidance.

In this project, knowledge primarily comes from runbooks.

Examples:

```text
RUNBOOK-DB-TIMEOUT
RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE
RUNBOOK-UNKNOWN-FULFILLMENT
RUNBOOK-NOTIFICATION-FAILURE
```

Knowledge answers questions such as:

> What does the organization say should happen in this class of incident?

It does not answer:

> What is happening to this particular order right now?

For example:

```text
RUNBOOK-UNKNOWN-FULFILLMENT says not to retry
after an ambiguous provider-side-effect boundary.
```

is knowledge.

```text
ORD-3001 currently has fulfillment status UNKNOWN.
```

is an observation.

The remediation layer combines those two classes deliberately.

---

## 9. Inference

`INFERENCE` represents a conclusion produced through reasoning rather than directly returned by an authoritative source.

For example:

```text
The stale PROCESSING state is a symptom of
the persistence failure rather than the primary failure.
```

is an inference derived from multiple observations.

Likewise:

```text
The notification failure is independent of
the order-state persistence failure.
```

is a conclusion justified by the available evidence.

Inference is useful and necessary.

It simply must not masquerade as directly observed state.

---

## 10. The authority hierarchy

The four provenance classes answer different questions:

| Kind           | Meaning                                               | Example                                               |
| -------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `OBSERVATION`  | What an authoritative operational source reported     | `Payment is CAPTURED`                                 |
| `DURABLE_FACT` | What the investigator/workflow system durably records | `Approval is CONSUMED`                                |
| `KNOWLEDGE`    | Retrieved operational guidance                        | `Unknown fulfillment must be reconciled before retry` |
| `INFERENCE`    | A reasoned conclusion                                 | `The database timeout explains the stale order state` |

They should not be flattened into one category called "facts."

In particular:

```text
INFERENCE ≠ OBSERVATION
```

and:

```text
KNOWLEDGE ≠ CURRENT STATE
```

---

## 11. Raw history versus working memory

The investigation keeps its raw tool-execution history.

Conceptually:

```text
toolExecutions = [
  {
    sequence,
    tool,
    arguments,
    result,
    executedAt
  }
]
```

This history is valuable for:

- auditability
- crash recovery
- duplicate-call prevention
- debugging
- evaluation
- provenance reconstruction

But continually replaying the entire raw history into the model would cause context growth.

The project therefore also maintains compact working memory.

---

## 12. Working memory is a projection

After tool execution, the system computes:

```text
projectWorkingMemory(state)
```

rather than asking the model to maintain its own hidden memory.

Working memory contains compact investigation state such as:

```text
facts
unresolvedQuestions
```

Its purpose is to retain the important operational picture without repeatedly injecting every raw response.

The architecture is:

```text
durable tool history
        ↓
deterministic projection
        ↓
working memory
        ↓
model context
```

not:

```text
model conversation
        ↓
hope important facts remain salient
```

---

## 13. Projection does not destroy provenance

Compaction must not mean losing the source of truth.

The compact representation exists alongside the durable raw history.

If a projected fact says:

```text
Payment is CAPTURED.
```

the system still retains the tool execution that established it:

```text
tool = get_payment_state
arguments = { orderId: ... }
result = ...
executedAt = ...
```

and the payload retains:

```text
observedAt
source
```

The projection is therefore reproducible.

---

## 14. Why this matters for long-running agents

Without projection, agent context grows approximately with the entire interaction history:

```text
step 1 context
+
step 2 context
+
step 3 context
+
...
```

Over time this creates:

- larger prompts
- increasing latency
- increasing token consumption
- duplicated evidence
- reduced signal-to-noise ratio

A compact state model changes the relationship:

```text
durable history can grow
while
active model context stays bounded
```

The full history remains available to the system without requiring every byte to remain inside the model prompt.

---

## 15. Current state and historical evidence are different

Operational observations are timestamped because system state changes.

Suppose an investigation observed:

```text
12:00
Notification NOT-1 = FAILED
```

Later, a retry may create:

```text
12:10
Notification NOT-2 = PENDING
```

The earlier observation is still historically valid.

It is simply not the current effective state.

This distinction matters throughout the project:

```text
historically true
≠
currently true
```

The same principle applies to:

- order state
- fulfillment attempts
- approvals
- execution records
- notification attempts

---

## 16. Current truth must be re-read before writes

Observations gathered during investigation are evidence for diagnosis.

They are not sufficient authorization for a later mutation.

Between:

```text
investigation
```

and:

```text
execution
```

the system may have changed.

Therefore action executors perform fresh deterministic reads before mutation.

For example:

```text
investigation observed:
order PROCESSING
fulfillment SUCCEEDED
delivery DELIVERED
```

does not mean the executor may later assume those conditions remain true.

At execution time it reads current authoritative state again.

This is the system's T1/T2 distinction:

```text
T1: observation used for reasoning
T2: fresh state used for execution safety
```

T1 evidence can justify a recommendation.

T2 evidence determines whether the action is still safe.

---

## 17. Model context is not write authority

The model may have seen:

```text
Order is PROCESSING.
Payment is CAPTURED.
Fulfillment CONFIRMED_FAILED.
```

That does not give it mutation authority.

Even if all those facts were correct when observed, the action layer does not accept:

```text
the model remembers these facts
```

as execution-time validation.

The model context is used for reasoning.

The deterministic system owns writes.

---

## 18. Continuation during a live investigation

During a normal uninterrupted investigation, the model provider can continue efficiently using provider response state.

The durable investigation records continuation metadata such as:

```text
kind: TOOL_OUTPUT
previousResponseId
callId
output
```

During the live process, this allows the next model step to continue from the previous response.

That is an optimization.

It is not the persistence model.

---

## 19. Provider response IDs are disposable

A `previousResponseId` belongs to model-provider conversation machinery.

It is not an authoritative system record.

The system therefore does not rely on it as the only way to resume an investigation.

If the process disappears, the next worker may not have usable provider-side conversational state.

Recovery must still be possible.

The durable system owns:

```text
goal
tool history
working memory
tool-call signatures
assessment state
run lifecycle
```

Those are sufficient to reconstruct what the next model invocation needs.

---

## 20. Resume reconstructs context

On resume, the system reloads the persisted investigation run.

It then rebuilds model input from durable state rather than assuming the original provider conversation still exists.

Conceptually:

```text
persisted investigation
        ↓
build reconstructed investigation input
        ↓
compact working memory
        +
relevant durable history
        ↓
fresh model request
```

This gives the resumed model the information needed to continue while preserving system-owned state.

---

## 21. Resume deliberately discards provider dependency

The safety requirement is not:

```text
resume exactly the same hidden model conversation
```

It is:

```text
resume the same investigation
from the same durable evidence
without repeating completed work
```

These are different goals.

A new model invocation can continue safely if the system reconstructs the relevant context correctly.

That makes provider conversation continuity optional rather than architectural.

---

## 22. Duplicate prevention survives restart

The investigation persists signatures for completed tool calls.

Conceptually:

```text
{
  name: "get_order",
  arguments: {
    orderId: "ORD-1001"
  }
}
```

After restart, those signatures are reconstructed into the runtime duplicate-call set.

Therefore a restarted model cannot simply forget that a tool was already called and consume the remaining budget by repeating it.

This is an example of why durable system memory matters more than model memory.

---

## 23. Crash boundary

Tool progress is persisted after successful execution and before the next model step.

The sequence is:

```text
execute tool
    ↓
record tool execution
    ↓
project working memory
    ↓
record continuation
    ↓
persist investigation
    ↓
next model request
```

If the process crashes after persistence:

```text
completed evidence remains known
```

even though:

```text
the model process disappeared
```

A resumed investigation does not need to rediscover that evidence blindly.

---

## 24. Completed investigations are terminal knowledge artifacts

When the model produces a valid final assessment:

```text
state.status = COMPLETED
state.assessment = validated assessment
state.continuation = null
```

The completed result becomes durable investigation state.

Calling resume on that run returns the existing assessment.

It does not ask the model to diagnose the same incident again.

This preserves run identity and avoids introducing unnecessary stochastic variation after completion.

---

## 25. Context projection is not automatic truth promotion

One subtle risk in agent systems is allowing something to become "true" merely because it appeared in prior model text.

This project does not treat arbitrary model prose as an observation.

For example, if a model says:

```text
The provider probably processed the request.
```

that sentence does not become:

```text
OBSERVATION:
provider processed request
```

A fact enters observational context only through the appropriate trusted path.

This protects the system against self-reinforcing hallucinations.

---

## 26. Inference remains attributable

Inference is not prohibited.

The investigator must infer root cause from evidence.

The requirement is that inference remain distinguishable from evidence.

For example:

```text
OBSERVATION
Order = PROCESSING

OBSERVATION
Fulfillment = SUCCEEDED

OBSERVATION
Delivery = DELIVERED

OBSERVATION
Database operation timed out before status persistence

INFERENCE
The database timeout caused the stale order state.
```

That reasoning chain is inspectable.

Flattening all five lines into untyped "memory" would make the distinction much harder to audit.

---

## 27. Knowledge also requires provenance

Runbooks influence remediation decisions.

Therefore a recommendation should not merely say:

```text
Retry the notification.
```

It should retain the knowledge source that supports the recommendation:

```text
supportedByRunbookIds = [
  "RUNBOOK-NOTIFICATION-FAILURE"
]
```

Likewise, retrieval records which runbooks were actually available to the remediation model.

This allows later inspection of:

```text
what the model recommended
```

against:

```text
what knowledge it had retrieved
```

The detailed retrieval and grounding pipeline is covered in `RAG_AND_RUNBOOKS.md`.

---

## 28. Structured execution effects are durable facts

The same provenance principle continues beyond investigation.

Suppose an action audit contains:

```text
reason:
"Created a replacement fulfillment attempt."
```

That prose is human-readable explanation.

It is not authoritative machine state.

The durable structured effect is:

```text
kind = FULFILLMENT_ATTEMPT_CREATED
attemptId = FUL-NEW-1
attemptStatus = PENDING
```

Recovery and verification use the structured effect.

They do not parse the prose.

This keeps reasoning text separate from state-machine facts.

---

## 29. Provenance across the system

The overall information flow can be represented as:

```text
Authoritative system
        ↓
     OBSERVATION
        ↓
investigation reasoning
        ↓
      INFERENCE
        ↓
structured diagnosis
        ↓
retrieved runbooks
        ↓
      KNOWLEDGE
        ↓
grounded remediation
        ↓
policy / approval / execution
        ↓
    DURABLE_FACT
        ↓
fresh authoritative verification
        ↓
     OBSERVATION
```

Each transition preserves where information came from.

---

## 30. Why not put everything in the prompt?

The project deliberately avoids treating the context window as a database.

A context window is useful for:

- reasoning
- synthesis
- selecting the next tool
- interpreting evidence

It is not the right mechanism for:

- durable workflow state
- authorization
- concurrency control
- audit logs
- crash recovery
- exactly-once approval consumption
- execution correlation

Those belong to deterministic application state.

---

## 31. Current implementation boundary

The project currently demonstrates these semantics with lightweight infrastructure:

```text
FileInvestigationStore
in-memory workflow stores
evaluation persistence
deterministic fixture repositories
```

The production implementation would replace these adapters with durable storage while preserving the same contracts.

The important architectural boundary is:

```text
storage adapter can change
provenance semantics do not
```

Production persistence requirements are described in `PRODUCTION_ARCHITECTURE.md`.

---

## 32. Context and safety

This provenance model directly supports safety.

Without it, the system could incorrectly do things such as:

```text
old observation
→ assumed current
→ mutation
```

or:

```text
model inference
→ treated as system fact
→ mutation
```

or:

```text
ambiguous execution prose
→ interpreted as known success
→ unsafe recovery
```

Instead:

```text
reasoning context
≠
execution authority
```

and:

```text
historical evidence
≠
fresh state
```

remain explicit system invariants.

---

## 33. Design invariants

The context layer should preserve these rules:

```text
Model context is a projection, not authority.

Raw tool history remains durable.

Working memory is derived from durable history.

Successful tool results may produce observations.

Failed tool calls do not become successful observations.

Observation time comes from the observed payload.

Tool execution time and observation time are distinct.

Inference does not become observation merely because the model stated it.

Knowledge does not become current operational state.

Historical truth does not imply current truth.

Execution performs fresh reads instead of trusting investigation memory.

Provider conversation state is disposable.

A restart reconstructs context from durable state.

Completed tool calls remain known after restart.

Completed investigations are not re-diagnosed on resume.

Structured machine effects drive recovery; prose does not.

Model remembers ≠ system knows.
```

---

## Related documentation

- `INVESTIGATION_AGENT.md` — evidence gathering and diagnostic reasoning
- `RAG_AND_RUNBOOKS.md` — knowledge retrieval and runbook provenance
- `REMEDIATION.md` — grounded recommendation generation
- `ACTION_SAFETY.md` — fresh-state validation, approvals, execution, and verification
- `CRASH_RECOVERY.md` — durable recovery after process loss
- `OBSERVABILITY.md` — telemetry and model/runtime measurements
- `PRODUCTION_ARCHITECTURE.md` — durable production storage and concurrency boundaries
