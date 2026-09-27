# Action Safety

`ai-ops-investigator` deliberately separates AI-generated operational intent from mutation authority.

The remediation model can recommend an action.

It cannot authorize or execute that action.

Every consequential operation passes through deterministic safety controls:

```text
grounded remediation
        ↓
derive exact action
        ↓
deterministic policy
        ↓
approval if required
        ↓
fresh execution-time validation
        ↓
audited mutation
        ↓
structured effect
        ↓
independent verification
```

The central principle is:

```text
agent decides desired action
deterministic system decides allowed action
```

---

## 1. Why actions are outside the agent loop

A simple agent architecture could expose mutation tools such as:

```text
refund_order
cancel_order
create_fulfillment_attempt
retry_notification
```

directly to the language model.

This project intentionally does not.

Doing so would collapse three different responsibilities:

```text
reasoning
authorization
execution
```

into one probabilistic decision.

Instead, the model produces structured operational intent.

Deterministic code owns the consequences.

---

## 2. The action vocabulary

The current system supports five action kinds:

```text
RECONCILE_ORDER_STATE
RETRY_NOTIFICATION
CREATE_FULFILLMENT_ATTEMPT
ISSUE_REFUND
CANCEL_ORDER
```

These are not merely labels.

Each represents a narrowly defined executable capability.

The finite vocabulary prevents the model from creating arbitrary mutation commands.

---

## 3. Exact actions

A derived executable action contains an exact action kind together with its target and reason.

Conceptually:

```json
{
  "kind": "CREATE_FULFILLMENT_ATTEMPT",
  "orderId": "ORD-2001",
  "reason": "Grounded remediation requires creating a new fulfillment attempt."
}
```

The action becomes the stable object passed through:

```text
policy
approval
execution
audit
recovery
```

The system does not later reinterpret free-form model prose to decide what should execute.

---

## 4. Recommendation is not authorization

A remediation may produce:

```text
PRIMARY
CREATE_FULFILLMENT_ATTEMPT
```

but that means only:

> The grounded operational recommendation is to create another fulfillment attempt.

It does not mean:

> The system is authorized to create one.

Authorization belongs to deterministic policy.

This is one of the project's key boundaries:

```text
recommendation ≠ authorization
```

---

## 5. Deterministic policy

Action policy is implemented in code rather than inferred by the model.

The current policy is:

| Action                       | Policy             |
| ---------------------------- | ------------------ |
| `RECONCILE_ORDER_STATE`      | `ALLOW`            |
| `RETRY_NOTIFICATION`         | `ALLOW`            |
| `CREATE_FULFILLMENT_ATTEMPT` | `REQUIRE_APPROVAL` |
| `ISSUE_REFUND`               | `REQUIRE_APPROVAL` |
| `CANCEL_ORDER`               | `DENY`             |

This makes consequence level explicit.

---

## 6. `ALLOW`

`ALLOW` means the action does not require a human approval step under the current policy.

Examples:

```text
RECONCILE_ORDER_STATE
RETRY_NOTIFICATION
```

But `ALLOW` does **not** mean:

```text
execute blindly
```

The executor still performs fresh-state validation before mutation.

A previously valid recommendation may become invalid by execution time.

---

## 7. `REQUIRE_APPROVAL`

Actions with greater business consequences require explicit human authorization.

Currently:

```text
CREATE_FULFILLMENT_ATTEMPT
ISSUE_REFUND
```

require approval.

The policy decision therefore changes the workflow from:

```text
remediation
→ execution
```

into:

```text
remediation
→ WAITING_FOR_APPROVAL
→ human decision
→ execution
```

---

## 8. `DENY`

A `DENY` decision means the system will not execute the action.

For example:

```text
CANCEL_ORDER
→ DENY
```

Even if a model recommends cancellation, the deterministic policy remains authoritative.

The model cannot override the decision by:

- increasing confidence
- changing its wording
- citing another explanation
- repeatedly requesting execution

---

## 9. Human approval is an exact snapshot

An approval does not authorize a general category of work.

It authorizes one exact action snapshot.

Conceptually:

```text
approval APR-1
        ↓
CREATE_FULFILLMENT_ATTEMPT
orderId = ORD-2001
reason = ...
```

