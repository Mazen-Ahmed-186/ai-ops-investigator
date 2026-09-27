# Production Architecture and Persistence Boundaries

This document describes how the safety semantics demonstrated by `ai-ops-investigator` map to a production deployment.

The current project intentionally uses fixtures, in-memory repositories, file-backed investigation state, and evaluation-specific persistence to make the AI, workflow, safety, and recovery behavior easy to inspect.

Those storage choices are not the production architecture.

The production requirement is that the same behavioral contracts survive process crashes, concurrent workers, retries, and deployment restarts.

## 1. Core principle

The AI does not own operational truth.

A production deployment separates four kinds of state:

1. **Authoritative business state**  
   Orders, payments, fulfillment attempts, entitlements, account deliveries, and notifications remain owned by the commerce system or the service responsible for that domain.

2. **Durable investigation and automation state**  
   Investigation runs, remediation decisions, automation lifecycle state, approvals, and action-execution audits belong to the investigator system and must survive process loss.

3. **Knowledge**  
   Runbooks are versioned knowledge artifacts used for retrieval and grounding. Retrieved runbook references are persisted with remediation results so a decision can be audited later.

4. **Model context**  
   LLM context is a projection derived from durable facts. It is not authoritative state and must never be used as the source of truth for a mutation.

The central invariant is:

```text
model remembers ≠ system knows
```

After a restart, the system reconstructs context from durable state and fresh authoritative reads rather than assuming that prior model context is still valid.

---

## 2. Production process boundaries

A representative deployment would contain these logical processes:

```text
                    ┌─────────────────────────┐
                    │   Operator / API layer  │
                    │ approvals, run status   │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    Durable database     │
                    │                         │
                    │ investigations          │
                    │ remediations            │
                    │ automation runs         │
                    │ approvals               │
                    │ execution audits        │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   Automation worker     │
                    │                         │
                    │ investigate             │
                    │ retrieve runbooks       │
                    │ route policy            │
                    │ execute approved action │
                    │ verify                  │
                    └────────────┬────────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   │                           │
                   ▼                           ▼
        ┌─────────────────────┐     ┌─────────────────────┐
        │ Operational reads   │     │ Action executors    │
        │                     │     │                     │
        │ commerce services   │     │ tightly scoped      │
        │ MCP read surface    │     │ mutation APIs       │
        │ internal telemetry  │     │                     │
        └─────────────────────┘     └─────────────────────┘
```

The MCP server is intentionally part of the read path.

It exposes operational evidence, not mutation authority.

Consequential actions continue through the deterministic action layer:

```text
grounded recommendation
        ↓
deterministic policy
        ↓
optional human approval
        ↓
audited executor
        ↓
fresh verification
```

---

## 3. Durable records

### Investigation run

An investigation run must preserve enough state to resume without relying on a live model session.

Durable data includes:

- investigation ID
- order ID
- lifecycle status
- normalized assessment
- compact working memory
- successful tool observations and provenance
- tool-call history required for duplicate-call prevention and auditability
- timestamps
- failure information when applicable

Provider-specific conversational state is not authoritative.

A model provider response ID or hidden model session must not be required to resume an investigation.

The production equivalent of the current file-backed investigation store would normally be a database-backed `InvestigationStore`.

---

### Remediation run

A remediation run records the durable result of converting an investigation into grounded operational guidance.

Persist:

- remediation ID
- order ID
- automation run ID
- investigation run ID
- lifecycle status
- recommendation
- action dispositions
- executable action kinds
- supporting runbook IDs
- retrieved runbook IDs
- timestamps
- failure reason

The retrieved runbook references are part of the decision provenance.

A production knowledge system should also version its runbooks so historical decisions can be associated with the knowledge version used at decision time.

---

### Automation run

The automation run is the durable workflow coordinator.

Persist:

- automation ID
- order ID
- lifecycle status
- investigation run ID
- remediation run ID
- approval ID
- action execution ID
- failure reason
- timestamps
- optimistic concurrency version

Its lifecycle remains:

```text
PENDING
  ↓
INVESTIGATING
  ↓
PLANNING_REMEDIATION
  ↓
WAITING_FOR_APPROVAL
or
EXECUTING
  ↓
VERIFYING
  ↓
COMPLETED
```

with terminal safety exits:

```text
ESCALATED
FAILED
```

An automation run must not derive its current lifecycle state from model text.

---

### Approval

An approval is durable authorization for one exact consequential action.

Persist:

- approval ID
- exact action snapshot
- status
- creation time
- expiry time
- decision time
- decision actor
- consumed execution ID
- optimistic concurrency version

Statuses remain:

```text
PENDING
APPROVED
REJECTED
EXPIRED
CONSUMED
```

Approval is:

- action-specific
- one-time
- expiring
- immutable with respect to the authorized action

Approval does not mean that an action already executed.

Approval also does not mean that the action is still safe when execution begins.

