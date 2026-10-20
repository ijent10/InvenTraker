# Shared product catalog API

The versioned catalog API exposes the same UPC-backed product facts to InvenTraker, SimpliPantri, and approved outside services. It reads the promoted central catalog first and then the server-only Open Food Facts staging catalog. The response applies versioned user corrections without changing the retained source evidence.

Base URL: `https://inventraker.com/api/v1/catalog`

Authentication uses either `Authorization: Bearer <Firebase ID token>` plus `X-InvenTraker-Org`, or `X-API-Key: <scoped key>`. Outside keys are stored as SHA-256 hashes, can expire, can be revoked, and are shown in plaintext only once. Available scopes are `catalog:read`, `catalog:contribute`, `catalog:write`, and `inventory:read`.

## Endpoints

- `GET /products?q={UPC or product-name prefix}&limit=20` searches by exact validated UPC/GTIN or a product-name prefix.
- `GET /products/{UPC}` resolves one UPC, including nutrition, ingredients, allergens, size, packaging, images, source, license, and the current correction revision.
- `POST /resolve` resolves up to 100 barcodes for an AI, scanner, or import job.
- `POST /contributions` accepts one or up to 100 product suggestions into a review queue.
- `PATCH /products/{UPC}` applies a reviewed shared correction. `expectedRevision` provides optimistic concurrency and every accepted change creates an immutable edit event.
- `GET /api/v1/inventory?storeId={id}&barcode={UPC}&limit=100` gives an organization-bound AI a safe inventory view. Its response uses a strict business-field allowlist and contains no employee names, user IDs, badge numbers, or edit-actor identifiers.
- `GET|POST|DELETE /api/admin/catalog/api-keys` lists, creates, and revokes scoped outside credentials. It requires a platform administrator Firebase token.

Example batch lookup:

```json
POST /api/v1/catalog/resolve
X-API-Key: ivtk_...
Content-Type: application/json

{"barcodes":["012345678905","5000112637922"]}
```

Example correction:

```json
PATCH /api/v1/catalog/products/012345678905
Authorization: Bearer <firebase-id-token>
X-InvenTraker-Org: example-org
Content-Type: application/json

{
  "expectedRevision": 2,
  "reason": "Verified against the package label",
  "patch": {
    "productName": "Example Cereal, Honey",
    "quantity": "12 oz",
    "ingredients": "Whole grain oats, honey",
    "imageUrls": ["https://images.example/product.jpg"]
  }
}
```

Direct Firestore access remains denied for API keys, source staging, corrections, and edit events. Organization inventory, prices, quantities, employees, and business records are outside this API and require their own organization-scoped authorization.

An exact UPC lookup checks the staged record first. When its images, ingredients, or package size are incomplete, the server performs a rate-conscious lookup against the current Open Food Facts product endpoint, accepts the response only when its validated GTIN exactly matches, fills missing fields without replacing populated facts, and caches the result for at least 24 hours. Product-name searches never attach outside data to a different UPC.

Open Food Facts records retain their source URL and ODbL attribution. Callers displaying or redistributing those facts must preserve the returned attribution and license fields.
