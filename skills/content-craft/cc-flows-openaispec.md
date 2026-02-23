---
name: 'cc-flows-openaispec'
description: 'Documents the openaiSpecJson data flow for Product Guide prompt injection. Use when debugging missing product data in guides, investigating why a product has no spec, tracing spec generation, or understanding how openaiSpecJson reaches the prompt.'
---

# OpenAI Spec Flow

## Why This Exists

Product Guides inject `openaiSpecJson` into prompts for context-aware content generation. When guides show missing product data, trace this flow to find where the spec is null or malformed.

## Three Operations

| Operation | Endpoint | Purpose |
|-----------|----------|---------|
| **Spec Only** | `POST /gmc/products/{id}/generate-spec` | Generate spec + store in DB (no Sanity) |
| **Enrich Spec** | `POST /items/{id}/enrich-spec` | LLM enrichment of existing spec |
| **Full Publish** | `POST /gmc/products/{id}/publish` | Full sync to Sanity CMS |

The OpenAI icon triggers **spec-only** generation. Enrichment is a **separate operation** that can be triggered independently.

## Standardized Flow (All Products)

```
1. GENERATE: Create openai_spec_json
      ↓
2. STORE: Save to PostgreSQL (product_feed_items.openai_spec_json)
      ↓
3. PUBLISH: Read from DB → Send to Sanity (product.openaiSpecJson) [optional]
```

| Product Type | Generation | DB Storage | Sanity Field |
|--------------|------------|------------|--------------|
| **GMC** | `GMCToSanityPublisher.generate_spec_only()` | `product_feed_items.openai_spec_json` | `openaiSpecJson` |
| **URL** | During crawl/classification | `product_feed_items.openai_spec_json` | `openaiSpecJson` |

## Flow: GMC Products (Spec Only)

Used by OpenAI icon click and Spec Viewer regenerate button:

```
User clicks OpenAI icon or Regenerate
  └─► POST /api/v1/product-feed/gmc/products/{id}/generate-spec
        └─► GMCToSanityPublisher.generate_spec_only()
              └─► Fetch GMC product from Google API
              └─► _classify_product() → LLM classification
              └─► _build_openai_spec_json() → build spec
              └─► _get_or_create_product_feed_item() → store in PostgreSQL
              └─► Return { success, openai_spec_json }
```

## Flow: GMC Products (Full Publish)

Used for syncing to Sanity CMS:

```
POST /api/v1/product-feed/gmc/products/{id}/publish
  └─► Worker queue → GMCToSanityPublisher.publish_product()
        └─► _build_openai_spec_json() → openai_spec
        └─► _get_or_create_product_feed_item() → store in PostgreSQL
        └─► sanity_doc["openaiSpecJson"] = pfi.openai_spec_json → publish to Sanity
```

## Flow: URL Products

```
URL Crawl → Classification → product_feed_items.openai_spec_json
  └─► worker._handle_product_sanity_sync()
        └─► sanity_doc["openaiSpecJson"] = product.openai_spec_json → publish to Sanity
```

## Flow: LLM Enrichment (Standalone)

Enrichment is a **separate operation** that enhances existing specs with additional OpenAI Commerce Feed fields. It can be triggered independently after spec generation.

```
POST /api/v1/product-feed/items/{pfi_id}/enrich-spec
  └─► OpenAISpecEnrichmentService.enrich_product_feed_item()
        └─► Fetch ProductFeedItem with existing openai_spec_json
        └─► Fetch product specification from Content table (if exists)
        └─► Execute prompt via PromptService (audit logged)
        └─► Parse LLM response as JSON
        └─► Merge: auto-mapped values preserved, enriched fills gaps
        └─► Update ProductFeedItem.openai_spec_json
        └─► Return enriched spec
```

**Key characteristics:**
- Uses Claude Haiku 4-5 for fast, cost-effective enrichment
- Never fabricates data - only populates fields with evidence
- Preserves all existing auto-mapped values
- Records in prompt history with label "OpenAI Spec Enrichment"
- Injects product specifications from brochures/PDFs if available
- Works for both URL products and GMC products

## Frontend: OpenAI Spec Viewer

Route: `/product-feed/openai-spec/[productId]?type=gmc`

| Feature | Behavior |
|---------|----------|
| **View Spec** | Fetches product from API, displays `openai_spec_json` |
| **Enrich Spec** | Smart button that chains operations based on current state |
| **Icon Color** | Green = has spec in DB, Grey = no spec |

**"Enrich Spec" Button Flow:**
1. If NO `openai_spec_json` exists:
   - Calls `/generate-spec` (classification + auto-mapping)
   - Then calls `/enrich-spec` (LLM enhancement)
