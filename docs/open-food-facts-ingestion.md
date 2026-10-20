# Open Food Facts ingestion architecture

## Decision record

InvenTraker uses Firestore. Its existing product hierarchy is preserved:

1. `centralCatalog/{centralProductId}` owns reusable global identity, description, nutrition, images, and source evidence.
2. `orgs/{orgId}/products/{productId}` opts a business into a central product and stores organization-specific classification and notes.
3. Store inventory and `stores/{storeId}/productDetails` own quantities, prices, availability, internal SKUs, vendors, locations, expiration behavior, and purchase history.

Open Food Facts ingestion never creates organization products or inventory. New records first enter the server-only `openFoodFactsStaging` collection. Validation failures enter `openFoodFactsRejects`; run state and checkpoints enter `openFoodFactsImportRuns`. The importer never writes `centralCatalog`. A separate platform-admin promotion operation uses Firestore `create` semantics, refuses a duplicate normalized GTIN, and fails rather than overwrite an existing catalog document.

## Source and archive format

The configured source is `https://static.openfoodfacts.org/data/openfoodfacts-mongodbdump.gz`. A remote probe on October 19, 2026 observed a 16,092,745,487-byte gzip object with ETag `c6318173c404935929551c4a97997941-960` and Last-Modified `Mon, 19 Oct 2026 06:59:52 GMT`. After gzip decompression, its first four bytes are MongoDB's archive magic `0x8199e26d`; it is a MongoDB archive, not a plain BSON stream. The worker parses the archive prelude and namespace blocks, then streams only product BSON documents. It rejects invalid block lengths, missing terminators, truncated documents, and archives without a product namespace.

No source dump is downloaded by the developer workstation. The small validation endpoint and the production Cloud Run Job both fetch and process the source inside Google infrastructure. Images remain remote URLs.

MongoDB archive format reference: https://github.com/mongodb/mongo-tools/blob/master/common/archive/spec.md

Open Food Facts offers MongoDB, JSONL, CSV, and Parquet exports and states that its database is licensed under ODbL. InvenTraker stores per-record attribution, the original product URL, source identifier, source modification time, and license. ODbL attribution and share-alike obligations require product/legal review before publishing a combined database. References:

- https://blog.openfoodfacts.org/en/news/food-transparency-in-the-palm-of-your-hand-explore-the-largest-open-food-database-using-duckdb-%F0%9F%A6%86x%F0%9F%8D%8A
- https://support.openfoodfacts.org/help/en-gb/12-donnees-api/94-y-a-t-il-des-conditions-pour-utiliser-l-api
- https://opendatacommons.org/licenses/odbl/1-0/

## Normalization and validation

- Barcodes remain strings. Leading zeroes are retained in `sourceBarcode`.
- EAN-8, UPC-A, EAN-13, and GTIN-14 pass a GS1 check-digit calculation and normalize to a 14-digit GTIN for duplicate detection.
- Invalid or absent barcodes do not discard an otherwise valid product. The Open Food Facts `_id` remains the stable source identifier.
- Deterministic staging IDs are SHA-256 hashes of `openfoodfacts:{sourceId}`, making retries idempotent.
- Missing values stay absent. No product facts are inferred.
- Nutrient source keys are retained in `sourceNutrition`; normalized per-100 g/100 mL and per-serving values are stored separately with units in field names.
- US-market records receive priority in validation and promotion queues. Full mode can retain international products without changing the schema.
- Category and product-type tags reject identifiable nonfood, pet food, cosmetics, cleaning, restaurant, and hot-prepared products. Every rejected record receives a reason code.
- Ingredient, allergen, serving, package, country, market, image URL, timestamp, identifier, and source fields remain auditable.

## Migration plan

1. Deploy the three server-only collections and Firestore indexes. This is additive and has no effect on current records.
2. Deploy the importer and platform-admin endpoints.
3. Run the remote probe and a 25-product US validation. Review staging documents, rejects, run counters, BSON format evidence, field sizes, and index creation.
4. Review ODbL handling, projected volume, Firestore budget, and US-market acceptance rules.
5. Build the supplied container and deploy one Cloud Run Job task with a dedicated service account limited to the three import collections. Grant central-catalog writes only to the reviewed promotion service.
6. Run a capped US pilot (for example 10,000 accepted records), then measure actual documents per compressed GB, average Firestore document size, rejects, elapsed time, and write cost.
7. Obtain an explicit go-ahead before executing `--mode=full`. No full import is started by this implementation.

