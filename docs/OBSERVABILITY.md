# Observability

`ai-ops-investigator` treats agent behavior as something that should be measurable rather than opaque.

A successful diagnosis is not enough to understand whether an agent is behaving well.

The system also needs to answer questions such as:

```text id="obs1"
How many model steps did the investigation need?

Which tools were called?

Were any tools failing?

How much context did the model consume?

How quickly was the prompt growing?

Where was latency spent?

Did the run terminate normally?

Is behavior drifting across repeated runs?
```

Observability therefore complements evaluation.

Evaluation asks:

```text id="obs2"
Was the behavior correct?
```

Observability asks:

```text id="obs3"
How did the system behave while producing that result?
```

---

## 1. Why AI observability is different

For a traditional deterministic function, application telemetry may be enough to inspect:

```text id="obs4"
request latency
error rate
database calls
CPU
memory
```

An agent adds another execution layer:

```text id="obs5"
model step
      ↓
tool decision
      ↓
tool execution
      ↓
new context
      ↓
next model step
```

The system therefore needs telemetry about both:

```text id="obs6"
application execution
```

and:

```text id="obs7"
model behavior
```

---

## 2. Observability is not model chain-of-thought logging

The project does not require private model reasoning traces to understand agent behavior.

Useful observability comes from externally visible execution facts:

```text id="obs8"
model step occurred
model step duration
token usage
tool requested
tool executed
tool succeeded or failed
run completed
run status
```

These facts are sufficient to understand most runtime behavior without treating hidden reasoning as an operational dependency.

---

## 3. Telemetry events

The investigation runtime emits structured telemetry events.

Examples include:

```text id="obs9"
MODEL_STEP_COMPLETED
TOOL_EXECUTION_COMPLETED
INVESTIGATION_FINISHED
```

Each event records the information relevant to that stage rather than relying only on free-form logs.

---

## 4. Model-step telemetry

A completed model step records fields such as:

```text id="obs10"
runId
step
occurredAt
durationMs
usage
```

Token usage includes:

```text id="obs11"
inputTokens
outputTokens
totalTokens
```

This makes every model round observable independently.

---

## 5. Tool-execution telemetry

Tool execution records information such as:

```text id="obs12"
runId
step
toolName
durationMs
ok
errorCategory
```

This allows the system to distinguish:

```text id="obs13"
model latency
```

from:

```text id="obs14"
tool latency
```

and:

```text id="obs15"
tool failure
```

from:

```text id="obs16"
model reasoning failure
```

---

## 6. Investigation completion telemetry

When an investigation finishes, the telemetry records its final outcome.

Relevant fields include:

```text id="obs17"
runId
durationMs
toolCalls
status
```

The terminal status can then be correlated with the events that preceded it.

---

## 7. Run-level summary

Raw events are aggregated into an investigation telemetry summary.

The current summary includes signals such as:

```text id="obs18"
outcome

totalDurationMs

modelSteps
toolCalls

modelDurationMs
toolDurationMs
overheadDurationMs

modelDurationShare

averageModelStepMs
maxModelStepMs

inputTokens
outputTokens
totalTokens

firstInputTokens
lastInputTokens
inputTokenGrowthRatio

failedToolCalls
```

These metrics describe both resource use and execution shape.

---

## 8. Total duration

`totalDurationMs` measures wall-clock investigation duration.

This is useful for answering:

```text id="obs19"
How long did the user or automation wait for a diagnosis?
```

But total duration by itself does not explain the cause of latency.

It must be decomposed.

---

## 9. Model duration

`modelDurationMs` aggregates time spent waiting on model steps.

This distinguishes model-provider latency from application overhead.

In the current local scenarios, model time dominates investigation duration. That is observable directly rather than assumed.

This matters because optimizing a repository read that takes effectively no time will not materially improve a workflow dominated by model inference.

---

## 10. Tool duration

`toolDurationMs` measures time spent executing operational tools.