2. If `openai_spec_json` EXISTS:
   - Skips classification
   - Only calls `/enrich-spec` (LLM enhancement)

Key files:
- `apps/web/src/app/product-feed/openai-spec/[productId]/page.tsx`
- `apps/web/src/components/product-feed/OpenAISpecIcon.tsx`

## Retrieval for Product Guides

```
product_spec_fetcher.fetch_product_openai_spec()
  1. Check ProductFeedItem by sanity_document_id
  2. Check ProductFeedItem by id
  3. Fallback: fetch from Sanity (sanity_doc.get('openaiSpecJson'))
```

## API Endpoints

### Generate Spec Only (GMC)
```bash
curl -X POST "http://localhost:8000/api/v1/product-feed/gmc/products/{product_id}/generate-spec" \
  -H "X-Workspace-ID: {workspace_id}" \
  -H "Cookie: {auth_cookies}"
```

Response:
```json
{
  "success": true,
  "product_id": "online:en:AU:SKU123",
  "openai_spec_json": { ... }
}
```

### Get Product (includes spec from DB)
```bash
curl "http://localhost:8000/api/v1/product-feed/gmc/products/{product_id}" \
  -H "X-Workspace-ID: {workspace_id}"
```

### Enrich Spec (LLM Enhancement)
```bash
curl -X POST "http://localhost:8000/api/v1/product-feed/items/{pfi_uuid}/enrich-spec" \
  -H "X-Workspace-ID: {workspace_id}" \
  -H "Cookie: {auth_cookies}"
```

Response:
```json
{
  "success": true,
  "product_feed_item_id": "uuid-here",
  "openai_spec_json": { ... enriched spec with additional fields ... }
}
```

## Debugging Commands

### Check PostgreSQL (primary source)
```bash
source /home/developer/norg/content-craft/db/.env && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "SELECT id, title, source_type, gmc_product_id, openai_spec_json IS NOT NULL as has_spec FROM product_feed_items WHERE sanity_document_id = 'product-UUID-HERE'"
```

### Check by GMC Product ID
```bash
source /home/developer/norg/content-craft/db/.env && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "SELECT id, title, openai_spec_json IS NOT NULL as has_spec, updated_at FROM product_feed_items WHERE gmc_product_id = 'online:en:AU:SKU123'"
```

### Check Sanity (published data)
```bash
curl -s -G "https://t4gkqyvw.api.sanity.io/v2025-02-19/data/query/development" \
  --data-urlencode 'query=*[_type == "product" && _id == "product-UUID-HERE"][0]{_id, title, sourceType, openaiSpecJson}' \
  -H "Authorization: Bearer $SANITY_AUTH_TOKEN" | jq .
```

### Backfill missing specs (all products)
```
POST /api/v1/product-feed/products/backfill-openai-spec
Header: X-Workspace-ID: {workspace_id}
```

## Log Trace Keywords

- `[GMC_PFI]` — GMC product to ProductFeedItem flow
- `[OPENAI_SPEC_FLOW]` — Single product fetch tracing
- `[OPENAI_SPEC_ENRICHMENT]` — LLM enrichment operations
- `[PRODUCT_SPEC]` — Shared fetcher utility
- `gmc_product_generate_spec_` — Spec-only endpoint logs
- `openai_spec_enrich_` — Enrichment endpoint logs
- `unified_backfill_` — Unified backfill operations

## Key Files

| File | Purpose |
|------|---------|
| `services/gmc/sanity_publisher.py` | `generate_spec_only()` and `publish_product()` |
| `services/openai_spec_enrichment_service.py` | LLM enrichment service (standalone) |
| `services/crawler/worker.py` | URL: sync to Sanity with openaiSpecJson |
| `models/product_feed_item.py` | ProductFeedItem model (source_type: url, json, csv, gmc) |
| `utils/product_spec_fetcher.py` | Shared fetcher for product guides |
| `utils/prompt_history_helpers.py` | Slug-to-label mapping for prompt history |
| `api/v1/endpoints/product_feed.py` | Generate-spec, enrich-spec, backfill endpoints |
| `schemas/product_feed.py` | Response schemas for spec operations |

## Spec Structure

```json
{
  "title": "Product Name",
  "description": "Full description",
  "price": "12.50 AUD",
  "currency": "AUD",
  "availability": "in_stock",
  "image_url": "https://...",
  "brand": "Brand",
  "category": "Category > Subcategory",
  "gtin": "...",
  "url": "https://..."
}
```
