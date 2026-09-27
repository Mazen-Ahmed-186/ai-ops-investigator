# Durable Automation

The automation layer coordinates the full incident workflow after an investigation is requested.

Its responsibility is:

> Persist and advance the incident through investigation, remediation, policy routing, optional approval, execution, and verification without relying on one uninterrupted process or model conversation.

The automation layer does not replace the specialized subsystems.

It coordinates them.

```text
investigation
      ↓
remediation
      ↓
routing / policy
      ↓
optional approval
      ↓
execution
      ↓
verification
```

Each phase remains independently inspectable and durably correlated.

---

## 1. Why a workflow coordinator exists

A safe operational agent is not one model call.

Real workflows can pause or fail between phases:

```text
investigation finishes
→ process restarts

remediation finishes
→ human approval takes 20 minutes

approval granted
→ worker crashes

mutation succeeds
→ coordinator crashes before recording progress

verification discovers unexpected state
```

If orchestration existed only in memory, these cases would require guessing what already happened.

Instead, the system stores a durable automation run that describes where the workflow currently is.

---

## 2. The automation state machine

The primary lifecycle is:

```text
PENDING
   ↓
INVESTIGATING
   ↓
PLANNING_REMEDIATION
   ↓
   ├──────────────→ WAITING_FOR_APPROVAL
   │                       ↓
   │                   EXECUTING
   │
   └──────────────────→ EXECUTING
                           ↓
                       VERIFYING
                           ↓
                       COMPLETED
```

Safety and failure exits include:

```text
ESCALATED
FAILED
```

These states are application state.

They are not inferred from model prose.

---

## 3. `PENDING`

A newly created automation begins:

```text
PENDING
```

At this point the system knows:

```text
automation ID
order ID
```

but no investigation has yet been correlated.

The next valid workflow step is investigation.

---

## 4. `INVESTIGATING`

When investigation begins:

```text
PENDING
→ INVESTIGATING
```

The automation later stores:

```text
investigationRunId
```

linking it to the durable investigation artifact.

The automation does not copy the entire investigation into its own record.

It stores identity and lifecycle correlation.

---

## 5. Investigation remains a separate artifact

The investigation owns:

```text
tool history
working memory
assessment
diagnostic lifecycle
```

The automation owns:

```text
where the overall workflow is
```

This separation prevents the coordinator from becoming a second copy of every subsystem's state.

Conceptually:

```text
AutomationRun
   │
   └── investigationRunId
             ↓
       InvestigationRun
```

---

## 6. `PLANNING_REMEDIATION`

After investigation completes successfully:

```text
INVESTIGATING
→ PLANNING_REMEDIATION
```

The remediation layer:

```text
retrieves runbooks
produces grounded operational intent
persists remediation result
```

The automation then records:

```text
remediationRunId
```

Again, correlation is explicit.

---

## 7. Automation does not reinterpret remediation

Once remediation is completed, the coordinator consumes the durable structured result.

It does not ask another model:

```text
What do you think we should do now?
```

The handoff is:

```text
AI reasoning
      ↓
durable remediation
      ↓
deterministic automation
```

This prevents the execution path from silently changing because of another stochastic model call.

---

## 8. Routing requires an executable primary action

The coordinator inspects the grounded remediation.

To proceed toward execution, it needs an executable:

```text
PRIMARY
```

action.

For example:

```text
PRIMARY
RECONCILE_ORDER_STATE
```

or:

```text
PRIMARY
CREATE_FULFILLMENT_ATTEMPT
```

---

## 9. No executable primary action means escalation

A remediation may legitimately contain only:

```text
CONSTRAINT
actionKind = null
```

For example:

```text
Provider state must be reconciled before retry.
```

If the system has no exact provider-reconciliation capability, there is nothing safe to execute.

The coordinator therefore moves to:

```text
ESCALATED
```

It does not create an approval for an unsupported action.

It does not invent an approximate executor.

---

## 10. Policy routing

For an executable action, deterministic policy produces one of:

