# Remediation

The remediation layer converts a completed investigation into a grounded operational recommendation.

Its responsibility is:

> Given a structured diagnosis and retrieved operational knowledge, determine what should happen next without deciding whether that action is authorized to execute.

The remediation layer sits between investigation and deterministic action safety:

```text
investigation
      ↓
structured diagnosis
      ↓
runbook retrieval
      ↓
remediation
      ↓
structured operational intent
      ↓
deterministic policy
      ↓
approval / execution / verification
```

The model may recommend an action.

It does not grant itself permission to perform that action.

---

## 1. Why remediation is a separate layer

Diagnosis and remediation are different reasoning problems.

Investigation asks:

```text
What happened?
```

Remediation asks:

```text
Given what happened and the relevant runbooks,
what operational response is appropriate?
```

For example:

```text
diagnosis:
FULFILLMENT
attempt = CONFIRMED_FAILED
```

does not by itself define the next action.

The system must also consider operational knowledge such as:

```text
RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE
```

before producing a recommendation.

Keeping the phases separate makes it possible to independently evaluate:

- diagnostic correctness
- retrieval quality
- remediation quality
- grounding quality
- policy correctness
- execution safety

---

## 2. Inputs

A remediation run is based on two primary inputs:

```text
structured investigation assessment
+
retrieved runbooks
```

The investigation supplies facts such as:

```text
rootCauseCategory = FULFILLMENT
requiresMoreEvidence = false
```

along with findings that explain the incident.

The retrieval layer supplies operational knowledge such as:

```text
RUNBOOK-UNKNOWN-FULFILLMENT
```

or:

```text
RUNBOOK-DB-TIMEOUT
```

The model must reason within those boundaries.

---

## 3. Structured output

Remediation does not return unrestricted prose.

A completed recommendation contains:

```text
status
summary
actions[]
```

Each action contains:

```text
disposition
actionKind
instruction
supportedByRunbookIds
```

Conceptually:

```json
{
  "status": "RECOMMENDATION_READY",
  "summary": "The order state should be reconciled without repeating fulfillment.",
  "actions": [
    {
      "disposition": "PRIMARY",
      "actionKind": "RECONCILE_ORDER_STATE",
      "instruction": "Reconcile the stale completed order state.",
      "supportedByRunbookIds": ["RUNBOOK-DB-TIMEOUT"]
    }
  ]
}
```

The structured form is what downstream deterministic code consumes.

---

## 4. Action dispositions

Remediation actions use three dispositions:

```text
PRIMARY
FOLLOW_UP
CONSTRAINT
```

They represent different operational meanings.

---

## 5. `PRIMARY`

`PRIMARY` identifies the next executable action that directly addresses the diagnosed incident.

Examples:

```text
RECONCILE_ORDER_STATE
```

for a stale completed order, or:

```text
CREATE_FULFILLMENT_ATTEMPT
```

after a confirmed terminal fulfillment failure.

A remediation should have at most one executable primary action.

The primary action answers:

> If the system can safely act on this incident now, what is the principal next action?

It does not mean that execution is automatically allowed.

The action still goes through deterministic policy.

---

## 6. `FOLLOW_UP`

`FOLLOW_UP` represents a valid secondary executable action that does not define the primary recovery path.

For example, an incident might contain:

```text
primary issue:
stale order state

secondary issue:
failed customer notification
```

A remediation could therefore distinguish:

```text
PRIMARY
RECONCILE_ORDER_STATE
```

from:

```text
FOLLOW_UP
RETRY_NOTIFICATION
```

This prevents unrelated secondary failures from taking over the main incident response.

---

## 7. `CONSTRAINT`

`CONSTRAINT` represents operational guidance that is important but not itself executable.

For constraints:

```text
actionKind = null
```

Examples include:

```text
Do not retry fulfillment while the existing attempt is UNKNOWN.
```

```text
Provider state must be reconciled before any replacement attempt.
```

