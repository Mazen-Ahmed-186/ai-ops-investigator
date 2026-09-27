# RAG and Runbooks

`ai-ops-investigator` uses retrieval-augmented generation to ground remediation decisions in explicit operational knowledge.

The purpose of retrieval in this project is not to answer arbitrary questions from a large document corpus.

It has a narrower job:

> Given a structured diagnosis, retrieve the operational runbooks that actually govern what should happen next.

This keeps remediation tied to documented procedures rather than allowing the model to invent recovery steps from general intuition.

---

## 1. Why RAG is used here

The investigation layer answers:

```text
What happened?
```

The knowledge layer answers:

```text
What does the operational playbook say should happen in this class of incident?
```

Those are different problems.

For example:

```text
OBSERVATION
Fulfillment outcome is UNKNOWN.

DIAGNOSIS
FULFILLMENT incident.
```

does not automatically imply:

```text
Create another fulfillment attempt.
```

The correct next step depends on operational knowledge.

In this project, the relevant runbook states that a timeout after a possible external side-effect boundary must be reconciled before any retry.

That makes runbooks part of the safety model, not just extra context.

---

## 2. Current runbook corpus

The current knowledge base intentionally contains a small number of focused runbooks.

### `RUNBOOK-DB-TIMEOUT`

Covers:

```text
successful fulfillment
+
successful delivery
+
final order-state persistence failure
```

The key rule is:

```text
do not repeat fulfillment
```

If delivery is already confirmed and the order is merely stale, the recovery path is order-state reconciliation.

---

### `RUNBOOK-NOTIFICATION-FAILURE`

Covers:

```text
successful commerce workflow
+
failed customer notification
```

The key rule is:

```text
notification recovery must remain isolated
```

Retrying a notification must not trigger:

- new payment
- new fulfillment
- new entitlement issuance

---

### `RUNBOOK-UNKNOWN-FULFILLMENT`

Covers:

```text
external fulfillment request
+
timeout after possible side-effect boundary
+
provider outcome unconfirmed
```

The key rule is:

```text
reconcile before retry
```

While an attempt is `UNKNOWN` or `RECONCILING`, the system must not create a fallback fulfillment attempt.

---

### `RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE`

Covers:

```text
payment captured
+
fulfillment terminally CONFIRMED_FAILED
+
no entitlement delivered
```

The key rule is that a known terminal failure may permit a replacement fulfillment path, subject to action policy and approval.

---

## 3. Runbooks are operational knowledge, not current state

A runbook may say:

```text
If fulfillment is UNKNOWN, reconcile before retry.
```

That is knowledge.

It does not establish that:

```text
ORD-3001 is currently UNKNOWN.
```

That fact must come from an operational observation.

The architecture keeps these separate:

```text
observation
+
knowledge
=
grounded remediation
```

not:

```text
knowledge
=
current truth
```

---

## 4. Retrieval pipeline

The project uses a staged retrieval pipeline rather than a single opaque search step.

Conceptually:

```text
diagnosis / remediation query
        ↓
lexical candidate retrieval
        ↓
embedding-based semantic ranking
        ↓
LLM reranking
        ↓
retrieved runbooks
        ↓
remediation generation
```

Each stage has a different purpose.

---

## 5. Lexical retrieval

Lexical search is the first candidate-generation layer.

It performs well when the incident query shares important operational vocabulary with a runbook.

Examples include terms such as:

```text
database timeout
notification failure
unknown fulfillment
confirmed failure
reconcile
retry
```

Lexical retrieval is inexpensive, deterministic, and easy to inspect.

It is especially useful in a small knowledge base where exact domain terminology carries strong signal.

---

## 6. Semantic retrieval

Embeddings add semantic similarity beyond exact token overlap.

This matters when the diagnosis says:

```text
provider outcome could not be confirmed after timeout
```

while the runbook might use phrasing such as:

```text
unknown fulfillment outcome
```

The wording differs, but the operational meaning is related.

Semantic retrieval helps preserve that relationship.

---

## 7. LLM reranking

Candidate retrieval answers:

```text
Which runbooks might be relevant?
```

Reranking answers:

```text
Which of these candidates best matches this incident?
```

The reranker works over a bounded candidate set rather than the full knowledge base.

This lets the system consider richer semantic context without turning the language model into the primary search engine.

