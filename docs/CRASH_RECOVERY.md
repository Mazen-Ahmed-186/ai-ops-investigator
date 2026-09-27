# Crash Recovery

`ai-ops-investigator` treats process crashes as a normal distributed-systems failure mode rather than assuming one uninterrupted worker will own an action from start to finish.

The critical recovery question is:

> After restart, can the system prove whether a consequential side effect happened?

There are two materially different answers:

```text
known success
→ recover without replay
```

and:

```text
possible side effect with unknown outcome
→ escalate without replay
```

The system must never collapse those cases into the same retry behavior.

---

## 1. Core recovery rule

The central invariant is:

```text
known success
→ recover

ambiguous possible side effect
→ reconcile or escalate

known failure before side-effect boundary
→ retry only if policy explicitly allows
```

In particular:

```text
absence of known success
≠
proof of failure
```

That distinction prevents duplicate external side effects.

---

## 2. Why crash recovery matters

A consequential action can span several systems:

```text
local durable state
      ↓
external mutation
      ↓
local terminal audit
      ↓
workflow coordinator
      ↓
verification
```

These steps cannot all be wrapped in one atomic database transaction.

For example:

```text
create fulfillment attempt
```

may succeed at the operational system while the worker crashes before updating the automation run.

After restart, the coordinator may therefore be stale even though the side effect is real.

---

## 3. The dangerous crash window

Consider:

```text
approval consumed
      ↓
execution STARTED persisted
      ↓
external fulfillment request sent
      ↓
provider creates new attempt
      ↓
process crashes
```

If the next worker simply sees:

```text
automation = EXECUTING
```

and calls the executor again, it may create a second fulfillment attempt.

That is exactly what recovery must prevent.

---

## 4. Coordinator state is not enough

An automation in:

```text
EXECUTING
```

does not tell us whether:

```text
the mutation never started

the mutation is in progress

the mutation succeeded

the mutation may have succeeded

the mutation failed
```

Recovery therefore uses the action-execution audit as the durable evidence source.

---

## 5. Recovery evidence

Important recovery state includes:

```text
AutomationRun.status
AutomationRun.actionExecutionId

Approval.status
Approval.consumedExecutionId

ActionExecution.status
ActionExecution.effect

fresh authoritative operational state
```

No single field is sufficient by itself.

The system reconstructs the execution story from their relationship.

---

## 6. Structured effects are essential

A successful execution records a structured effect such as:

```text
FULFILLMENT_ATTEMPT_CREATED
attemptId = FUL-NEW-1
attemptStatus = PENDING
```

This gives recovery an exact resource identity.

Human-readable text such as:

```text
"Created another fulfillment attempt."
```

is not sufficient machine evidence.

Recovery does not parse audit prose.

---

## 7. Known-success crash case

The first proven crash case models this sequence:

```text
automation enters EXECUTING
      ↓
approval is CONSUMED
      ↓
fulfillment write succeeds
      ↓
EXECUTED audit is persisted
      ↓
structured effect is persisted
      ↓
process crashes
      ↓
automation never records VERIFYING
```

The surviving durable state is intentionally inconsistent:

```text
Automation:
  status = EXECUTING
  actionExecutionId = null

Approval:
  status = CONSUMED

Execution audit:
  status = EXECUTED

Effect:
  FULFILLMENT_ATTEMPT_CREATED
```

The coordinator is stale.

The execution evidence is not.

---

## 8. Known durable success wins over stale coordinator state

After restart, recovery sees:

```text
EXECUTED
+
valid structured effect
+
matching consumed approval
```

That is sufficient evidence that the mutation already occurred.

The system must therefore:

```text
do not execute again
      ↓
associate the existing execution
      ↓
move to VERIFYING
      ↓
perform fresh authoritative verification
```

It must not replay the write.

---

## 9. Proven known-success result

The restart evaluation proves:

```text
recoveredFrom = EXECUTING
durableExecution = EXECUTED
approval = CONSUMED

replayAttempts = 0
executionAudits = 1

recovered original execution ID
      ↓
verification = COMPLETED
      ↓
automation = COMPLETED
```

This demonstrates that process loss does not require mutation replay when durable success evidence exists.

---

## 10. Why the coordinator does not trust itself

Before the crash:

```text
automation.actionExecutionId = null
```