Execution must still perform fresh deterministic precondition checks.

---

### Action execution audit

The execution audit is the durable record used to decide whether a mutation may safely be attempted, recovered, verified, or escalated.

Persist:

- execution ID
- automation run ID
- action snapshot
- initiating actor
- approval ID when applicable
- execution status
- start time
- completion time
- validation reasons
- failure information
- structured effect

The structured `effect` is machine state.

The human-readable `reason` is not.

For example:

```text
status = EXECUTED

effect = {
  kind: FULFILLMENT_ATTEMPT_CREATED,
  attemptId: ...,
  attemptStatus: PENDING
}
```

is sufficient recovery evidence to identify the exact resource that must be verified.

A sentence such as:

```text
"Created another fulfillment attempt."
```

is not.

---

## 4. Transaction boundaries

Some state transitions must be atomic in production.

### Creating an approval

Routing an automation into `WAITING_FOR_APPROVAL` and creating its exact approval should occur atomically.

The system must not persist:

```text
automation = WAITING_FOR_APPROVAL
approval = missing
```

or:

```text
approval = PENDING
automation does not reference it
```

as a normal committed state.

---

### Approval decision

Changing:

```text
PENDING → APPROVED
```

or:

```text
PENDING → REJECTED
```

must use conditional or optimistic concurrency.

Two reviewers must not both successfully decide the same pending approval.

Conceptually:

```sql
UPDATE approval
SET status = 'APPROVED',
    version = version + 1
WHERE id = ?
  AND status = 'PENDING'
  AND version = ?;
```

Exactly one caller may succeed.

---

### Beginning an approval-required execution

Before crossing a possible external side-effect boundary, production execution should atomically establish durable execution intent.

The transaction should:

1. confirm the approval is still `APPROVED`
2. confirm the approval snapshot exactly matches the requested action
3. confirm it is not expired
4. allocate the execution ID
5. move the approval to `CONSUMED`
6. associate the consumed approval with that execution ID
7. insert an action execution audit with `STARTED`

Only after that transaction commits may the external mutation be attempted.

This creates the important crash-safe state:

```text
approval = CONSUMED
execution audit = STARTED
```

If the process dies after the external call may have occurred but before a terminal result is persisted, recovery sees an ambiguous attempt and does not replay it.

---

### Recording known success

After the executor receives authoritative success, persist:

```text
execution audit = EXECUTED
effect = exact structured effect
```

For example:

```text
FULFILLMENT_ATTEMPT_CREATED
attemptId = FUL-...
attemptStatus = PENDING
```

If the process crashes before the automation run itself reaches `VERIFYING`, the durable execution audit remains sufficient to recover without replay.

This is the recovery behavior demonstrated by the approved-execution restart evaluation.

---

## 5. Crash semantics

The production system must distinguish three classes of recovery.

### Known success

Example durable state:

```text
automation = EXECUTING
approval = CONSUMED
audit = EXECUTED
effect = FULFILLMENT_ATTEMPT_CREATED
automation.actionExecutionId = null
```

Recovery behavior:

```text
do not execute again
→ correlate existing execution
→ move to VERIFYING
→ read fresh authoritative state
→ COMPLETED or ESCALATED
```

The coordinator being stale does not invalidate known durable execution evidence.

---

### Ambiguous possible side effect

Example durable state:

```text
automation = EXECUTING
approval = CONSUMED
audit = STARTED
effect = null
```

The external mutation may or may not have happened.

Recovery behavior:

```text
do not replay
do not infer failure from missing local evidence
→ ESCALATED
→ reconcile using an authoritative external mechanism
```

This is deliberately fail-closed.

The absence of an observed replacement attempt does not prove that the provider never accepted the original request.

---

### Known pre-side-effect failure

If execution is known to have failed before crossing the side-effect boundary, a retry may be permitted when deterministic policy explicitly allows one.

That state must be distinguishable from `STARTED` after a possible side effect.

The system must never collapse:

```text
known not executed
```

and:

```text
execution outcome unknown
```

into the same state.

---

## 6. Uniqueness and concurrency requirements

A production database should enforce the workflow's assumptions structurally rather than relying only on application code.

### One workflow execution

The current automation model has one primary executable action per automation run.

Production persistence should therefore prevent multiple execution records from independently claiming to be the execution for the same automation action.

This can be enforced using an explicit execution key or an equivalent unique constraint such as:

```text
UNIQUE(automation_run_id, action_identity)
```

The exact schema may vary, but concurrent workers must not both create independent executions for the same action.

---

### One-time approval consumption

Once an approval is `CONSUMED`, it cannot return to `APPROVED`.

Its `consumedExecutionId` must identify the execution that consumed it.

Where supported by the schema, the consumed execution reference should itself be unique.

---

### Automation state transitions

Automation updates should use optimistic concurrency or row locking.

Two workers must not both transition:

```text
EXECUTING
```

and independently proceed with the same mutation.