The overall division of responsibility is:

```text
retrieval
→ find plausible candidates

reranker
→ order candidates by contextual relevance

remediation model
→ use retrieved runbooks to propose actions

grounding validator
→ enforce that recommendations cite retrieved knowledge
```

---

## 8. Why not use a vector database

A vector database is not currently necessary.

The corpus is:

- small
- version-controlled
- operationally focused
- cheap to scan
- easy to evaluate deterministically

Adding a dedicated vector store would create additional infrastructure without materially improving the retrieval problem being demonstrated.

The current architecture already proves the important concepts:

```text
candidate generation
semantic similarity
reranking
knowledge provenance
grounding validation
```

The storage backend can change later without changing those contracts.

A production system with thousands or millions of runbooks could substitute a vector index or hybrid search service.

That is an infrastructure decision, not a change to the RAG semantics.

---

## 9. Retrieval query generation

The remediation layer generates a query from the structured incident context.

For example:

```text
order remains PROCESSING
payment and delivery succeeded
database timeout prevented FULFILLED persistence
```

may produce a search query such as:

```text
order stuck in PROCESSING after successful fulfillment and delivery
because database timeout prevented transition to FULFILLED
supported remediation
```

The query is not itself trusted operational knowledge.

It is only a mechanism for finding candidate runbooks.

---

## 10. Retrieval results retain identity

Retrieved runbooks retain stable IDs such as:

```text
RUNBOOK-DB-TIMEOUT
RUNBOOK-NOTIFICATION-FAILURE
```

Recommendations do not merely receive anonymous chunks of prose.

Stable IDs allow the system to record:

```text
retrievedRunbookIds
```

and:

```text
supportedByRunbookIds
```

This provides a traceable relationship between:

```text
what knowledge was available
```

and:

```text
what knowledge the model claims supports an action
```

---

## 11. Retrieval is not grounding

Finding a relevant runbook does not guarantee the model will actually follow it.

For example, the system might retrieve:

```text
RUNBOOK-UNKNOWN-FULFILLMENT
```

which says:

```text
reconcile provider state before retrying
```

and the model could still incorrectly recommend:

```text
CREATE_FULFILLMENT_ATTEMPT
```

Retrieval alone does not prevent that error.

This is why the project has a separate grounding-validation layer.

---

## 12. Grounding validation

Every remediation action declares:

```text
supportedByRunbookIds
```

The system verifies that those IDs are part of the actual retrieved set.

Conceptually:

```text
recommended action
        ↓
claims support from RUNBOOK-X
        ↓
was RUNBOOK-X actually retrieved?
        ↓
yes → grounding may proceed
no  → fail closed
```

A model cannot safely cite arbitrary knowledge that was never provided to it during the remediation run.

---

## 13. Unsupported actions fail closed

If the model cannot produce a recommendation supported by retrieved runbooks, the system does not silently invent a safe-looking action.

The remediation path can terminate as:

```text
NO_APPLICABLE_RUNBOOK
```

rather than treating general model knowledge as an acceptable substitute.

This is important because:

```text
the model knows something plausible
```

is not equivalent to:

```text
the organization's operational knowledge authorizes this response
```

---

## 14. Grounding is action-specific

A runbook being relevant to the incident does not mean it supports every proposed action.

For example:

```text
RUNBOOK-NOTIFICATION-FAILURE
```

may support:

```text
retry customer notification
```

but it does not support:

```text
create fulfillment attempt
```

Likewise:

```text
RUNBOOK-DB-TIMEOUT
```

may support:

```text
reconcile stale order state
```

but not:

```text
issue refund
```

The grounding relationship therefore exists at the action level.

---

## 15. Retrieval does not grant mutation authority

A retrieved runbook may support an action such as:

```text
CREATE_FULFILLMENT_ATTEMPT
```

That still does not mean the action is authorized.

The complete path is:

```text
retrieved knowledge
        ↓
grounded remediation
        ↓
capability mapping
        ↓
deterministic policy
        ↓
optional human approval
        ↓
fresh execution-time validation
        ↓
mutation
```

Knowledge answers:

```text
what should be considered
```

Policy answers:

```text
what may actually be executed
```

---

## 16. Retrieval and capability mapping are separate

The remediation model operates in natural language and structured action intent.