A naive implementation might infer:

```text
no actionExecutionId
→ action never executed
```

That inference would be unsafe.

The execution audit is a stronger source of truth for what occurred at the mutation boundary.

The coordinator therefore reconstructs its own stale state from durable execution evidence.

---

## 11. Verification still happens after recovery

Known durable execution does not allow recovery to skip verification.

The workflow continues:

```text
EXECUTED audit
      ↓
recover correlation
      ↓
VERIFYING
      ↓
fresh authoritative read
```

For fulfillment creation, the verifier reads the exact:

```text
attemptId
```

stored in the structured effect.

Only then can the automation become:

```text
COMPLETED
```

---

## 12. Recovery is not self-certification

The fact that the executor recorded:

```text
EXECUTED
```

does not by itself prove that the downstream operational state is still correct.

The structured execution record proves:

```text
the action was durably known to have succeeded
```

Verification separately proves:

```text
the expected authoritative state is now observable
```

These are separate guarantees.

---

## 13. Ambiguous crash case

The second proven crash case models a different state:

```text
automation = EXECUTING
approval = CONSUMED
execution audit = STARTED
effect = null
```

The process disappeared after crossing the point where the external mutation may have happened.

No terminal execution result survived.

This state is ambiguous.

---

## 14. `STARTED` has safety meaning

`STARTED` is not merely diagnostic logging.

For a consequential action, it means:

> This execution entered a phase in which an external side effect may have occurred.

That prevents restart logic from reasoning:

```text
no EXECUTED record
→ safe to retry
```

The absence of a terminal success record is insufficient.

---

## 15. Ambiguity is not known failure

This state:

```text
STARTED
effect = null
```

does not mean:

```text
FAILED
```

It means:

```text
terminal outcome unknown
```

That semantic distinction matters because retries after unknown external side effects can duplicate business operations.

---

## 16. Missing visible business state does not prove nothing happened

The ambiguous-restart evaluation intentionally reconstructs an operational repository without a visible replacement attempt.

Even then, recovery must not infer:

```text
no replacement attempt visible
→ original write definitely failed
```

Possible explanations can include:

```text
eventual consistency
provider latency
partial outage
read-path lag
external success not yet reconciled locally
```

Therefore:

```text
missing local evidence
≠
proof of no external side effect
```

---

## 17. Ambiguous recovery behavior

When recovery sees:

```text
approval = CONSUMED
audit = STARTED
effect = null
```

it must:

```text
not invoke executor
not create another attempt
not restore approval
not begin verification as though success were known
```

Instead:

```text
ESCALATE
```

until authoritative reconciliation can determine what happened.

---

## 18. Proven ambiguous result

The restart evaluation proves:

```text
recoveredFrom = EXECUTING
durableExecution = STARTED
effect = null
approval = CONSUMED

replayAttempts = 0
executionAudits = 1

recovery = ESCALATED
automation = ESCALATED
verification = NOT_ATTEMPTED
```

The key safety property is:

```text
replayAttempts = 0
```

in both restart cases.

---

## 19. The two recovery paths

The difference can be summarized as:

| Durable evidence                     | Meaning                               | Recovery                  |
| ------------------------------------ | ------------------------------------- | ------------------------- |
| `EXECUTED` + valid structured effect | known success                         | recover execution, verify |
| `STARTED` + no terminal effect       | possible side effect, unknown outcome | escalate, never replay    |

Both cases begin from:

```text
automation = EXECUTING
```

The execution audit determines the safe path.

---

## 20. Approval remains consumed after ambiguity

In the ambiguous case:

```text
approval = CONSUMED
```

and remains consumed after restart.

The system does not restore it to:

```text
APPROVED
```

because the authorization was already bound to an execution attempt that may have produced a side effect.

Resetting the approval would make duplicate execution possible.

---

## 21. One approval cannot authorize recovery replay

The following behavior would be unsafe:

```text
human approves once
      ↓
first execution becomes ambiguous
      ↓
restart
      ↓
reuse same approval
      ↓
execute again
```

Instead:

```text
first execution becomes ambiguous
      ↓
approval remains CONSUMED
      ↓
reconciliation required
```

Human authorization is one-time even when the technical result is inconvenient.

---

## 22. `EXECUTED` must contain a valid effect