```text
ALLOW
REQUIRE_APPROVAL
DENY
```

The automation then maps that policy outcome into workflow behavior.

---

## 11. `ALLOW`

For an allowed action:

```text
ALLOW
→ EXECUTING
```

The coordinator may return a routing result such as:

```text
EXECUTION_READY
```

to indicate that execution can proceed immediately.

`EXECUTION_READY` is not a separate durable lifecycle state.

The persisted workflow state is:

```text
EXECUTING
```

---

## 12. `REQUIRE_APPROVAL`

For an approval-required action:

```text
REQUIRE_APPROVAL
→ create exact approval
→ WAITING_FOR_APPROVAL
```

The automation stores:

```text
approvalId
```

linking the workflow to the exact authorization request.

At this point no mutation should have occurred.

---

## 13. `DENY`

A denied action cannot proceed to execution.

The automation exits safely rather than trying to reinterpret the remediation into something else.

The important principle is:

```text
policy denied this action
≠
ask the model for a more convenient action
```

A fresh operational response would require an explicit new workflow decision rather than bypassing policy.

---

## 14. `WAITING_FOR_APPROVAL`

This state represents a deliberate durable pause.

The workflow may remain here while a human:

```text
approves
rejects
or allows the approval to expire
```

The application process does not need to remain alive.

That is one reason approval cannot exist only in memory.

---

## 15. Approval correlation

The automation stores:

```text
approvalId
```

while the approval stores the exact action snapshot.

This creates the relationship:

```text
AutomationRun
      ↓
approvalId
      ↓
ActionApproval
      ↓
exact action
```

A resumed workflow can therefore determine exactly what was authorized.

---

## 16. Resuming after approval

When approval is later processed, the automation does not blindly continue.

It re-derives the action from durable remediation and compares it with the approval snapshot.

Conceptually:

```text
durable remediation action
        +
durable approval action
        ↓
must match exactly
```

Only then can the workflow move:

```text
WAITING_FOR_APPROVAL
→ EXECUTING
```

---

## 17. Approval rejection

A rejected approval means the requested consequential action is not authorized.

The workflow must not execute it.

Rejection is not converted into:

```text
try automatically instead
```

or:

```text
ask the model for another wording
```

It is a real human control boundary.

---

## 18. Approval expiry

An expired approval is no longer valid authorization.

The workflow cannot simply use it because:

```text
it used to be approved
```

If action is still appropriate later, the system needs a fresh safe path.

---

## 19. `EXECUTING`

`EXECUTING` means the workflow is at the mutation boundary.

This state can represent several situations:

```text
execution has not begun yet

execution is currently happening

execution may have happened but coordinator progress is stale

known durable execution already exists and must be recovered
```

That ambiguity is resolved using action-execution audit state.

Not by assuming what the coordinator last remembers.

---

## 20. Action execution correlation

Once an execution is durably known, the automation stores:

```text
actionExecutionId
```

This links:

```text
automation
→ exact execution audit
→ exact structured effect
```

The execution identity later drives verification and recovery.

---

## 21. Execution outcomes

An action executor can produce outcomes such as:

```text
EXECUTED
NO_OP
BLOCKED_BY_CURRENT_STATE
```

as well as exceptions or other action-specific safety results.

The coordinator interprets these semantically.

---

## 22. Successful execution

For:

```text
EXECUTED
```

the coordinator records the execution correlation and advances:

```text
EXECUTING
→ VERIFYING
```

It does not immediately mark the automation:

```text
COMPLETED
```

because execution still requires independent verification.

---

## 23. Safe no-op

An executor may discover that the desired state already exists.

For example:

```text
RECONCILE_ORDER_STATE
```

may find:

```text
order already FULFILLED
```

and produce:

```text
NO_OP
```

This is still a valid execution result.

The workflow advances to:

```text
VERIFYING
```

so the current state is independently confirmed.

---

## 24. Current-state block

An action that was valid during remediation can become unsafe before execution.

For example:

```text
account delivery is no longer confirmed
```