If execution later presents a different action, that approval is not valid for it.

This prevents approval from becoming a broad capability token.

---

## 10. Approval lifecycle

Approval status is explicit:

```text
PENDING
APPROVED
REJECTED
EXPIRED
CONSUMED
```

A typical successful path is:

```text
PENDING
   ↓
APPROVED
   ↓
CONSUMED
```

`REJECTED` and `EXPIRED` prevent execution.

`CONSUMED` represents authorization that has already been bound to an execution attempt.

---

## 11. Approval is one-time

An approved action may be consumed once.

Once:

```text
APPROVED
→ CONSUMED
```

the approval cannot be reused to authorize another independent mutation.

This protects against:

```text
one human approval
→ multiple fulfillment attempts
```

or:

```text
one refund approval
→ repeated refunds
```

---

## 12. Approval expires

Approval is time-bounded.

The current approval model uses an expiry window rather than treating approval as permanently valid.

This matters because operational state may change after a reviewer makes a decision.

Even before expiry, fresh execution validation remains required.

Approval means:

```text
a human authorized this exact action
```

not:

```text
all preconditions remain true forever
```

---

## 13. Approval is not execution

The states:

```text
APPROVED
```

and:

```text
EXECUTED
```

are deliberately separate.

An operator may approve a replacement attempt, but the process could crash before execution.

Or execution-time validation might determine that the action is no longer safe.

Therefore:

```text
approval ≠ execution
```

---

## 14. Approval is not continued safety

Suppose a human approves:

```text
CREATE_FULFILLMENT_ATTEMPT
```

because the current evidence shows:

```text
previous fulfillment = CONFIRMED_FAILED
```

Before execution, the system may have changed.

For example, another worker could already have created a replacement attempt.

The executor therefore does not reason:

```text
approval exists
→ mutation must happen
```

Instead:

```text
approval valid
+
fresh preconditions valid
→ mutation may happen
```

---

## 15. Fresh execution context

Before mutation, the executor reads current authoritative state.

This separates two points in time:

```text
T1
investigation/remediation observation
```

from:

```text
T2
execution-time truth
```

T1 can justify the recommendation.

T2 controls whether the write still proceeds.

---

## 16. T1 observation is not T2 execution truth

For example, investigation may observe:

```text
T1

order = PROCESSING
fulfillment = SUCCEEDED
delivery = DELIVERED
```

and recommend:

```text
RECONCILE_ORDER_STATE
```

But at execution time:

```text
T2

order = FULFILLED
```

The executor should not force another write just because the earlier remediation said to reconcile.

It can safely return a no-op.

The principle is:

```text
historically valid recommendation
≠
currently required mutation
```

---

## 17. Normalized execution context

The action layer reads only the state required for deterministic safety decisions.

Execution context can include facts such as:

```text
order status
payment statuses
fulfillment attempt statuses
entitlement statuses
account delivery statuses
notification statuses
refund state
business-policy flags
```

The model does not supply these values to the executor.

The repository does.

---

## 18. Raw provider details are not action authority

The action policy does not accept arbitrary model-supplied provider responses.

For fulfillment, it reasons over normalized state such as:

```text
CONFIRMED_FAILED
UNKNOWN
RECONCILING
SUCCEEDED
```

rather than trusting raw provider prose.

This reduces the mutation boundary to explicit domain contracts.

---

## 19. Blocking fulfillment states

A fulfillment attempt is considered blocking while it is in a state such as:

```text
PENDING
ACTIVE
UNKNOWN
RECONCILING
MANUAL_REVIEW
```

While a blocking attempt exists, the system must not blindly create another fulfillment attempt.

This protects against duplicate fulfillment.

---

## 20. Confirmed failure is different

A terminal:

```text
CONFIRMED_FAILED
```

attempt represents a known outcome.

That can permit consideration of a replacement attempt when the rest of the execution gate allows it.

This distinction is central:

```text
CONFIRMED_FAILED
→ known failure
```

versus:

```text
UNKNOWN
→ possible side effect
```

They cannot share the same retry semantics.

---

## 21. Unknown outcome fails closed