The system then maps that intent to an exact executable capability.

This separation matters.

A runbook might instruct:

```text
reconcile provider state
```

but the system may have no executable provider-reconciliation capability.

In that case the correct outcome is not:

```text
RECONCILE_ORDER_STATE
```

just because the words look similar.

The correct result is:

```text
no matching executable capability
→ escalate
```

RAG supplies operational guidance.

It does not redefine what the system is technically capable of doing.

---

## 17. Natural-language similarity is not capability equivalence

This project deliberately protects against substitutions such as:

```text
"reconcile provider state"
≈
"reconcile order state"
```

Those phrases are linguistically similar.

They are operationally different.

Likewise:

```text
"retry notification"
```

is not equivalent to:

```text
"retry fulfillment"
```

The model can reason over language.

The deterministic capability layer decides exact executable meaning.

---

## 18. Runbooks contain negative guidance

Operational knowledge is not limited to instructions for what to do.

Some of the most important rules specify what **not** to do.

For example:

```text
Do not repeat fulfillment.
```

```text
Do not create a fallback fulfillment attempt while outcome is UNKNOWN.
```

```text
Notification retry must not trigger new payment or fulfillment.
```

These negative constraints are central to the safety model.

A useful runbook therefore contains both:

```text
required recovery behavior
```

and:

```text
prohibited behavior
```

---

## 19. Constraints can be first-class remediation output

A retrieved runbook may support a non-executable constraint rather than an immediate mutation.

For example:

```text
Provider state must be reconciled before any replacement attempt.
```

That is operationally meaningful even if the system currently has no matching execution capability.

The remediation schema can represent this as:

```text
CONSTRAINT
actionKind = null
```

rather than forcing every piece of runbook guidance into an executable action.

This is especially important for unknown fulfillment outcomes.

---

## 20. Small corpus, explicit evidence

The current corpus is intentionally small because the project is demonstrating architecture, not document-ingestion scale.

A reviewer can inspect:

- the runbooks
- the retrieval results
- the grounding IDs
- the final action
- the downstream policy decision

This makes the knowledge path auditable end to end.

The useful proof is not:

```text
we stored 100,000 chunks
```

It is:

```text
the system retrieved the right operational rule
and refused to act outside that rule
```

---

## 21. Example: stale completed order

For `ORD-1001`, investigation establishes:

```text
payment CAPTURED
fulfillment SUCCEEDED
delivery DELIVERED
order still PROCESSING
database timeout during completion persistence
```

Retrieval surfaces:

```text
RUNBOOK-DB-TIMEOUT
```

which says not to repeat fulfillment.

The resulting primary action is:

```text
RECONCILE_ORDER_STATE
```

supported by:

```text
RUNBOOK-DB-TIMEOUT
```

A separate notification failure may also retrieve:

```text
RUNBOOK-NOTIFICATION-FAILURE
```

without allowing the two failure domains to become conflated.

---

## 22. Example: confirmed fulfillment failure

For `ORD-2001`:

```text
payment CAPTURED
fulfillment CONFIRMED_FAILED
no entitlement
no delivery
```

retrieval surfaces:

```text
RUNBOOK-CONFIRMED-FULFILLMENT-FAILURE
```

The remediation layer can then recommend:

```text
CREATE_FULFILLMENT_ATTEMPT
```

subject to deterministic policy.

The runbook establishes operational appropriateness.

It does not bypass human approval.

---

## 23. Example: unknown fulfillment outcome

For `ORD-3001`:

```text
provider request sent
timeout after possible side-effect boundary
fulfillment UNKNOWN
```

retrieval surfaces:

```text
RUNBOOK-UNKNOWN-FULFILLMENT
```

The runbook requires provider reconciliation before retry.

Because the current executable capability set does not contain provider reconciliation, the safe result is:

```text
no executable primary action
→ ESCALATED
```

This is one of the strongest demonstrations of why retrieval, grounding, and capability mapping must remain separate layers.

---

## 24. Example: notification-only failure

For `ORD-4001`:

```text
order FULFILLED
delivery DELIVERED
notification FAILED
```

retrieval surfaces:

```text
RUNBOOK-NOTIFICATION-FAILURE
```

The supported action is:

```text
RETRY_NOTIFICATION
```

while the runbook also preserves the constraint that notification recovery must not affect payment or fulfillment.