may block order reconciliation.

The executor can return:

```text
BLOCKED_BY_CURRENT_STATE
```

The automation then transitions to:

```text
ESCALATED
```

rather than forcing the stale recommendation through.

This is another expression of:

```text
T1 recommendation
≠
T2 execution truth
```

---

## 25. Execution exception

If the execution coordinator encounters an unexpected runtime failure, the automation records:

```text
FAILED
```

with a durable:

```text
failureReason
```

This is different from:

```text
ESCALATED
```

`FAILED` means the workflow itself encountered an operational/runtime failure.

`ESCALATED` means the workflow deliberately stopped because safe automated continuation was not available.

---

## 26. `VERIFYING`

After a known successful or safe no-op execution:

```text
EXECUTING
→ VERIFYING
```

the workflow performs a fresh authoritative read.

Verification uses:

```text
actionExecutionId
structured effect
fresh operational state
```

to determine whether the intended mutation is durably visible.

---

## 27. Verification is correlated

Verification is not generic.

For example:

```text
ACT-1.effect =
FULFILLMENT_ATTEMPT_CREATED
attemptId = FUL-NEW-1
```

causes verification to inspect:

```text
FUL-NEW-1
```

specifically.

It does not accept:

```text
some fulfillment attempt exists
```

as proof.

---

## 28. Successful verification

When fresh authoritative state confirms the execution:

```text
VERIFYING
→ COMPLETED
```

The automation is now terminally complete.

This means:

> The requested automation action was safely executed or confirmed as an appropriate no-op, and the resulting authoritative state was verified.

---

## 29. Automation completion is scoped

`COMPLETED` describes the automation's task.

It does not necessarily mean every downstream business process is finished.

For example:

```text
CREATE_FULFILLMENT_ATTEMPT
```

may create:

```text
FUL-NEW-1 = PENDING
```

and verification may accept that exact attempt as durably created.

The automation can become:

```text
COMPLETED
```

even though the new fulfillment attempt itself has not yet reached:

```text
SUCCEEDED
```

This distinction prevents the coordinator from claiming more than it proved.

---

## 30. Verification escalation

If fresh verification discovers an unsafe or contradictory state, the workflow does not fabricate success.

For example:

```text
created fulfillment attempt
→ fresh state = UNKNOWN
```

or:

```text
created notification retry
→ exact notification missing
```

can produce:

```text
ESCALATED
```

The action was attempted, but safe automated confirmation is unavailable.

---

## 31. `ESCALATED`

`ESCALATED` is a first-class terminal safety state.

It means:

> The workflow has enough information to determine that automated continuation should stop.

Examples include:

```text
no exact executable capability

policy cannot safely proceed

fresh execution-time state blocks action

verification produces unsafe or unresolved state

execution recovery is ambiguous
```

Escalation is not equivalent to failure.

---

## 32. Safe escalation can be success from a safety perspective

For `ORD-3001`:

```text
fulfillment = UNKNOWN
provider reconciliation required
no executable provider-reconciliation capability
```

the expected automation result is:

```text
ESCALATED
```

with:

```text
0 approvals
0 executions
```

That is the correct system behavior.

The product goal is not:

```text
always mutate something
```

It is:

```text
act when safe
stop when not
```

---

## 33. `FAILED`

`FAILED` represents workflow failure rather than intentional safety escalation.

Examples can include:

```text
unexpected repository exception
corrupt required durable state
unhandled infrastructure failure
```

The workflow stores a failure reason so failure is visible and diagnosable.

---

## 34. Terminal states

The important terminal states are therefore:

```text
COMPLETED
ESCALATED
FAILED
```

Their meanings differ:

```text
COMPLETED
→ automated task safely finished

ESCALATED
→ safe automated continuation intentionally stopped

FAILED
→ workflow itself failed unexpectedly
```

---

## 35. Durable correlations

An automation run carries correlations such as:

```text
investigationRunId
remediationRunId
approvalId
actionExecutionId
```

They form the trace:

```text
AutomationRun
   │
   ├── InvestigationRun
   │
   ├── RemediationRun
   │
   ├── Approval
   │
   └── ActionExecution
```

The coordinator does not need to duplicate all child records.

It retains stable identity between them.

---

## 36. Correlation fields are nullable by phase

Not every ID exists from the beginning.

For example:

```text
PENDING

investigationRunId = null
remediationRunId = null
approvalId = null
actionExecutionId = null
```

Later:

```text
PLANNING_REMEDIATION

investigationRunId = INV-...
```

Later:

```text
WAITING_FOR_APPROVAL

investigationRunId = INV-...
remediationRunId = REM-...
approvalId = APR-...
```

Later:

```text
VERIFYING

actionExecutionId = ACT-...
```

The nullable fields therefore describe workflow progress rather than missing data errors by themselves.

---

## 37. Not every workflow has an approval

An auto-executable action should retain:

```text
approvalId = null
```

For example:

```text
RECONCILE_ORDER_STATE
```

and:

```text
RETRY_NOTIFICATION
```

normally do not create approval records.

This allows evaluations to assert that unnecessary human approval was not introduced.

---

## 38. No approval for escalation-only scenarios

An unsupported remediation such as `ORD-3001` must not create an approval just because the workflow contains a human-in-the-loop subsystem.

If there is no executable action:

```text
approval count = 0
execution count = 0
```

This prevents the system from asking humans to authorize operations it cannot safely define.

---

## 39. Exactly one primary execution

The current automation model executes one primary remediation action per workflow.

A valid executable scenario therefore expects:

```text
exactly one action execution
```

for the primary action.

Secondary follow-ups can be modeled through separate explicit workflow handling rather than silently bundling unrelated writes into the same executor.

This keeps action consequences inspectable.

---

## 40. Automation does not call every recommended action

A remediation can contain:

```text
PRIMARY
FOLLOW_UP
CONSTRAINT
```

The automation's primary routing logic does not mean:

```text
execute every item in actions[]
```

Instead, it derives the principal executable action according to the remediation contract.

This avoids accidental multi-action fan-out from one model response.

---

## 41. Canonical action reasons

When the automation derives executable actions, it uses stable system-owned reasons rather than arbitrary model wording.

Examples include:

```text
Grounded remediation requires reconciling the stale order state.
```

```text
Grounded remediation requires creating a new fulfillment attempt.
```

```text
Grounded remediation requires retrying the failed customer notification.
```

This creates deterministic action snapshots for policy, approval, execution, and recovery.

---

## 42. Why canonical derivation matters

Suppose two semantically equivalent model outputs say:

```text
Create another fulfillment attempt.
```

and:

```text
Retry fulfillment with a replacement attempt.
```

Approval identity should not depend on incidental wording.

The coordinator converts grounded remediation into a stable action contract.

That contract—not the original prose—is what downstream safety logic consumes.

---

## 43. Crash recovery is part of automation

A durable workflow must handle stale coordinator state.

For example:

```text
automation = EXECUTING
approval = CONSUMED
audit = EXECUTED
effect = FULFILLMENT_ATTEMPT_CREATED
```

even if:

```text
automation.actionExecutionId = null
```

Recovery recognizes durable known success and resumes:

```text
VERIFYING
```

without replaying the write.

---

## 44. Ambiguous execution recovery

If instead:

```text
automation = EXECUTING
approval = CONSUMED
audit = STARTED
effect = null
```

the mutation may already have happened.

The coordinator must not assume:

```text
no effect was recorded
→ nothing happened
```

It escalates.

The detailed recovery rules are documented in `CRASH_RECOVERY.md`.

---

## 45. Durable workflow beats process continuity

The automation is designed around the assumption that workers can disappear.

Correctness should depend on:

```text
durable workflow state
durable child artifacts
fresh authoritative reads
```

not:

```text
the same Node.js process stays alive
```

This is why the architecture can safely pause for approval or recover after execution.

---

## 46. Model sessions are not workflow sessions