```text
Notification recovery must not trigger payment or fulfillment.
```

A constraint may prevent action entirely.

That is a valid remediation outcome.

---

## 8. Executable action kinds

The current action vocabulary is deliberately small.

Supported action kinds are:

```text
RECONCILE_ORDER_STATE
RETRY_NOTIFICATION
CREATE_FULFILLMENT_ATTEMPT
ISSUE_REFUND
CANCEL_ORDER
```

These names represent exact capabilities understood by the deterministic action layer.

They are not free-form labels.

A recommendation cannot invent:

```text
RETRY_PROVIDER
```

or:

```text
FIX_ORDER
```

and assume the executor will interpret it.

---

## 9. Capability names are semantic contracts

An action kind describes one specific capability.

For example:

```text
RECONCILE_ORDER_STATE
```

means reconciliation of stale order lifecycle state.

It does not mean:

```text
reconcile any kind of operational inconsistency
```

Similarly:

```text
CREATE_FULFILLMENT_ATTEMPT
```

means creating a new fulfillment attempt.

It does not mean:

```text
repair an existing unknown attempt
```

This distinction is essential for safety.

---

## 10. Natural-language similarity is not capability equivalence

A model may encounter language such as:

```text
reconcile provider state
```

while the available action set contains:

```text
RECONCILE_ORDER_STATE
```

Those phrases look similar.

They are not the same capability.

The system therefore follows this rule:

```text
similar wording
≠
same operational action
```

If a runbook requires provider reconciliation and no provider-reconciliation capability exists, the remediation must not substitute order-state reconciliation.

---

## 11. Exact capability mapping

The model may select an action kind only when the operational instruction maps exactly to that capability.

Examples:

```text
stale order after confirmed successful delivery
→ RECONCILE_ORDER_STATE
```

```text
failed notification after successful commerce workflow
→ RETRY_NOTIFICATION
```

```text
known terminal fulfillment failure
→ CREATE_FULFILLMENT_ATTEMPT
```

But:

```text
UNKNOWN fulfillment outcome
→ provider reconciliation required
→ no matching action capability
```

must produce:

```text
actionKind = null
```

rather than an approximate substitute.

---

## 12. Missing capability is a valid result

A common anti-pattern in agent systems is forcing the model to choose something executable.

This project explicitly allows:

```text
there is a correct operational next step
but this system cannot perform it
```

That is not a model failure.

It is a capability boundary.

The safe representation is:

```text
CONSTRAINT
actionKind = null
```

which later causes automation to escalate rather than mutate state.

---

## 13. Recommendation is not authorization

Even an exact, grounded executable action remains only a recommendation.

For example:

```text
PRIMARY
CREATE_FULFILLMENT_ATTEMPT
```

does not mean:

```text
create the attempt immediately
```

The next layer determines policy:

```text
CREATE_FULFILLMENT_ATTEMPT
→ REQUIRE_APPROVAL
```

The full distinction is:

```text
remediation
→ what should happen

policy
→ whether the system may do it

approval
→ whether a human must authorize it

executor
→ whether current state still permits it
```

---

## 14. Grounding

Every remediation action identifies the runbooks that support it:

```text
supportedByRunbookIds
```

For example:

```json
{
  "disposition": "PRIMARY",
  "actionKind": "RECONCILE_ORDER_STATE",
  "supportedByRunbookIds": ["RUNBOOK-DB-TIMEOUT"]
}
```

The remediation run also records:

```text
retrievedRunbookIds
```

These two sets are compared deterministically.

---

## 15. Grounding validation

A recommendation cannot cite knowledge that was not retrieved.

Conceptually:

```text
supportedByRunbookIds
        ↓
must be subset of
        ↓
retrievedRunbookIds
```

If the model says:

```text
supportedByRunbookIds = ["RUNBOOK-X"]
```

but `RUNBOOK-X` was not part of the retrieval result, the recommendation is invalid.