---

## 25. Retrieval quality and remediation quality are different

A remediation can fail for different reasons.

### Retrieval failure

The relevant runbook was not retrieved.

Example:

```text
incident = unknown fulfillment
retrieved = DB timeout runbook only
```

---

### Grounding failure

The correct runbook was retrieved, but the recommendation cites unsupported or absent knowledge.

---

### Reasoning failure

The correct runbook was retrieved, but the model interprets it incorrectly.

---

### Capability failure

The correct recommendation is grounded, but no exact executable capability exists.

These failure modes should not be collapsed into one metric.

They imply different fixes.

---

## 26. Retrieval evaluation

The project evaluates runbook retrieval independently of downstream automation behavior.

Useful checks include:

```text
Was the expected runbook retrieved?
```

```text
Was it ranked highly enough to reach the remediation model?
```

```text
Did the recommendation cite an actually retrieved runbook?
```

```text
Did the action follow the runbook's required constraints?
```

This separation avoids misdiagnosing an action-quality problem as a search problem.

---

## 27. Why hybrid retrieval

No single retrieval method is ideal for every operational query.

Lexical matching is strong when exact terminology matters:

```text
DATABASE_TIMEOUT
UNKNOWN
notification failure
```

Semantic retrieval is useful when equivalent operational situations use different phrasing.

LLM reranking is useful when relevance depends on the full incident context.

The staged approach combines them:

```text
lexical precision
+
semantic recall
+
contextual reranking
```

without handing the entire retrieval problem to one opaque model step.

---

## 28. Production evolution

A larger deployment could replace the current retrieval adapters with:

- PostgreSQL full-text search
- Elasticsearch/OpenSearch
- a vector database
- a managed hybrid retrieval service
- a dedicated knowledge platform

The safety contracts should remain unchanged:

```text
stable knowledge identity
retrieval provenance
bounded candidate set
grounding validation
exact capability mapping
fail-closed unsupported actions
```

The backend may scale.

The semantics should not change.

---

## 29. Runbook versioning in production

The current project uses version-controlled knowledge artifacts.

A production knowledge system should preserve explicit version identity.

A remediation decision should eventually be able to answer:

```text
Which version of RUNBOOK-X supported this recommendation?
```

That protects historical auditability when operational procedures change.

For example:

```text
RUNBOOK-UNKNOWN-FULFILLMENT v3
```

may later differ from:

```text
RUNBOOK-UNKNOWN-FULFILLMENT v4
```

Historical decisions should remain attributable to the version actually used.

---

## 30. Knowledge is not silently refreshed during execution

Remediation is grounded against the runbooks retrieved for that remediation run.

The execution layer does not independently ask the model for new operational advice.

This keeps the workflow understandable:

```text
diagnosis
→ retrieve knowledge
→ remediation
→ policy
→ execution
```

rather than allowing new model-generated guidance to appear during mutation.

If business policy changes materially, the workflow should be re-planned through an explicit new remediation path rather than silently changing semantics mid-execution.

---

## 31. Design invariants

The RAG layer should preserve these rules:

```text
Runbooks are operational knowledge, not current state.

Retrieval candidates are not automatically authoritative guidance.

Retrieved runbook identity is preserved.

Recommendations may cite only retrieved knowledge.

Unsupported recommendations fail closed.

Grounding is action-specific.

A relevant runbook does not grant mutation authority.

Natural-language similarity does not imply capability equivalence.

Negative runbook constraints are first-class safety information.

No exact executable capability means escalation, not semantic substitution.

Retrieval quality and reasoning quality are evaluated separately.

A vector database is an infrastructure choice, not a prerequisite for sound RAG.

Knowledge provenance must survive downstream remediation.

Production runbooks should be versioned.
```

---

## Related documentation

- `INVESTIGATION_AGENT.md` — producing the structured diagnosis used for retrieval
- `CONTEXT_AND_PROVENANCE.md` — distinguishing knowledge from observations and inference
- `REMEDIATION.md` — converting retrieved runbooks into grounded recommendations
- `ACTION_SAFETY.md` — policy and authorization after remediation
- `EVALUATIONS.md` — retrieval and remediation evaluation methodology
- `PRODUCTION_ARCHITECTURE.md` — production persistence and knowledge-source substitution