Investigation may involve model-provider continuation.

Automation does not.

The automation lifecycle is owned entirely by application state.

A model response ID cannot tell the system:

```text
whether approval was granted
whether an action executed
whether verification passed
```

Those facts live in the relevant durable subsystems.

---

## 47. Workflow persistence

The current project uses lightweight stores for inspectability and evaluation.

A production adapter would persist automation state to a transactional database.

Important production requirements include:

```text
durable lifecycle state
optimistic concurrency
unique logical execution
atomic approval/execution-intent boundaries
restart-safe correlations
```

Those requirements are detailed in `PRODUCTION_ARCHITECTURE.md`.

---

## 48. Concurrent workers

In production, multiple workers may observe the same workflow.

They must not both decide:

```text
this automation is EXECUTING
→ I should perform the mutation
```

Production persistence therefore needs concurrency control.

Possible implementations include:

```text
versioned conditional writes
row locks
worker leases
transactional job claiming
```

The exact mechanism is infrastructure-specific.

The invariant is:

```text
one logical workflow action
→ one authorized execution attempt
```

---

## 49. Automation and business state remain separate

The automation database does not become the source of truth for:

```text
order state
payment state
fulfillment state
delivery state
notification state
```

The coordinator stores workflow state.

Execution and verification still query authoritative operational repositories.

This keeps:

```text
workflow truth
```

separate from:

```text
commerce truth
```

---

## 50. Automation does not infer successful writes

Suppose the coordinator knows:

```text
automation = EXECUTING
```

That does not imply:

```text
write succeeded
```

Likewise:

```text
process crashed
```

does not imply:

```text
write failed
```

Execution audit and structured effects determine what is known.

The lifecycle state alone is insufficient.

---

## 51. Scenario: stale completed order

`ORD-1001` demonstrates the auto-execution route:

```text
PENDING
↓
INVESTIGATING
↓
PLANNING_REMEDIATION
↓
RECONCILE_ORDER_STATE
↓
ALLOW
↓
EXECUTING
↓
ORDER_STATE_RECONCILED
↓
VERIFYING
↓
COMPLETED
```

Expected approval count:

```text
0
```

Expected execution count:

```text
1
```

---

## 52. Scenario: confirmed fulfillment failure

`ORD-2001` demonstrates human approval:

```text
PENDING
↓
INVESTIGATING
↓
PLANNING_REMEDIATION
↓
CREATE_FULFILLMENT_ATTEMPT
↓
REQUIRE_APPROVAL
↓
WAITING_FOR_APPROVAL
↓
APPROVED
↓
EXECUTING
↓
approval CONSUMED
↓
FULFILLMENT_ATTEMPT_CREATED
↓
VERIFYING
↓
COMPLETED
```

Expected approval:

```text
exactly 1
status = CONSUMED
```

Expected execution:

```text
exactly 1
```

---

## 53. Scenario: unknown fulfillment outcome

`ORD-3001` demonstrates capability-limited escalation:

```text
PENDING
↓
INVESTIGATING
↓
PLANNING_REMEDIATION
↓
provider reconciliation required
↓
no exact executable capability
↓
ESCALATED
```

Expected:

```text
approvals = 0
executions = 0
```

This is a deliberate safe terminal result.

---

## 54. Scenario: notification-only failure

`ORD-4001` demonstrates isolated auto-execution:

```text
PENDING
↓
INVESTIGATING
↓
PLANNING_REMEDIATION
↓
RETRY_NOTIFICATION
↓
ALLOW
↓
EXECUTING
↓
NOTIFICATION_RETRY_CREATED
↓
VERIFYING
↓
COMPLETED
```

The fulfillment path remains untouched.

---

## 55. Deterministic workflow evaluation

The deterministic automation suite covers scenarios such as:

```text
stale completed order
confirmed fulfillment failure
unknown fulfillment outcome
notification-only failure
unsupported refund overreach
unsupported cancellation overreach
```

The purpose is not merely to confirm terminal status.

It also checks:

```text
approval count
approval lifecycle
execution count
action correlation
terminal state
```

A workflow that reaches `COMPLETED` through the wrong safety path should still fail the evaluation.

---

## 56. Live AI workflow evaluation

The live safety suite places real investigation and remediation ahead of the deterministic coordinator.

This verifies the complete boundary:

```text
LLM investigation
→ LLM remediation
→ deterministic automation
→ safe mutation behavior
```

The four canonical live incidents produce materially different routing outcomes:

| Incident                      | Action                       | Routing           | Terminal    |
| ----------------------------- | ---------------------------- | ----------------- | ----------- |
| stale completed order         | `RECONCILE_ORDER_STATE`      | auto-execute      | `COMPLETED` |
| confirmed fulfillment failure | `CREATE_FULFILLMENT_ATTEMPT` | approval required | `COMPLETED` |
| unknown fulfillment outcome   | none                         | escalate          | `ESCALATED` |
| notification-only failure     | `RETRY_NOTIFICATION`         | auto-execute      | `COMPLETED` |

The variation is intentional.

---

## 57. AI failure versus workflow safety

The model can make a diagnostic or remediation mistake.

That does not automatically mean the automation executed unsafely.

The system distinguishes:

```text
AI quality failure
```

from:

```text
safe degradation
```

from:

```text
safety violation
```

For example:

```text
wrong model recommendation
→ no executable safe action
→ ESCALATED
```

may fail the task-quality evaluation while still preserving automation safety.

---

## 58. Automation owns continuation, not reasoning

The automation layer answers:

```text
What phase should happen next?
```

It does not answer:

```text
What is the root cause?
```

or:

```text
What does this runbook mean?
```

Those responsibilities remain upstream.

This keeps the workflow coordinator deterministic and comparatively simple.

---

## 59. Why not use a fully autonomous agent

A single autonomous agent could theoretically decide:

```text
investigate
retrieve
recommend
approve
execute
verify
```

inside one loop.

This project rejects that architecture because consequence increases across those phases.

Instead:

```text
high ambiguity
→ model reasoning

high consequence
→ deterministic workflow
```

This is the project's main orchestration philosophy.

---

## 60. Design invariants

The automation layer should preserve these rules:

```text
Automation state is durable application state.

The coordinator correlates subsystems rather than duplicating them.

Investigation completes before remediation.

Remediation becomes durable before action routing.

Only an executable PRIMARY action can enter policy routing.

No exact executable capability means escalation.

ALLOW enters EXECUTING without creating approval.

REQUIRE_APPROVAL enters WAITING_FOR_APPROVAL.

EXECUTION_READY is a routing result, not a persisted lifecycle state.

Approval resume validates the exact action again.

Rejected or expired approvals do not execute.

Execution-time state can still block an approved action.

Known execution success moves to verification, not directly to completion.

Safe no-op still goes through verification.

Blocked current state escalates.

Verification uses exact execution correlation.

Successful verification produces COMPLETED.

Unsafe or unresolved verification can escalate.

ESCALATED is a valid safety outcome.

FAILED is distinct from intentional escalation.

Auto-executable workflows do not create unnecessary approvals.

Unsupported workflows do not create approvals or executions.

A workflow executes one primary action explicitly.

Known durable success is recovered without replay.

Ambiguous possible side effects are never replayed blindly.

Process continuity is not required for workflow correctness.

Model conversation state is not automation state.

Concurrent workers must not execute the same logical action independently.
```

---

## Related documentation

- `INVESTIGATION_AGENT.md` — investigation phase
- `RAG_AND_RUNBOOKS.md` — operational knowledge retrieval
- `REMEDIATION.md` — structured operational intent
- `ACTION_SAFETY.md` — policy, approvals, execution, and verification
- `CRASH_RECOVERY.md` — restart behavior around the execution boundary
- `EVALUATIONS.md` — deterministic and live workflow evaluation
- `PRODUCTION_ARCHITECTURE.md` — production persistence and concurrency guarantees