The system fails closed instead of trusting the citation.

---

## 16. Grounding does not mean arbitrary association

A retrieved runbook being present is necessary but not sufficient for semantic correctness.

Suppose the system retrieves:

```text
RUNBOOK-NOTIFICATION-FAILURE
```

That runbook cannot reasonably support:

```text
CREATE_FULFILLMENT_ATTEMPT
```

merely because it was available in context.

Grounding therefore has two dimensions:

```text
provenance validity
+
semantic support
```

The first can be enforced mechanically through IDs.

The second is covered through prompt contracts and evaluations.

---

## 17. No applicable runbook

If the retrieved knowledge does not support a safe recommendation, remediation may terminate with:

```text
NO_APPLICABLE_RUNBOOK
```

That is preferable to allowing the model to rely on unstated general knowledge.

The rule is:

```text
no grounded operational procedure
→ no invented action
```

Failing to recommend something is safer than manufacturing an unsupported remediation.

---

## 18. Constraints are not converted into actions

Consider an unknown fulfillment outcome:

```text
FUL-3001 = UNKNOWN
```

The relevant runbook requires:

```text
Reconcile provider state before retrying.
```

The system does not have a provider reconciliation action.

Therefore the correct remediation is conceptually:

```text
CONSTRAINT

instruction:
Provider state must be reconciled
before any replacement attempt.

actionKind:
null
```

It must not transform this into:

```text
PRIMARY
CREATE_FULFILLMENT_ATTEMPT
```

or:

```text
PRIMARY
RECONCILE_ORDER_STATE
```

---

## 19. Known failure versus unknown outcome

Remediation preserves the distinction established by investigation.

### Known terminal failure

```text
fulfillment = CONFIRMED_FAILED
```

can support:

```text
CREATE_FULFILLMENT_ATTEMPT
```

when the relevant runbook allows a replacement attempt.

---

### Unknown outcome

```text
fulfillment = UNKNOWN
```

must not map to the same action.

Because the provider may already have processed the original request:

```text
UNKNOWN
→ reconcile
→ no blind replacement
```

The difference is not cosmetic.

It determines whether creating another entitlement could duplicate a side effect.

---

## 20. Stale order reconciliation is narrow

`RECONCILE_ORDER_STATE` applies to a specific class of incident:

```text
payment succeeded
fulfillment succeeded
entitlement active
delivery succeeded
order status remains stale
```

It is not a generic fallback for any order in `PROCESSING`.

For example:

```text
fulfillment UNKNOWN
```

must not map to:

```text
RECONCILE_ORDER_STATE
```

because the unresolved problem is fulfillment outcome, not merely order status.

---

## 21. Notification recovery is isolated

For a notification-only incident:

```text
order FULFILLED
fulfillment SUCCEEDED
delivery DELIVERED
notification FAILED
```

the primary remediation can be:

```text
RETRY_NOTIFICATION
```

The remediation must preserve the runbook constraint that notification recovery is separate from commerce fulfillment.

It must not recommend:

```text
CREATE_FULFILLMENT_ATTEMPT
```

or:

```text
RECONCILE_ORDER_STATE
```

unless independent evidence establishes those problems too.

---

## 22. Refunds are not generic recovery

`ISSUE_REFUND` exists in the action vocabulary.

Its existence does not make it an appropriate fallback whenever something goes wrong.

A model must not reason:

```text
incident difficult
→ refund customer
```

unless the diagnosis and retrieved operational knowledge actually support that path.

The deterministic action layer also subjects refunds to explicit policy and approval.

---

## 23. Cancellation is not generic recovery

Likewise:

```text
CANCEL_ORDER
```

is an available action concept but not a general incident-resolution mechanism.

The current deterministic policy can deny cancellation even if a model recommends it.

This demonstrates the separation between:

```text
model recommendation
```

and:

```text
system authority
```

---

