# InvenTraker Engineering Rules

## Core Rule
There must be exactly one recommendation engine for order and production recommendations.
All recommendation business logic lives on the backend (Cloud Functions).

Primary backend endpoints:
- `getStoreRecommendations` (preview)
- `commitOrderRecommendations` (apply)
- `generateOrderSuggestions` is deprecated compatibility only and must internally delegate to backend engine.

## Client Rules
Web and iOS clients may only:
- request recommendation results
- cache recommendation results
- render recommendation results
- show degraded fallback state when backend is unavailable

Clients must not implement independent primary recommendation math.

Allowed fallback-only modules:
- `/Users/ianjent/Desktop/InvenTracker/InstaTracker/Services/RecommendationFallbackService.swift`
- `/Users/ianjent/Desktop/InvenTracker/apps/web/src/lib/recommendations/fallback.ts`

Forbidden duplication patterns outside fallback modules:
- `ProductionPlanningService.`
- `makeTodaySuggestions(`
- `generateFrozenPullRows(`
- `OrderRecommendationEngine.calculate(`

Enforcement script:
- `npm run check:single-engine`
- Implemented at `/Users/ianjent/Desktop/InvenTracker/scripts/check-single-engine-boundaries.ts`

## Engine Evolution
Recommendation engines must be versioned.
Preserve deterministic rules as fallback and benchmark.
New forecasting features must plug into backend feature collection modules.

## Auditability
All recommendation responses must include:
- engine version
- schema version
- run id
- timestamp
- fallback/degraded flags
- input hash or equivalent trace id
- top contributing factors where available
- rule path used
- source refs