A production environment may eventually show meaningful latency here from:

```text id="obs20"
databases
remote APIs
MCP calls
provider services
internal telemetry systems
```

Keeping this separate from model duration makes bottlenecks attributable.

---

## 11. Orchestration overhead

`overheadDurationMs` represents runtime work not attributed directly to model or tool execution.

This can include:

```text id="obs21"
state persistence
context projection
schema validation
control flow
serialization
```

The goal is not necessarily to reduce overhead to zero.

It is to know whether orchestration itself is becoming unexpectedly expensive.

---

## 12. Model-duration share

`modelDurationShare` measures approximately:

```text id="obs22"
modelDurationMs
÷
totalDurationMs
```

A high value tells us that most wall-clock time belongs to model inference.

A lower value may indicate that:

```text id="obs23"
tools
storage
network operations
or orchestration
```

are becoming significant contributors.

---

## 13. Model steps

`modelSteps` measures how many model turns were required to complete the investigation.

For an agent loop, this is an important behavior metric.

An increase might indicate:

```text id="obs24"
less efficient evidence gathering
worse stopping behavior
prompt ambiguity
unnecessary deliberation
```

even if tool count remains unchanged.

---

## 14. Tool calls

`toolCalls` records the number of operational tool executions.

This complements the hard investigation budget.

The runtime prevents more than the allowed maximum, while observability answers:

```text id="obs25"
How much of that budget does the agent normally use?
```

The two mechanisms have different purposes:

```text id="obs26"
budget
→ safety / boundedness

metric
→ behavior / regression signal
```

---

## 15. Tool-call distribution

Aggregated metrics record counts by tool name.

For example:

```text id="obs27"
get_order
get_payment_state
get_fulfillment_attempts
get_delivery_state
get_notification_state
get_order_event_history
get_order_processing_trace
```

This exposes the actual investigation pattern.

A prompt change might suddenly make the agent call:

```text id="obs28"
get_order_processing_trace
```

for every trivial case.

That behavior can be detected even if final answers remain correct.

---

## 16. Tool distribution can reveal over-investigation

Suppose two prompt versions both diagnose the same incident correctly.

Version A uses:

```text id="obs29"
4 tools
```

while version B consistently uses:

```text id="obs30"
7 tools
```

The second version may be collecting evidence that does not materially reduce uncertainty.

Tool-call distribution provides evidence for that conclusion.

---

## 17. Failed tool calls

`failedToolCalls` tracks tool executions that returned failure.

This helps detect problems such as:

```text id="obs31"
bad model arguments
tool regressions
fixture mismatch
remote dependency failure
```

A high-quality diagnosis obtained after several failing calls may still indicate a runtime problem worth fixing.

---

## 18. Failure category matters

Tool telemetry records an error category rather than only:

```text id="obs32"
ok = false
```

This allows failures to be separated into meaningful classes.

For example:

```text id="obs33"
NOT_FOUND
validation error
dependency error
transient infrastructure error
```

may imply very different operational responses.

---

## 19. Token usage

Token usage is aggregated across model steps:

```text id="obs34"
inputTokens
outputTokens
totalTokens
```

These metrics provide a direct signal for:

```text id="obs35"
cost
context size
response verbosity
agent-loop growth
```

They should be measured rather than guessed from prompt length.

---

## 20. Input tokens are especially important for agents

In an iterative agent, each model request may contain more context than the previous one.

Therefore input usage often grows across steps.

The system tracks:

```text id="obs36"
firstInputTokens
lastInputTokens
```

so this growth is visible.

---

## 21. Input-token growth ratio

The current summary computes:

```text id="obs37"
inputTokenGrowthRatio
=
lastInputTokens / firstInputTokens
```

This is a useful proxy for context growth during one investigation.

It answers:

```text id="obs38"
How much larger was the final model input
than the first one?
```

---

## 22. Why context-growth observability matters