A typical implementation would use either:

- a version column with conditional updates
- row-level locking
- a worker lease
- transactional job claiming

The exact mechanism is infrastructure-specific; the invariant is not.

---

## 7. External side effects cannot share a database transaction

A database transaction cannot make an external provider call atomic with local persistence.

For example:

```text
BEGIN DATABASE TRANSACTION
call external fulfillment provider
COMMIT
```

does not make the provider side effect transactional.

The provider may succeed even if the local transaction later fails.

Therefore the system records execution intent before the external boundary:

```text
durably record STARTED
        ↓
call external system
        ↓
durably record terminal outcome
```

A crash between the second and third steps is explicitly represented as ambiguity.

It is never silently converted into a retry.

---

## 8. Verification is a separate capability

Executor success is not sufficient to mark automation complete.

After execution, verification performs a fresh authoritative read.

Examples:

```text
ORDER_STATE_RECONCILED
→ read current order state
→ require FULFILLED
```

```text
FULFILLMENT_ATTEMPT_CREATED(attemptId)
→ read that exact attempt
→ require an acceptable fresh status
```

```text
NOTIFICATION_RETRY_CREATED(notificationId)
→ read that exact notification
→ require PENDING or SENT
```

Execution and verification should use separate repository capabilities so a successful write method cannot implicitly certify its own outcome.

---

## 9. Business state is not duplicated into the automation database

The investigator database should not become another commerce system.

It should not own canonical copies of:

- order status
- payment status
- fulfillment attempt status
- entitlement status
- account delivery status
- notification status

Those values may appear in observations, execution audits, or snapshots for provenance, but fresh operational decisions must read current authoritative state.

Historical observation is evidence.

It is not automatically current truth.

---

## 10. Model context is reconstructed

A restarted worker should be able to reconstruct everything required to continue safely from:

```text
durable investigation state
durable remediation state
durable automation state
durable approvals
durable execution audits
versioned runbook references
fresh authoritative operational reads
```

It should not depend on:

- model memory
- an in-process JavaScript object
- a previous model response ID
- hidden conversation state
- cached tool output being assumed current

The working context presented to the LLM is rebuilt as a projection of durable facts.

---

## 11. MCP production boundary

The MCP surface remains observation-only.

Exposed:

```text
get_order
get_payment_state
get_fulfillment_attempts
get_delivery_state
get_notification_state
get_order_event_history
```

Not exposed:

```text
RECONCILE_ORDER_STATE
RETRY_NOTIFICATION
CREATE_FULFILLMENT_ATTEMPT
ISSUE_REFUND
CANCEL_ORDER
```

Internal application traces also remain outside the public MCP operational surface.

This creates a least-privilege boundary:

```text
MCP
→ evidence gathering

deterministic action layer
→ mutation authority
```

---

## 12. Current implementation versus production substitution

| Concern                    | Current project                       | Production substitution                      |
| -------------------------- | ------------------------------------- | -------------------------------------------- |
| Operational business state | deterministic fixtures / repositories | authoritative commerce services or databases |
| Investigation persistence  | file-backed store                     | durable database adapter                     |
| Remediation persistence    | in-memory/evaluation store            | durable database adapter                     |
| Automation persistence     | in-memory/evaluation store            | durable database adapter                     |
| Approval persistence       | in-memory/evaluation store            | transactional database adapter               |
| Execution audit            | in-memory/evaluation store            | append-oriented durable audit table          |
| Runbooks                   | local versioned knowledge             | versioned knowledge source/index             |
| MCP transport              | stdio smoke server                    | deployment-appropriate MCP transport         |
| Model context              | reconstructed working memory          | reconstructed working memory                 |
| Verification               | separate repository reads             | separate authoritative reads                 |

The interfaces and safety semantics remain the same even though the infrastructure adapters change.

---

## 13. Intentionally out of scope

This portfolio project does not need to add:

- a production PostgreSQL deployment
- a message broker
- Kubernetes
- distributed tracing infrastructure
- a production approval UI
- a real commerce provider
- a vector database
- multiple autonomous agents

Those additions would increase infrastructure volume without materially improving the safety argument already demonstrated.

The relevant production-design question is not whether every adapter is deployed in this repository.

It is whether the architecture defines the contracts required for a real adapter to preserve the demonstrated behavior.

---

## 14. Production invariants

A production implementation is acceptable only if these remain true:

```text
LLM output is untrusted.

Model context is not authority for writes.

Recommendation is not authorization.

Approval authorizes one exact action.

Approval is consumed once.

Execution re-checks fresh state.

Execution intent is durable before an external side effect.

Known success is recovered without replay.

Ambiguous possible side effects are never blindly retried.

Structured effects, not audit prose, drive recovery.

Verification independently reads authoritative state.

Historical observations do not replace fresh execution-time reads.

MCP provides observation capability, not mutation authority.

Concurrent workers cannot execute the same action twice.
```