Recovery does not trust an `EXECUTED` label in isolation.

For an operation such as fulfillment creation, known-success recovery needs a valid effect:

```text
kind = FULFILLMENT_ATTEMPT_CREATED
attemptId = ...
attemptStatus = ...
```

An execution claiming:

```text
status = EXECUTED
effect = null
```

is internally inconsistent.

It must not be treated as normal known success.

---

## 23. Malformed success evidence fails closed

Similarly:

```text
status = EXECUTED
effect.kind = wrong action effect
```

or:

```text
missing required attemptId
```

does not provide trustworthy recovery evidence.

The safe outcome is escalation rather than reconstructing execution from incomplete or contradictory state.

---

## 24. Multiple successful executions are suspicious

If recovery discovers multiple matching:

```text
EXECUTED
```

records for one logical automation action, it should not arbitrarily select one.

That violates the expected one-execution correlation.

The safe response is:

```text
ESCALATED
```

so the inconsistent durable state can be reconciled.

---

## 25. Action identity matters

Recovery does not search for any execution against the order.

It must identify an execution corresponding to the exact derived action.

For example:

```text
CREATE_FULFILLMENT_ATTEMPT
orderId = ORD-2001
```

must not be recovered using an unrelated:

```text
RETRY_NOTIFICATION
```

execution on the same order.

Recovery correlation is action-specific.

---

## 26. Approval identity matters

For approval-required actions, recovery also validates that the execution and approval correspond.

Conceptually:

```text
remediation action
=
approval snapshot
=
execution action
```

and:

```text
approval.consumedExecutionId
=
execution.id
```

These correlations protect against accidentally adopting unrelated historical activity.

---

## 27. Known pre-side-effect failure is a different category

Not every failed execution is ambiguous.

If the system can prove that execution failed **before** crossing the external side-effect boundary, retry may be possible.

Conceptually:

```text
validation failed
before external call
```

can be safely distinguished from:

```text
external call may have happened
terminal outcome missing
```

The first may permit a new execution if policy allows.

The second does not.

---

## 28. Retry policy requires explicit knowledge

Recovery should never derive retry safety from:

```text
an exception occurred
```

alone.

The system needs to know whether that exception occurred:

```text
before side-effect boundary
```

or:

```text
after side-effect boundary
```

A timeout after a remote request was sent is fundamentally different from local validation rejecting the request before it was sent.

---

## 29. The external-call transaction problem

A local database cannot provide atomicity across an arbitrary remote system.

This does not work as true cross-system atomicity:

```text
BEGIN

record local state
call external provider
record result

COMMIT
```

The provider may succeed while the local process or transaction later fails.

The architecture must therefore represent uncertainty explicitly rather than pretending the operation is atomic.

---

## 30. Durable execution intent

A production implementation should establish execution intent before crossing the side-effect boundary:

```text
validate approval
      ↓
allocate execution ID
      ↓
consume approval
      ↓
persist STARTED
      ↓
COMMIT
      ↓
external call
```

Now a crash after the external call leaves meaningful evidence:

```text
STARTED
```

instead of no record at all.

---

## 31. Persist terminal result separately

After authoritative success:

```text
external call succeeds
      ↓
persist EXECUTED
      ↓
persist structured effect
```

If the process then crashes before the coordinator reaches `VERIFYING`, known-success recovery becomes possible.

This is precisely the crash window demonstrated by the restart proof.

---

## 32. Why idempotency alone is insufficient

Idempotency keys are useful where external systems support them.

They can reduce duplicate-side-effect risk.

They do not eliminate the need for recovery semantics.

A provider may:

- not support idempotency
- implement it imperfectly
- expire keys
- return ambiguous timeout responses
- expose eventual-consistency reads

The architecture therefore does not rely on idempotency as its only safety mechanism.

---

## 33. Why retries are not automatically resilience

A common reliability pattern is:

```text
operation failed
→ retry
```

That is safe only when failure is known.

For non-idempotent external operations:

```text
timeout
```

often means:

```text
result unknown
```

rather than:

```text
operation failed
```

Blind retries can turn a transient technical problem into a business duplication problem.

---

## 34. Recovery favors certainty over availability

The system deliberately prefers:

```text
ESCALATED
```

over:

```text
maybe retry and hope
```

when side-effect outcome is unknown.

