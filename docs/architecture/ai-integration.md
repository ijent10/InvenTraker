# AI integration architecture

## Existing implementation

The deployed application already includes local/Ollama and OpenAI-compatible paths, context and privacy helpers, structured responses, product resolution, tool orchestration, retrieval, memory/learning stores, and operational decision selection. This foundation should be normalized rather than replaced.

## Provider interface

```ts
type AICapability = "text" | "structured" | "streaming" | "tools" | "embeddings"

interface AIProvider {
  id: string
  supportedCapabilities(): Promise<Set<AICapability>>
  healthCheck(): Promise<{ available: boolean; latencyMs?: number }>
  generate(request: TextRequest): Promise<TextResult>
  generateStructured<T>(request: StructuredRequest<T>): Promise<T>
  stream?(request: TextRequest): AsyncIterable<TextDelta>
}
```

Adapters negotiate capabilities. Structured output falls back to text plus local validation only when the use case permits it. Tool calling can use an application-side planner when a provider lacks native tools. Provider/model selection is configuration, not UI architecture.

## Assistant pipeline

1. Resolve authenticated principal and active organization/location.
2. Classify request and required tools.
3. Build minimized authorized context.
4. Execute read tools through the permission gateway.
5. Generate and validate a structured answer.
6. Return source references, freshness, degraded flags, and proposed actions.
7. Require explicit confirmation before an impactful write tool executes.

Tools call engine queries/commands; they do not read arbitrary collections. Invalid identifiers, unauthorized records, and hallucinated candidates are rejected.

## Workspace intelligence

Each engine produces authorized `WidgetCandidate` values. Deterministic eligibility runs first. Critical rule-based conditions cannot be hidden by a model.

Fallback score:

- urgency 30%
- operational impact 25%
- user relevance 20%
- actionability 15%
- recency 10%

AI may rerank eligible IDs and choose an approved content variant. Output is schema-validated and limited to candidate IDs supplied in the request. User `pinned` and `fixed` modes override AI. AI never changes layout or business facts.

## Privacy and isolation

- External providers receive only configured, authorized, minimized context.
- Provider configuration records retention and data-use policy.
- Cache keys include organization, location scope, user permission fingerprint, candidate set, model, and prompt version.
- Private records are not used for model training without explicit governance and consent.
- Logs store trace IDs and redacted metadata, not raw secrets or unnecessary prompt bodies.

## Reliability

Ordinary navigation and widgets do not block on AI. Provider health, timeout, invalid output, and quota failures return deterministic fallback content. Expensive ranking is event-driven and cached; it is not invoked on render or resize.

Recommendation responses include engine version, schema version, run ID, timestamp, fallback/degraded flags, trace/input hash, factors, rule path, and source references. The existing single recommendation-engine rule remains authoritative: clients request, cache, render, and degrade; they do not recreate primary math.

## Tests

- adapter capability negotiation and provider failover
- tenant/location/permission context minimization
- rejection of unknown candidate and record IDs
- pinned/fixed precedence
- critical deterministic alerts under adversarial ranking
- malformed structured output
- timeout/quota/offline fallback
- write-tool confirmation and idempotency

## Rollback

Provider adapters and AI ranking ship behind separate flags. Disabling either leaves deterministic assistant/tool responses and widget ranking. Provider changes require no operational data migration.