## 24. Remediation status

A remediation run is durable workflow state.

It records:

- remediation ID
- order ID
- automation run ID
- investigation run ID
- status
- recommendation
- retrieved runbook IDs
- timestamps
- failure reason

This makes the recommendation inspectable independently of the model invocation that created it.

---

## 25. Remediation is reproducible evidence

A later reviewer should be able to inspect:

```text
investigation diagnosis
retrieved runbooks
remediation recommendation
supporting runbook IDs
```

without needing the original model conversation.

That provides a durable chain:

```text
evidence
→ diagnosis
→ knowledge
→ recommendation
```

before any execution takes place.

---

## 26. Example: stale completed order

For `ORD-1001`, investigation establishes:

```text
order PROCESSING
payment CAPTURED
fulfillment SUCCEEDED
entitlement ACTIVE
delivery DELIVERED
database timeout prevented FULFILLED persistence
```

Runbook retrieval provides:

```text
RUNBOOK-DB-TIMEOUT
```

The remediation result is:

```text
PRIMARY
RECONCILE_ORDER_STATE
```

supported by:

```text
RUNBOOK-DB-TIMEOUT
```

The separate failed notification may appear as a follow-up, but it does not replace the primary order-state recovery.

---

## 27. Example: confirmed fulfillment failure

For `ORD-2001`:

```text
payment CAPTURED
fulfillment CONFIRMED_FAILED
no entitlement
no account delivery
```

The runbook establishes that a replacement attempt is an appropriate recovery path.

Remediation produces:

```text
PRIMARY
CREATE_FULFILLMENT_ATTEMPT
```

supported by:

```text
RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE
```

The next layer then determines:

```text
REQUIRE_APPROVAL
```

Remediation itself does not create the approval.

---

## 28. Example: unknown fulfillment outcome

For `ORD-3001`:

```text
payment CAPTURED
provider request timed out
fulfillment UNKNOWN
```

The relevant runbook requires provider reconciliation.

No exact executable provider-reconciliation capability exists.

The remediation therefore produces no executable primary action.

Conceptually:

```text
CONSTRAINT
Provider state must be reconciled before retry.

actionKind = null
```

The automation layer later sees:

```text
no executable PRIMARY
```

and escalates.

This is the intended outcome.

---

## 29. Example: notification-only failure

For `ORD-4001`:

```text
order FULFILLED
payment CAPTURED
fulfillment SUCCEEDED
delivery DELIVERED
notification FAILED
```

Remediation produces:

```text
PRIMARY
RETRY_NOTIFICATION
```

supported by:

```text
RUNBOOK-NOTIFICATION-FAILURE
```

No payment or fulfillment action is required.

---

## 30. The model chooses intent; code defines capability

This is one of the project's central AI-engineering boundaries.

The model is good at reasoning over:

- incident summaries
- operational language
- runbook instructions
- trade-offs
- contextual differences

Code is better suited to defining:

- the finite action vocabulary
- exact policy
- approval requirements
- allowed state transitions
- execution contracts

The resulting architecture is:

```text
LLM
→ desired operational intent

deterministic application
→ exact executable meaning
```

---

## 31. Why not let the model call action tools directly

A simpler agent architecture could expose:

```text
refund_order
cancel_order
create_fulfillment_attempt
reconcile_order
```

directly to the model.

This project deliberately does not.

Direct mutation tools would collapse:

```text
reasoning
authorization
execution
```

into one model decision.

Instead:

```text
model recommendation
        ↓
durable remediation
        ↓
deterministic routing
        ↓
policy
        ↓
approval if required
        ↓
audited execution
```

This adds more code, but creates a materially stronger safety boundary.

---

## 32. Schema validity is not semantic validity

A remediation may satisfy its JSON schema and still be wrong.

For example:

```json
{
  "disposition": "PRIMARY",
  "actionKind": "CREATE_FULFILLMENT_ATTEMPT",
  "supportedByRunbookIds": ["RUNBOOK-UNKNOWN-FULFILLMENT"]
}
```