If the provider outcome may have occurred but is unconfirmed:

```text
UNKNOWN
```

the action layer must not infer:

```text
request failed
```

and must not create a replacement attempt.

The safe behavior is:

```text
reconcile authoritative provider state
```

or, if that capability is unavailable:

```text
ESCALATE
```

This prevents duplicate entitlements caused by blind retry.

---

## 22. Reconciliation is narrow

`RECONCILE_ORDER_STATE` is allowed only for the stale-state recovery it actually represents.

Typical safe conditions include:

```text
payment captured
fulfillment succeeded
entitlement active
account delivery delivered
order remains stale
```

It is not a generic repair command.

For example:

```text
fulfillment UNKNOWN
```

must not be repaired by simply changing the order status.

---

## 23. Reconciliation can become a no-op

If fresh state shows that the order is already:

```text
FULFILLED
```

the reconciliation executor does not need to mutate it again.

A safe result may therefore be:

```text
NO_OP
```

rather than forcing an unnecessary update.

No-op behavior is part of idempotent recovery design.

---

## 24. Notification execution is isolated

`RETRY_NOTIFICATION` operates only on notification recovery.

Its execution must not:

- create fulfillment attempts
- issue entitlements
- change payment state
- reopen completed commerce workflows

For a previously failed notification, retry creates a **new notification attempt**.

The failed historical attempt remains intact.

---

## 25. Preserve notification history

Suppose:

```text
NOT-1 = FAILED
```

Retrying should produce:

```text
NOT-1 = FAILED
NOT-2 = PENDING
```

not overwrite history as:

```text
NOT-1 = PENDING
```

This preserves the audit trail.

---

## 26. Effective notification state

Retry eligibility must be based on the current effective notification state, not merely whether any notification has ever failed.

For example:

```text
NOT-1 = FAILED
NOT-2 = PENDING
```

must not remain eligible for unlimited retries merely because a historical failed record still exists.

Similarly:

```text
NOT-1 = FAILED
NOT-2 = SENT
```

represents successful recovery.

Historical failure remains evidence, but no longer defines the effective state.

---

## 27. Audit before and after mutation

Actions create durable execution audits.

Relevant statuses include states such as:

```text
STARTED
EXECUTED
NO_OP
```

along with terminal failure or policy-related outcomes where applicable.

The audit exists independently of model output.

It records what the deterministic action system actually attempted.

---

## 28. `STARTED` matters

`STARTED` is not just logging.

For actions that may cross a non-idempotent external side-effect boundary, it is part of crash safety.

Conceptually:

```text
persist STARTED
        ↓
cross possible side-effect boundary
        ↓
persist terminal outcome
```

If the process crashes between the final two steps, the surviving `STARTED` record tells recovery:

```text
the mutation may have happened
```

That ambiguity must not be converted into a blind retry.

---

## 29. Structured effects

Successful execution records machine-readable effects.

Current important effects include:

```text
ORDER_STATE_RECONCILED
FULFILLMENT_ATTEMPT_CREATED
NOTIFICATION_RETRY_CREATED
```

Effects contain the exact state required for recovery and verification.

---

## 30. Order-state effect

A successful reconciliation records:

```text
ORDER_STATE_RECONCILED
previousStatus
currentStatus
```

The system can therefore distinguish what changed without parsing human-readable audit text.

---

## 31. Fulfillment effect

Creating a replacement fulfillment attempt records:

```text
FULFILLMENT_ATTEMPT_CREATED
attemptId
attemptStatus
```

For example:

```text
attemptId = FUL-NEW-1
attemptStatus = PENDING
```

The new attempt ID becomes the correlation key used during verification.

---

## 32. Notification effect

A notification retry records:

```text
NOTIFICATION_RETRY_CREATED
notificationId
notificationStatus
```

Again, verification can inspect that exact new notification rather than simply asking whether any notification exists.

---

## 33. Audit prose is not machine state

An audit may contain a human-readable reason such as:

```text
Created fulfillment attempt FUL-NEW-1.
```

Recovery does not parse that string.

The structured effect is authoritative:

```text
{
  kind: FULFILLMENT_ATTEMPT_CREATED,
  attemptId: FUL-NEW-1,
  attemptStatus: PENDING
}
```