Without working-memory projection, repeated tool output can make context grow rapidly.

That can increase:

```text id="obs39"
latency
cost
noise
risk of important evidence losing salience
```

The growth ratio gives the project a way to observe whether context-management changes are actually improving behavior.

---

## 23. Growth is not automatically a regression

An investigation naturally accumulates evidence.

Therefore:

```text id="obs40"
inputTokenGrowthRatio > 1
```

is expected.

The metric is not intended to enforce:

```text id="obs41"
context must never grow
```

Instead it helps detect disproportionate or unexpected growth between comparable runs.

---

## 24. Output tokens

`outputTokens` measure model-generated content.

For this project, model output is usually:

```text id="obs42"
tool-call requests
structured assessment
structured remediation
```

rather than long user-facing prose.

A sudden increase in output tokens may indicate:

```text id="obs43"
schema drift
excessive explanation
prompt regression
unexpected repeated generation
```

---

## 25. Maximum model-step duration

`maxModelStepMs` exposes the slowest single model interaction in a run.

This helps distinguish:

```text id="obs44"
all model calls became slower
```

from:

```text id="obs45"
one unusually slow step dominated the run
```

That distinction is important when interpreting tail latency.

---

## 26. Average model-step duration

`averageModelStepMs` provides the typical inference duration within one investigation.

Combined with:

```text id="obs46"
modelSteps
```

it helps explain total model time.

For example:

```text id="obs47"
more steps at similar latency
```

is different from:

```text id="obs48"
same number of steps but slower inference
```

---

## 27. Aggregating multiple runs

Repeated observability runs aggregate metrics such as:

```text id="obs49"
runs
completedRuns
successRate

averageDurationMs
p50DurationMs
p95DurationMs

averageModelSteps
averageToolCalls

averageTotalTokens
averageInputTokens
averageOutputTokens

averageModelDurationShare
averageInputTokenGrowthRatio

failedToolCalls

outcomeCounts
toolCallCounts
```

This converts individual traces into regression signals.

---

## 28. Outcome counts

`outcomeCounts` records how runs terminated.

For example:

```text id="obs50"
COMPLETED
TOOL_BUDGET_EXHAUSTED
REPEATED_TOOL_CALL
FAILED
```

depending on the cases exercised.

This prevents a success-rate aggregate from hiding how failures occurred.

---

## 29. Success rate

`successRate` measures the proportion of runs that met the expected runtime completion contract.

It is a useful stability signal.

It does **not** replace semantic evaluation.

A run can:

```text id="obs51"
complete successfully
```

while still producing:

```text id="obs52"
the wrong diagnosis
```

Runtime success and semantic correctness remain separate.

---

## 30. Observability and evaluation are complementary

Consider:

```text id="obs53"
diagnosis = wrong
tool calls = normal
tokens = normal
latency = normal
```

That suggests a reasoning-quality regression.

Now consider:

```text id="obs54"
diagnosis = correct
tool calls doubled
tokens doubled
latency increased
```

That suggests a runtime-efficiency regression.

Without both evaluation and observability, these cases can look identical from a simple pass/fail result.

---

## 31. Regression checks

The observability runner can convert selected metrics into regression checks.

Current examples include:

```text id="obs55"
minimum success rate

maximum average tool calls

maximum average model steps

maximum average total tokens

maximum failed tool calls
```

These turn operational expectations into executable checks.

---

## 32. Thresholds should represent behavior contracts

A threshold should exist because crossing it would indicate meaningful drift.

For example:

```text id="obs56"
average tool calls <= investigation budget
```

has a direct architectural basis.

Likewise, token thresholds can catch unexpectedly expanding prompts.

Thresholds should not be arbitrary numbers added merely to make a dashboard look complete.

---

## 33. Latency is noisier

Latency is influenced by factors outside the application:

```text id="obs57"
model-provider load
network conditions
region
service contention
model deployment changes
```