Rollback is collection-scoped: disable the job and delete only documents tied to the pilot `importRunId`. Existing `centralCatalog`, organization, and inventory records are untouched. Promoted records need a separately reviewed rollback because promotion is intentionally outside ingestion.

## Initial remote validation result

Run `off-2026-10-20T01-52-46-432Z-d3f15302` executed in the hosted backend against the source metadata recorded above. It scanned 38 product documents, staged 25 US-market products, skipped 13 non-US records, and recorded zero validation rejects. All staged records remained `pending_review`; the run created no `centralCatalog`, organization-product, or inventory documents. A three-record inspection confirmed string barcodes with leading zeroes, valid normalized GTIN-14 identifiers, US country tags, ODbL attribution, pending-review status, and retained nutrition objects. The remote probe and validation used a short-lived platform administrator identity that was removed after the requests completed.

## Capacity and cost estimate

Open Food Facts reported a compressed JSONL export around 11.1 GB in March 2026 and describes exports with millions of products. The exact MongoDB dump size is captured by each run instead of assumed. Plan for roughly 12–20 GB of inbound compressed transfer, 50–100 GB of decompressed stream volume, 4–6 million scanned records, and 8–30 GB of Firestore staging data plus indexes depending on US filtering and retained nutrition fields. The worker uses bounded memory and needs no dump-sized disk.

A single Cloud Run Job with 2 vCPU and 4 GiB RAM, a 24-hour task timeout, and one retry is the initial recommendation. Cloud Run supports task timeouts up to seven days and task retries. Firestore charges per document write and for document/index storage; at the published Iowa standard rate of $0.09 per 100,000 writes, one write per 1 million staged/rejected records is about $0.90 before storage, reads, retries, and run-progress writes. The pilot must replace these range estimates with measured values for this project and region.

- https://cloud.google.com/run/docs/create-jobs
- https://cloud.google.com/run/docs/jobs-retries
- https://cloud.google.com/firestore/pricing
- https://cloud.google.com/run/pricing

## Full import procedure (review before running)

```sh
gcloud builds submit --tag us-central1-docker.pkg.dev/inventracker-f1229/importers/open-food-facts:VERSION -f Dockerfile.open-food-facts .

gcloud run jobs deploy inventraker-open-food-facts \
  --image us-central1-docker.pkg.dev/inventracker-f1229/importers/open-food-facts:VERSION \
  --region us-central1 \
  --service-account open-food-facts-importer@inventracker-f1229.iam.gserviceaccount.com \
  --cpu 2 --memory 4Gi --task-timeout 24h --max-retries 1 \
  --args=--mode=full,--run-id=REVIEWED_RUN_ID

# Execute only after architecture, licensing, pilot metrics, and budget approval:
gcloud run jobs execute inventracker-open-food-facts --region us-central1 --wait
```

The job writes checkpoints every 1,000 scanned records. A retry is safe because staging IDs are deterministic and writes merge the same source product. Pass `--resume-after=N` from the last checkpoint to avoid restaging completed positions; because gzip is not seekable, the worker must stream and skip earlier BSON documents before resuming writes.

## Incremental synchronization

Schedule a weekly Cloud Run Job after the upstream export window. First compare ETag and Last-Modified with the last successful run; exit if unchanged. Run `--mode=incremental --modified-after=UNIX_SECONDS` using the maximum successful `sourceModifiedTimestamp`. Deterministic IDs update staging candidates without duplicates. Products whose upstream timestamp has not advanced are skipped. Deletions are not inferred from absence; record a separate tombstone review before any catalog removal. Periodically reconcile a small sample against the Open Food Facts API and monitor rejection rate, field drift, dump age, and record counts.

Promotion remains human-reviewed and additive. Imported updates to products already in `centralCatalog` should become change proposals rather than automatic overwrites.