This can reduce automatic recovery rate.

That is acceptable.

The safety objective is:

```text
do not duplicate consequential work
```

not:

```text
always complete automatically
```

---

## 35. Reconciliation closes ambiguity

An ambiguous operation should eventually be resolved through an authoritative reconciliation mechanism.

For example:

```text
query provider using external request identity
inspect provider transaction history
consume authoritative webhook
perform manual operational review
```

The exact reconciliation mechanism is domain-specific.

The key requirement is that uncertainty is resolved from authoritative evidence, not from another guess.

---

## 36. Unknown fulfillment and unknown execution are related but distinct

The project contains two kinds of uncertainty.

### Unknown fulfillment outcome

Example:

```text
FUL-3001 = UNKNOWN
```

This is business-domain state.

The system knows that fulfillment outcome is unresolved.

---

### Unknown action execution outcome

Example:

```text
audit = STARTED
effect = null
process crashed
```

This is workflow/execution state.

The system does not know whether its mutation succeeded.

Both require fail-closed handling, but they occur at different architectural layers.

---

## 37. Historical absence is not authoritative absence

Suppose the execution audit says:

```text
STARTED
```

and the current local repository does not yet expose a new attempt.

That repository snapshot cannot retroactively prove the external call failed.

The system therefore avoids the invalid inference:

```text
I cannot see it
→ it did not happen
```

This is an important distributed-systems distinction.

---

## 38. Crash recovery is deterministic

The model does not decide:

```text
Should I retry after this crash?
```

Recovery logic evaluates durable machine state.

Conceptually:

```text
if known valid EXECUTED effect:
    recover and verify

else if ambiguous STARTED:
    escalate

else:
    evaluate explicitly supported recovery state
```

This keeps mutation replay decisions out of probabilistic reasoning.

---

## 39. No model call is needed to recover known execution

If durable evidence proves:

```text
ACT-1 already executed
```

there is nothing for an LLM to reinterpret.

The coordinator can deterministically move toward verification.

This demonstrates the broader architecture:

```text
uncertain reasoning
→ LLM

execution safety
→ deterministic state machine
```

---

## 40. Recovery uses durable state, not model memory

The previous model may have said:

```text
The fulfillment attempt was created successfully.
```

That statement does not establish recovery truth.

Likewise, if the model never saw the action result before the crash, that does not establish failure.

Recovery uses:

```text
execution audit
structured effect
approval state
automation state
fresh authoritative reads
```

not remembered conversation.

---

## 41. Process restart should lose in-memory objects

A meaningful restart proof must not simply call another coordinator function against the same transient objects while pretending the process restarted.

The crash evaluations deliberately persist the relevant workflow snapshot, discard the original runtime objects, construct fresh stores, and reconstruct state.

This tests:

```text
durable evidence
→ new runtime
→ safe recovery
```

rather than:

```text
same process objects
→ another function call
```

---

## 42. Current evaluation persistence

The restart evaluations use lightweight persisted snapshots to make the crash boundary explicit without introducing a production database.

The purpose is to prove semantics:

```text
state survives runtime loss
```

not to claim that JSON snapshot persistence is the production storage architecture.

Production substitution is covered in `PRODUCTION_ARCHITECTURE.md`.

---

## 43. Known-success restart proof

The approved-execution restart scenario demonstrates:

```text
approved action
      ↓
approval CONSUMED
      ↓
write succeeds
      ↓
EXECUTED + effect durable
      ↓
coordinator progress lost
      ↓
new runtime
      ↓
existing execution recovered
      ↓
0 replay
      ↓
independent verification
      ↓
COMPLETED
```

This is the positive recovery path.

---

## 44. Ambiguous restart proof

The ambiguous-execution restart scenario demonstrates:

```text
approved action
      ↓
approval CONSUMED
      ↓
STARTED durable
      ↓
possible side-effect boundary crossed
      ↓
terminal result lost
      ↓
new runtime
      ↓
0 replay
      ↓
ESCALATED
```

This is the fail-closed recovery path.

---

## 45. The combined recovery matrix

```text
                    Durable evidence
                          │
          ┌───────────────┴────────────────┐
          │                                │
   EXECUTED + effect                 STARTED only
          │                                │
          ▼                                ▼
   known success                    outcome ambiguous
          │                                │
          ▼                                ▼
     NO REPLAY                         NO REPLAY
          │                                │
          ▼                                ▼
      VERIFY                             ESCALATE
          │
          ▼
 fresh authoritative state
          │
          ▼
 COMPLETED or ESCALATED
```