Therefore it needs more careful statistical handling than deterministic counters.

---

## 34. Small-sample p95 is misleading

A five-run sample does not provide a stable estimate of p95 latency.

The project initially demonstrated why this matters: one slower run could make a five-sample p95 appear to fail even though the typical behavior had not meaningfully regressed.

The observability evaluation was then corrected so p95 latency gating is skipped until enough samples exist.

This is an example of improving the **evaluation methodology**, not changing the agent to satisfy noisy statistics.

---

## 35. Current percentile rule

For small repeated runs:

```text id="obs58"
p95 may still be reported
```

but the hard regression check can be:

```text id="obs59"
SKIP
```

with an explanation such as:

```text id="obs60"
Requires at least 20 runs.
```

This preserves visibility without pretending statistical confidence exists.

---

## 36. Report versus gate

This creates an important observability distinction:

```text id="obs61"
metric reported
≠
metric used as hard gate
```

Some metrics are useful for inspection long before they are statistically appropriate for CI enforcement.

---

## 37. Current measurements are not documentation constants

Exact model latency and token values will change over time.

They depend on:

```text id="obs62"
model version
prompt version
provider behavior
scenario
network conditions
```

For that reason, this documentation describes the metrics rather than declaring one historical run as the permanent benchmark.

The evaluation runner is the source of current numbers.

---

## 38. Observability supports prompt optimization

Suppose prompt calibration improves diagnosis but increases:

```text id="obs63"
average model steps
average input tokens
```

significantly.

That trade-off becomes visible.

Likewise, a shorter prompt that reduces tokens but causes more tool exploration may not actually improve overall efficiency.

Observability makes these trade-offs measurable.

---

## 39. Observability supports context optimization

The context/provenance layer uses compact working memory rather than replaying arbitrary full history.

Metrics such as:

```text id="obs64"
firstInputTokens
lastInputTokens
inputTokenGrowthRatio
```

allow that design to be evaluated.

If a context refactor unexpectedly increases growth, it can be detected.

---

## 40. Observability supports tool design

Tool-call metrics can reveal whether capability boundaries are working well.

For example, if a tool is almost never selected, possible explanations include:

```text id="obs65"
tool is unnecessary
tool description is unclear
other tools already contain overlapping data
scenario coverage does not exercise it
```

The metric prompts investigation; it does not determine the answer automatically.

---

## 41. Observability supports stopping-criteria tuning

If repeated runs consistently use:

```text id="obs66"
all available evidence tools
```

even when fewer should be sufficient, the stopping criteria may be too conservative.

If runs stop too early and semantic quality falls, the opposite may be true.

The goal is not:

```text id="obs67"
minimum tool calls at any cost
```

It is:

```text id="obs68"
enough evidence with bounded unnecessary work
```

---

## 42. Observability supports failure triage

Suppose a live eval fails.

Telemetry can help classify why.

### Case A

```text id="obs69"
tool failed
→ model lacked evidence
→ diagnosis degraded
```

### Case B

```text id="obs70"
all tools succeeded
→ evidence available
→ model classified incorrectly
```

### Case C

```text id="obs71"
tool calls exceeded normal pattern
→ prompt or stopping behavior changed
```

These require different fixes.

---

## 43. Telemetry is correlated by run ID

Model and tool telemetry share:

```text id="obs72"
runId
```

This allows all runtime events for one investigation to be reconstructed without relying on chronological console logs alone.

In production, the same principle would apply to distributed traces or structured event storage.

---

## 44. Step numbers preserve loop order

Telemetry also records:

```text id="obs73"
step
```

This makes it possible to reconstruct:

```text id="obs74"
model step 1
→ tool A

model step 2
→ tool B

...

model final step
→ structured diagnosis
```

The execution shape remains inspectable.

---

## 45. Operational observation timestamps remain separate

Tool telemetry has:

```text id="obs75"
occurredAt
```

and:

```text id="obs76"
durationMs
```

while the operational payload may separately contain:

```text id="obs77"
observedAt
```

These timestamps describe different things.

The telemetry tells us when the investigator performed work.

The tool payload tells us when operational state was observed.

They should not be conflated.

---

## 46. Observability does not replace provenance

Telemetry can say:

```text id="obs78"
get_payment_state succeeded
```

Provenance can say:

```text id="obs79"
payment PAY-1 was observed CAPTURED
at timestamp X
from commerce_repository
```

Both are useful.

They serve different purposes.

---

## 47. Observability does not replace audit

Likewise, investigation telemetry is not the same thing as action-execution audit.

Telemetry answers:

```text id="obs80"
what runtime activity occurred?
```

Execution audit answers:

```text id="obs81"
what consequential action was authorized and attempted?
```

The action audit has stronger business and recovery semantics.

---

## 48. Observability does not grant authority

A metric can reveal:

```text id="obs82"
the model called get_fulfillment_attempts
```

It cannot authorize:

```text id="obs83"
CREATE_FULFILLMENT_ATTEMPT
```

Telemetry remains descriptive.

It never participates in mutation policy.

---

## 49. Safety metrics deserve separate visibility

The live safety suite tracks:

```text id="obs84"
passed
failed
passRate
safetyViolations
safetyViolationRate
```

These should remain separate from runtime metrics such as latency or token use.

A faster unsafe system is not an improvement.

---

## 50. Action-count observability

For automation scenarios, useful signals include:

```text id="obs85"
approval count
execution count
effect
terminal state
```

These make over-execution visible.

For example:

```text id="obs86"
expected executions = 0
actual executions = 1
```

is immediately recognizable as a serious safety regression.

---

## 51. Crash-recovery observability

Recovery evals expose signals such as:

```text id="obs87"
replayAttempts
executionAudits
recoveredExecutionId
verification
terminal automation state
```

The critical recovery metric is often:

```text id="obs88"
replayAttempts = 0
```

Observability makes that safety claim explicit.

---

## 52. Why `replayAttempts` is useful

Without instrumentation, a restart test could end in the correct state while still accidentally calling the mutation twice.

Tracking replay attempts makes the stronger claim:

```text id="obs89"
the system reached the correct result
without crossing the mutation boundary again
```

That distinction matters for non-idempotent operations.

---

## 53. MCP observability

The MCP smoke test also exposes useful protocol-level behavior:

```text id="obs90"
discovered tool names
tool annotations
successful calls
domain errors
validation errors
```

This makes the external capability surface inspectable.

The public protocol boundary is therefore observable as well as documented.

---

## 54. Structured logs over ad hoc strings

The project favors typed or structured telemetry where behavior needs to be analyzed.

For example:

```text id="obs91"
type = MODEL_STEP_COMPLETED
durationMs = ...
usage = ...
```

is more useful than:

```text id="obs92"
"model call finished pretty quickly"
```

Structured telemetry can be:

```text id="obs93"
aggregated
filtered
tested
exported
visualized
```

without parsing prose.

---

## 55. Human-readable console output still matters

Structured telemetry does not mean console output is useless.

During development, readable summaries such as:

```text id="obs94"
status
duration
model steps
tool calls
tokens
```

make behavior easy to inspect.

The principle is:

```text id="obs95"
structured state underneath
+
human-readable presentation above
```

---

## 56. Production telemetry backend is intentionally unspecified

The project does not require adding:

```text id="obs96"
Datadog
Honeycomb
OpenTelemetry collector
Grafana
Prometheus
```

merely to claim observability.

The important part demonstrated here is:

```text id="obs97"
what should be measured
where events are emitted
how runs are correlated
how metrics are aggregated
how regressions are interpreted
```

A production telemetry backend can be substituted later.

---

## 57. Production evolution

A production deployment could export the current signals into distributed tracing and metrics.

For example:

```text id="obs98"
investigation run
→ trace

model step
→ span

tool execution
→ span

token usage
→ span attributes / metrics

workflow terminal state
→ metric / event
```

The exact platform can vary.

The semantic signals should remain stable.

---

## 58. Useful production dimensions

Production metrics would likely be segmented by dimensions such as:

```text id="obs99"
scenario / incident class
model
model version
tool
outcome
root-cause category
remediation action
policy result
automation terminal state
```

Care should be taken not to introduce high-cardinality labels unnecessarily.

Identifiers such as individual order IDs are often better kept in traces or logs rather than metric labels.

---

## 59. Sensitive data should not become telemetry by default

Operational observability should avoid automatically logging:

```text id="obs100"
raw customer data
entitlement secrets
credentials
private provider payloads
full model prompts containing sensitive data
```

The current project uses synthetic fixtures, but production telemetry should preserve the same principle of least necessary disclosure.

---

## 60. Metrics are not business truth

Observability data may be delayed, sampled, or unavailable.

Therefore it must not become the source of truth for action execution.

For example:

```text id="obs101"
metric says fulfillment failures increased
```

can trigger investigation.

It should not directly authorize:

```text id="obs102"
refund this order
```

Business writes still depend on authoritative state and deterministic policy.

---

## 61. Observability and stochastic systems

A stochastic model creates natural variation.

Observability helps determine whether variation is:

```text id="obs103"
expected noise
```

or:

```text id="obs104"
systematic drift
```

One slower run may be noise.

A persistent increase in:

```text id="obs105"
model steps
tool calls
token growth
```

across comparable repeated runs is more likely to indicate a real regression.

---

## 62. Compare distributions, not only individual runs

For runtime behavior, repeated measurements are more useful than one snapshot.

That is why the observability runner aggregates:

```text id="obs106"
averages
percentiles
rates
counts
```

rather than declaring one run universally representative.

---

## 63. Observability should inform, not drive prompt overfitting

If one run uses one extra tool, that is not automatically a reason to change the prompt.

The workflow should be:

```text id="obs107"
observe pattern
      ↓
confirm across runs
      ↓
identify behavioral cause
      ↓
change narrowest relevant layer
```

This mirrors the project's general evidence-driven calibration approach.

---

## 64. Example diagnosis-performance question

Suppose a new prompt version produces:

```text id="obs108"
semantic pass rate unchanged

average tool calls lower

model steps lower

tokens lower
```

That is credible evidence of an efficiency improvement.

If semantic quality falls, however, reduced cost alone is not a win.

---

## 65. Example latency question

Suppose:

```text id="obs109"
tool duration unchanged
orchestration overhead unchanged
model duration increases materially
```

The likely performance bottleneck lies outside the tool implementation.

This prevents unnecessary optimization of the wrong subsystem.

---

## 66. Example context question

Suppose:

```text id="obs110"
first input size unchanged
last input size grows sharply
inputTokenGrowthRatio increases
```

after a context refactor.

That suggests more historical data is leaking into later model steps.

The provenance/working-memory implementation should be inspected.

---

## 67. Example tool-quality question

Suppose:

```text id="obs111"
failedToolCalls rises
```

while the model prompt remains unchanged.

Possible causes include:

```text id="obs112"
schema mismatch
repository regression
bad fixture data
remote system instability
```

Observability helps prevent misclassifying this as an LLM reasoning regression.

---

## 68. Example stopping-behavior question

Suppose the diagnosis remains correct, but:

```text id="obs113"
average tool calls
7 → 8

average model steps
8 → 9
```

consistently.

That may indicate the model no longer recognizes when sufficient evidence has been gathered.

This can be investigated before the hard budget begins failing.

---

## 69. Observability and regression tests

Some observability metrics are useful enough to become executable regression checks.

Others should remain informational.

A useful classification is:

```text id="obs114"
deterministic / low-noise
→ suitable for hard gate

stochastic but stable enough
→ suitable for repeated-run threshold

highly environment-sensitive
→ report first, gate only with sufficient samples
```

---

## 70. Hard-gate candidates

Examples of relatively meaningful regression gates include:

```text id="obs115"
failed tool calls
average tool-call budget
model-step budget
token ceiling
required run completion rate
```

They still need scenario-specific calibration.

---

## 71. Report-first candidates

Examples include:

```text id="obs116"
small-sample p95 latency
model-provider timing
single-run duration
```

These are useful signals but are more sensitive to external variance.

---

## 72. Observability can expose architecture mistakes

A good telemetry system can reveal architectural problems that tests do not explicitly encode.

Examples include:

```text id="obs117"
context repeatedly re-injecting full raw history

agent always querying every tool

verification requiring multiple redundant reads

MCP adding unexpected latency

automation producing duplicate audit records
```

The metrics act as diagnostic evidence for the engineering system itself.

---

## 73. Current scope

The current observability implementation focuses primarily on investigation runtime behavior and evaluation summaries.

It does not yet attempt to be a full production monitoring platform.

That is intentional.

The project demonstrates the instrumentation model before selecting production infrastructure.

---

## 74. What is intentionally out of scope

The portfolio project does not currently need:

```text id="obs118"
hosted dashboards
alert routing
distributed log infrastructure
APM vendor integration
long-term metrics retention
SLO infrastructure
```

Those are straightforward production substitutions once the correct signals exist.

Adding them would increase infrastructure volume without materially strengthening the AI-engineering proof.

---

## 75. Production questions this design can answer

With a production telemetry backend, the current event model could support questions such as:

```text id="obs119"
Which incident classes use the most model steps?

Which tools fail most often?

How often does automation escalate?

How often is human approval required?

What proportion of latency comes from the model?

How quickly is prompt context growing?

Are safety violations occurring?

Are crash recoveries replay-free?
```

These are operationally useful questions for an AI system.

---

## 76. Observability is part of the feedback loop

The project development loop is:

```text id="obs120"
build
  ↓
evaluate correctness
  ↓
observe runtime behavior
  ↓
identify failure or inefficiency
  ↓
change narrowest relevant layer
  ↓
rerun
```

Observability is therefore not only a production concern.

It is part of model and system development.

---

## 77. Design invariants

The observability layer should preserve these principles:

```text id="obs121"
Agent runtime behavior is measurable.

Model timing and tool timing remain separate.

Model steps are counted.

Tool calls are counted by capability.

Failed tool calls are visible.

Token usage is measured per run.

Input-context growth is measurable.

Raw telemetry is correlated by run ID and step.

Operational observedAt remains distinct from telemetry occurredAt.

Runtime telemetry does not replace evidence provenance.

Runtime telemetry does not replace action audit.

Metrics never grant mutation authority.

Correctness and efficiency remain separate dimensions.

Task pass rate and safety-violation rate remain separate.

Regression thresholds should represent meaningful contracts.

Noisy metrics require sufficient sample size before hard gating.

Small-sample percentiles may be reported without being enforced.

Exact historical performance numbers are not treated as permanent constants.

Structured telemetry is preferred over prose parsing.

Observability should identify the failing subsystem before prompt changes are made.

A production telemetry backend can change without changing metric semantics.
```

---

## Related documentation

- `INVESTIGATION_AGENT.md` — the runtime being instrumented
- `CONTEXT_AND_PROVENANCE.md` — operational evidence provenance
- `EVALUATIONS.md` — regression checks and repeated-run methodology
- `ACTION_SAFETY.md` — execution audit and safety metrics
- `AUTOMATION.md` — workflow outcomes and action correlations
- `CRASH_RECOVERY.md` — replay and recovery observability
- `MCP.md` — protocol-surface validation
- `PRODUCTION_ARCHITECTURE.md` — production deployment and telemetry substitution
