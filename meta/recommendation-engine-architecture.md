# InvenTraker Recommendation Engine Architecture

## Objective
Guarantee one shared recommendation engine across iOS, web, admin, and future integrations.

## Source of Truth
- Backend only: `/Users/ianjent/Desktop/InvenTracker/functions/src/recommendation/`
- Primary callables:
  - `getStoreRecommendations` (preview)
  - `commitOrderRecommendations` (apply)
- Deprecated compatibility wrapper:
  - `generateOrderSuggestions` (must delegate to backend engine path)

## Engine Pipeline
1. Feature collection and normalization: `feature-collector.ts`
2. Demand forecasting (`rules_v1`): `demand-rules-v1.ts`
3. Waste-risk forecasting (`rules_v1`): `waste-risk-rules-v1.ts`
4. Recommendation optimization:
   - Orders: `order-optimizer-rules-v1.ts`
   - Production: `production-optimizer-rules-v1.ts`
5. Rationale/factors: `rationale.ts`
6. Persistence + run logs: `persistence.ts`
7. Degraded fallback response shaping: `fallback.ts`

## Contracts
- Shared schemas: `/Users/ianjent/Desktop/InvenTracker/packages/shared/src/schemas/recommendations.ts`
- Callable schemas: `/Users/ianjent/Desktop/InvenTracker/packages/shared/src/schemas/functions.ts`
- Current schema version: `recommendations_v2`

## Version Roadmap
- `rules_v1`: deterministic baseline (current)
- `hybrid_v2`: rules + predictive blend
- `ml_v3`: model-first predictions with rules fallback

All engine versions must emit:
- `engineVersion`
- `schemaVersion`
- `runId`
- `rulePathUsed`
- `sourceRefs`
- `inputHash`
- `degraded/fallback` metadata

## Client Boundaries
Clients may only:
- fetch backend recommendations
- cache latest server results
- render and edit values in UI
- commit approved lines to backend

Clients must not execute primary recommendation math.

Fallback-only modules:
- iOS: `/Users/ianjent/Desktop/InvenTracker/InstaTracker/Services/RecommendationFallbackService.swift`
- Web: `/Users/ianjent/Desktop/InvenTracker/apps/web/src/lib/recommendations/fallback.ts`

Emergency fallback is allowed only when backend call fails/unreachable.
Backend degraded responses are still backend-primary.

## Persistence and Auditability
Stored artifacts:
- `organizations/{orgId}/.../stores/{storeId}/recommendations/{windowKey}`
- `organizations/{orgId}/.../stores/{storeId}/recommendationRuns/{runId}`

Run metadata includes:
- `engineVersion`, `schemaVersion`
- `rulePathUsed`, `sourceRefs`
- `inputHash`
- `fallbackUsed`, `fallbackReason`
- `fallbackSource`, `fallbackTrigger`

## Rollout and Safety
1. Keep `rules_v1` behavior stable as baseline.
2. Preserve fallback modules for emergency path only.
3. Use parity tests to guard drift.
4. Enforce boundaries via:
   - `/Users/ianjent/Desktop/InvenTracker/scripts/check-single-engine-boundaries.ts`
   - `npm run check:single-engine`