The shared invariant is:

```text
restart never blindly replays a consequential unknown write
```

---

## 46. What would constitute a recovery safety violation

Examples include:

```text
STARTED + no effect
→ execute mutation again
```

```text
CONSUMED approval
→ reset to APPROVED after crash
```

```text
EXECUTED + valid effect
→ ignore it and create another resource
```

```text
recover unrelated historical execution
```

```text
parse audit reason text to invent a missing structured effect
```

```text
multiple conflicting executions
→ arbitrarily choose one
```

```text
missing current resource
→ assume previous write failed
→ replay
```

These cases violate the recovery contract.

---

## 47. Recovery and verification have different jobs

Recovery determines:

```text
Did this logical action already cross or complete the mutation boundary?
```

Verification determines:

```text
What does authoritative operational state show now?
```

Known-success recovery therefore does not replace verification.

Ambiguous recovery does not begin normal verification because there is no trustworthy structured success effect identifying what should be verified.

---

## 48. Recovery and business completion are different

Recovering:

```text
FULFILLMENT_ATTEMPT_CREATED
```

does not mean the customer has already received the product.

It means the system knows the requested replacement attempt was created.

Verification may confirm:

```text
PENDING
```

and close this automation action while the new fulfillment proceeds asynchronously.

Recovery claims only what the durable evidence proves.

---

## 49. Production concurrency

In production, crash recovery also interacts with concurrent workers.

Two restarted workers must not both decide to recover or execute the same logical action independently.

A durable database should enforce:

```text
unique logical execution
optimistic concurrency
conditional state transition
transactional approval consumption
```

The exact implementation is described in `PRODUCTION_ARCHITECTURE.md`.

---

## 50. Recovery state should be inspectable

Operators should be able to answer:

```text
What action was attempted?

Which approval authorized it?

Did execution start?

Was terminal success recorded?

What exact effect was recorded?

Was the action replayed?

Why was the workflow escalated?

What resource is verification checking?
```

The execution audit and workflow correlations provide those answers without requiring reconstruction from logs or model transcripts.

---

## 51. Why this matters for AI systems

Many agent demos are safe only while:

```text
one process stays alive
and
each tool call returns a clean result
```

That assumption breaks at the most consequential point: external mutation.

An operational AI system must handle:

```text
timeouts
partial failures
process crashes
stale coordinator state
duplicate worker delivery
ambiguous external outcomes
```

without turning uncertainty into repeated side effects.

Crash recovery is therefore part of the safety architecture, not merely infrastructure polish.

---

## 52. Design invariants

The crash-recovery layer should preserve these rules:

```text
Coordinator state alone does not prove execution outcome.

Structured execution effects are authoritative machine evidence.

Audit prose is never parsed as execution state.

EXECUTED + valid effect means known success.

Known success is recovered without replay.

Recovered success still requires independent verification.

STARTED after a possible side-effect boundary means ambiguity.

Ambiguity is not converted into failure.

Ambiguous consequential execution is never blindly replayed.

Missing visible downstream state does not prove no side effect occurred.

Consumed approval remains consumed after ambiguous execution.

One approval cannot authorize multiple replay attempts.

Malformed or contradictory success evidence fails closed.

Multiple conflicting executions fail closed.

Recovery correlates the exact action and approval.

Known pre-side-effect failure is distinct from ambiguous post-boundary failure.

Retries require explicit evidence that retry is safe.

A process crash does not imply an external call failed.

Recovery is deterministic and does not require an LLM.

Durable system state, not model memory, drives restart behavior.

A real restart proof reconstructs fresh runtime state from persisted evidence.

Process continuity is not required for mutation safety.
```

---

## Related documentation

- `ACTION_SAFETY.md` — approval, execution, auditing, and verification
- `AUTOMATION.md` — durable workflow lifecycle
- `CONTEXT_AND_PROVENANCE.md` — durable system knowledge versus model context
- `EVALUATIONS.md` — crash/restart and safety evaluations
- `PRODUCTION_ARCHITECTURE.md` — transactional persistence and concurrency requirements