This protects execution logic from depending on natural-language formatting.

---

## 34. Execution success is not completion

An executor returning success is not enough to mark the automation complete.

The workflow moves to:

```text
VERIFYING
```

after successful execution.

This reflects another central invariant:

```text
executor success ≠ independently verified state
```

---

## 35. Independent verification

Verification performs a separate authoritative read after the mutation.

The write capability does not certify itself.

Conceptually:

```text
write
   ↓
record effect
   ↓
separate read capability
   ↓
verify exact resulting state
```

This creates an independent confirmation boundary.

---

## 36. Order-state verification

For:

```text
ORDER_STATE_RECONCILED
```

verification re-reads current order state.

The expected result is:

```text
order = FULFILLED
```

Only then does the automation complete.

---

## 37. Fulfillment verification

For:

```text
FULFILLMENT_ATTEMPT_CREATED
attemptId = ...
```

verification queries the exact attempt identified by the execution effect.

Acceptable fresh states currently include:

```text
PENDING
ACTIVE
SUCCEEDED
```

These mean the requested mutation is durably visible and the automation action itself succeeded.

---

## 38. Fulfillment verification escalation

Fresh states such as:

```text
UNKNOWN
RECONCILING
CONFIRMED_FAILED
ABORTED
MANUAL_REVIEW
```

or a missing exact attempt do not count as successful verification.

The automation escalates rather than pretending the action completed safely.

---

## 39. Automation completion is not business completion

For a newly created fulfillment attempt:

```text
attempt = PENDING
```

verification may complete the automation action.

That does **not** mean:

```text
order fulfillment has completed
```

It means:

> The requested action was safely created and independently verified.

This is an important semantic distinction.

---

## 40. Notification verification

For:

```text
NOTIFICATION_RETRY_CREATED
```

verification reads the exact notification identified by the effect.

Acceptable fresh states include:

```text
PENDING
SENT
```

A new `PENDING` notification proves that the retry attempt was durably created.

`SENT` proves it has already completed successfully.

---

## 41. Notification verification failures

If the exact notification is:

```text
FAILED
```

or missing, verification does not report success.

It escalates.

The system does not create another retry automatically merely because verification failed.

That would bypass the normal recovery and policy path.

---

## 42. Exact correlation matters

Verification does not ask vague questions such as:

```text
Is there a fulfillment attempt now?
```

It asks:

```text
Does the exact attempt created by execution ACT-X
exist with an acceptable current state?
```

Likewise for notification retry.

This prevents historical or unrelated records from satisfying verification accidentally.

---

## 43. Approval correlation matters

Approval-required execution maintains correlation between:

```text
remediation
action
approval
execution
effect
verification
```

For example:

```text
APR-1
authorized
CREATE_FULFILLMENT_ATTEMPT / ORD-2001

ACT-1
consumed APR-1

ACT-1.effect
created FUL-NEW-1

verification
reads FUL-NEW-1
```

The chain is explicit.

---

## 44. Consuming approval before the write

For approval-required mutations, approval is consumed as part of beginning the specific execution attempt.

This means that if later execution preconditions fail:

```text
approval remains CONSUMED
```

rather than returning to `APPROVED`.

Why?

Because the authorization has already been bound to an execution attempt.

Silently reusing it later would weaken the one-time guarantee.

---

## 45. Failed precondition after consumption

Consider:

```text
human approves replacement fulfillment
        ↓
execution begins
        ↓
approval consumed
        ↓
fresh state reveals another blocking attempt
```

The safe behavior is:

```text
do not create another attempt
do not restore approval to reusable state
```

A new attempt would require a new safe workflow if still appropriate.

---

## 46. Least privilege

Each executor receives only the capabilities required for its operation.

Examples:

```text
reconciliation executor
→ order execution repository
```

```text
fulfillment executor
→ fulfillment creation capability
```

```text
verification
→ read capability for exact resulting resource
```

This prevents one generic "operations" interface from silently granting broad mutation authority.

---

## 47. Execution and verification repositories are separate capabilities

The architecture intentionally distinguishes:

```text
ability to mutate
```

from:

```text
ability to verify
```

Even when both capabilities are backed by the same underlying service in a demo repository, their contracts remain separate.

This makes the production substitution clearer and reduces self-certification.

---

## 48. Unknown execution outcome

There is another kind of uncertainty distinct from unknown business fulfillment:

```text
execution itself may have produced a side effect
but the terminal result was not durably recorded
```

Example:

```text
audit = STARTED
approval = CONSUMED
effect = null
process crashed
```

The safe interpretation is:

```text
execution outcome ambiguous
```

not:

```text
execution failed
```

The system does not replay the write.

This is covered in detail in `CRASH_RECOVERY.md`.

---

## 49. Known durable success recovery

If durable state instead contains:

```text
audit = EXECUTED
effect = FULFILLMENT_ATTEMPT_CREATED(...)
approval = CONSUMED
```

then a stale coordinator can recover the known execution.

It must:

```text
not replay
→ correlate existing execution
→ move to verification
```

Again, recovery is driven by durable machine state rather than model memory.

---

## 50. Safety is deterministic after remediation

Once structured remediation is complete, execution does not require the language model to make new safety decisions.

The path is deterministic:

```text
action kind
      ↓
policy
      ↓
approval lifecycle
      ↓
fresh execution gate
      ↓
executor
      ↓
audit effect
      ↓
verification
```

This keeps stochastic reasoning away from the mutation boundary.

---

## 51. Safe degradation

The system distinguishes:

```text
task-quality failure
```

from:

```text
safety violation
```

A model can recommend the wrong action and still fail safely if deterministic layers prevent mutation.

For example:

```text
unsupported or unsafe recommendation
→ DENY / ESCALATE
→ zero writes
```

is undesirable AI behavior, but it is not the same as executing an unsafe mutation.

This distinction is central to the project's evaluation model.

---

## 52. Safety violations

Examples of actual safety violations would include:

```text
creating a new fulfillment attempt while an existing one is UNKNOWN
```

```text
executing an approval-required action without valid approval
```

```text
reusing the same consumed approval for another execution
```

```text
blindly replaying an ambiguous external side effect after restart
```

```text
notification retry triggering fulfillment
```

```text
executing a different action than the exact approved snapshot
```

These are more severe than model-output quality regressions.

---

## 53. Canonical scenario: stale completed order

For `ORD-1001`:

```text
grounded remediation
RECONCILE_ORDER_STATE
        ↓
policy = ALLOW
        ↓
fresh execution validation
        ↓
write
        ↓
ORDER_STATE_RECONCILED
        ↓
fresh order read
        ↓
COMPLETED
```

No human approval is required.

---

## 54. Canonical scenario: confirmed fulfillment failure

For `ORD-2001`:

```text
grounded remediation
CREATE_FULFILLMENT_ATTEMPT
        ↓
policy = REQUIRE_APPROVAL
        ↓
exact approval created
        ↓
human APPROVES
        ↓
approval CONSUMED
        ↓
fresh fulfillment gate
        ↓
create exact new attempt
        ↓
FULFILLMENT_ATTEMPT_CREATED
        ↓
verify exact attempt
        ↓
COMPLETED
```

This is the full human-in-the-loop path.

---

## 55. Canonical scenario: unknown fulfillment

For `ORD-3001`, remediation produces no exact executable primary action.

The system therefore reaches:

```text
ESCALATED
```

with:

```text
0 approvals
0 executions
```

The safety layer never receives a replacement fulfillment mutation to authorize.

This is preferable to approximating provider reconciliation with another capability.

---

## 56. Canonical scenario: notification failure

For `ORD-4001`:

```text
grounded remediation
RETRY_NOTIFICATION
        ↓
policy = ALLOW
        ↓
fresh notification validation
        ↓
create new notification attempt
        ↓
NOTIFICATION_RETRY_CREATED
        ↓
verify exact notification
        ↓
COMPLETED
```

The original failed notification remains preserved.

---

## 57. Why approval is selective

Not every mutation requires a human.

If every action required approval, the system would lose useful automation without necessarily improving safety proportionally.

If no action required approval, higher-consequence operations would have insufficient human control.

The policy therefore distinguishes consequence level.