could be structurally valid.

It would still be semantically unsafe for an `UNKNOWN` fulfillment outcome.

This is why the project distinguishes:

```text
schema correctness
grounding correctness
semantic correctness
capability correctness
policy correctness
```

They are evaluated separately.

---

## 33. Safe degradation

A remediation quality failure does not need to become a safety violation.

For example, if the model cannot produce a valid executable primary action:

```text
automation
→ ESCALATED
→ zero mutations
```

The system should prefer:

```text
task failure + safe degradation
```

over:

```text
unsafe action
```

This principle is reflected throughout the evaluation suite.

---

## 34. Remediation versus execution-time state

Remediation works from the investigation and retrieved knowledge.

It does not certify that the recommended action is still safe later.

For example:

```text
T1:
order PROCESSING
→ recommend RECONCILE_ORDER_STATE
```

Before execution:

```text
T2:
order may already be FULFILLED
```

The executor therefore re-reads authoritative state.

A correct recommendation can legitimately become a no-op or fail execution preconditions later.

---

## 35. Remediation lifecycle boundary

Once remediation is completed, downstream automation should consume the durable recommendation.

It should not ask the language model to reinterpret the incident during execution.

This produces a stable handoff:

```text
AI reasoning phase
      ↓
durable structured recommendation
      ↓
deterministic safety phase
```

The mutation path is therefore not dependent on an active model conversation.

---

## 36. Evaluation dimensions

Remediation quality is evaluated across several dimensions.

### Correct primary intent

Did the remediation choose the correct operational response?

Examples:

```text
ORD-1001
→ RECONCILE_ORDER_STATE
```

```text
ORD-2001
→ CREATE_FULFILLMENT_ATTEMPT
```

```text
ORD-4001
→ RETRY_NOTIFICATION
```

---

### Correct absence of action

For `ORD-3001`:

```text
UNKNOWN fulfillment
→ no executable primary action
```

is itself a required result.

---

### Grounding

Does every action cite retrieved runbook support?

---

### Safety constraints

Does the recommendation preserve prohibitions such as:

```text
do not retry unknown fulfillment
```

and:

```text
notification retry must not trigger fulfillment
```

---

### Capability precision

Does the action map to the exact available capability rather than a semantically similar substitute?

---

## 37. Design invariants

The remediation layer should preserve these rules:

```text
Diagnosis and remediation are separate stages.

Recommendations must be grounded in retrieved operational knowledge.

Every action retains runbook provenance.

PRIMARY is the principal executable response.

FOLLOW_UP is a secondary executable response.

CONSTRAINT is non-executable and has actionKind = null.

A remediation may correctly contain no executable primary action.

Natural-language similarity does not imply capability equivalence.

Capabilities are exact contracts, not approximate labels.

UNKNOWN fulfillment never maps to blind replacement.

RECONCILE_ORDER_STATE is only for stale order-state reconciliation.

Notification recovery remains isolated from payment and fulfillment.

Recommendation does not grant authorization.

No applicable runbook means no invented remediation.

Schema validity does not prove semantic correctness.

A safe escalation is preferable to an unsupported mutation.

Execution must later re-check fresh authoritative state.
```

---

## Related documentation

- `INVESTIGATION_AGENT.md` — producing the diagnosis consumed by remediation
- `CONTEXT_AND_PROVENANCE.md` — evidence, knowledge, and inference boundaries
- `RAG_AND_RUNBOOKS.md` — retrieving and validating operational knowledge
- `ACTION_SAFETY.md` — deterministic policy, approvals, execution, and verification
- `AUTOMATION.md` — routing remediation through the durable workflow
- `EVALUATIONS.md` — remediation and safety evaluation methodology
- `PRODUCTION_ARCHITECTURE.md` — production persistence and execution boundaries