For example:

```text
repair stale internal status
→ ALLOW
```

```text
retry customer communication
→ ALLOW
```

```text
potentially create another customer entitlement
→ REQUIRE_APPROVAL
```

The distinction is encoded explicitly rather than left to model judgment.

---

## 58. Human-in-the-loop does not replace deterministic policy

Approval is an additional safety layer.

It is not the only safety layer.

The system does not reason:

```text
human clicked approve
→ skip all validation
```

Instead:

```text
grounded action
+
policy allows approval path
+
valid exact approval
+
fresh execution preconditions
→ mutation
```

Humans authorize intent.

Code still verifies system state.

---

## 59. Model confidence does not alter policy

A model output such as:

```text
confidence = HIGH
```

does not turn:

```text
REQUIRE_APPROVAL
```

into:

```text
ALLOW
```

Likewise, high confidence cannot override:

```text
DENY
```

Confidence is diagnostic metadata.

It is not an authorization primitive.

---

## 60. Business policy remains code

Some execution decisions depend on explicit business policy.

For example, refund eligibility can be represented as deterministic state such as:

```text
refundAllowedByBusinessPolicy
```

The model cannot manufacture permission by arguing that a refund seems reasonable.

This follows the broader rule:

```text
business policy
→ code / authoritative configuration

not
→ LLM interpretation
```

---

## 61. Why MCP has no mutation tools

The public MCP surface is intentionally read-only.

It exposes operational evidence, while the action layer retains mutation authority.

This means an MCP-connected reasoning client can inspect:

```text
order
payment
fulfillment
delivery
notification
event history
```

but cannot directly invoke:

```text
refund
cancel
create fulfillment attempt
retry notification
reconcile order
```

This preserves least privilege across protocol boundaries.

---

## 62. Production transaction requirement

A production implementation should make approval consumption and execution-intent creation atomic.

Conceptually:

```text
verify APPROVED
verify exact action
verify not expired
allocate execution ID
consume approval
persist STARTED audit
COMMIT
```

Only then should the system cross an external side-effect boundary.

This ensures a crash leaves durable evidence that execution may have occurred.

See `PRODUCTION_ARCHITECTURE.md` for the persistence contract.

---

## 63. Production concurrency requirement

Two workers must not independently execute the same action.

Production adapters should therefore use mechanisms such as:

- optimistic concurrency
- conditional writes
- uniqueness constraints
- row locking
- worker leases

The infrastructure mechanism may vary.

The invariant does not:

```text
one logical action
→ at most one authorized execution attempt
```

---

## 64. Design invariants

The action-safety layer should preserve these rules:

```text
Recommendation is not authorization.

Policy is deterministic.

Model confidence cannot override policy.

Approval authorizes one exact action snapshot.

Approval is expiring.

Approval is consumed once.

Approval is not execution.

Approval does not prove the action is still safe.

Execution uses fresh authoritative state.

T1 observation is not T2 execution truth.

Blocking fulfillment attempts prevent replacement.

UNKNOWN never means confirmed failure.

Consequential external side effects are never blindly retried.

Reconciliation is narrowly scoped.

Notification retry remains isolated from fulfillment and payment.

Failed notification history is preserved.

Effective current notification state governs retry eligibility.

Execution is durably audited.

Structured effects are machine state.

Human-readable audit reason is not machine state.

Executor success is not verification.

Verification reads fresh authoritative state independently.

Verification correlates the exact created resource.

Known durable success is recovered without replay.

Ambiguous possible side effects are escalated without replay.

Safe degradation is preferable to unsafe mutation.

Mutation authority remains outside the LLM and MCP surfaces.
```

---

## Related documentation

- `REMEDIATION.md` — deriving grounded operational intent
- `RAG_AND_RUNBOOKS.md` — operational knowledge and grounding
- `AUTOMATION.md` — coordinating policy, approval, execution, and verification
- `CRASH_RECOVERY.md` — execution recovery after process loss
- `MCP.md` — read-only protocol boundary
- `EVALUATIONS.md` — task failures, safe degradation, and safety violations
- `PRODUCTION_ARCHITECTURE.md` — transactional and concurrency requirements
