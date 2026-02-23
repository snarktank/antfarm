# Sanity Tree & Reference Structure

## Overview

Content-Craft uses Sanity CMS with a hierarchical structure for organizing content. This document describes the reference relationships and tree structure.

## Document Types

### Core Hierarchy

```
directoryBusiness (Workspace/Brand)
    └── directoryCategory (e.g., Articles, Product Guides, Programs)
            └── directorySubcategory (e.g., General, Meal Guides, Fitness & High Protein)
                    └── article (content items)
```

### Document Type: `directoryBusiness`
- Represents a workspace/brand (e.g., Be Fit Food, Selleys)
- Top-level container for all content
- Referenced by categories via `parent` field

### Document Type: `directoryCategory`
- Examples: Articles, Pages, Product Guides, Product Information, Programs
- **Key Fields:**
  - `parent._ref` → points to `directoryBusiness` ID
  - `slug.current` → URL-friendly identifier
  - `title` → Display name
  - `displayOrder` → Sorting order
  - `isActive` → Visibility flag

### Document Type: `directorySubcategory`
- Examples: General, Meal Guides, Fitness & High Protein
- **Two Schema Variants Found:**

  **Old Schema (UUID IDs):**
  ```json
  {
    "_id": "directorySubcategory-UUID-HERE",
    "parentCategory": { "_ref": "directoryCategory-..." },  // CAN BE NULL!
    "title": "Subcategory Name",
    "slug": { "current": "slug-here" }
  }
  ```

  **New Schema (Prefixed IDs like `befit-*`):**
  ```json
  {
    "_id": "directorySubcategory-befit-meal-guides",
    "category": { "_ref": "directoryCategory-..." },  // Uses "category" not "parentCategory"
    "name": "Meal Guides",  // Uses "name" not "title"
    "slug": { "current": "meal-guides" }
  }
  ```

### Document Type: `article`
- The actual content items (guides, pages, etc.)
- **Key Fields:**
  - `workspace_id` → String UUID (not a Sanity reference!)
  - `parentSubcategory._ref` → Points to subcategory
  - `parentCategory` → May exist for direct category reference
  - `category` / `subcategory` → Legacy fields (string values, not references)
  - `title`, `content`, `slug`, `publishedAt`

## Reference Patterns

### Content → Subcategory
```json
{
  "_type": "article",
  "parentSubcategory": {
    "_ref": "directorySubcategory-XXX",
    "_type": "reference"
  }
}
```

### Subcategory → Category
**Old Schema:**
```json
{
  "_type": "directorySubcategory",
  "parentCategory": { "_ref": "directoryCategory-XXX" }
}
```

**New Schema:**
```json
{
  "_type": "directorySubcategory",
  "category": { "_ref": "directoryCategory-XXX" }
}
```

### Category → Business
```json
{
  "_type": "directoryCategory",
  "parent": { "_ref": "directoryBusiness-XXX" }
}
```

## Common Issues

### Orphaned Subcategories
- Subcategories with `parentCategory: null` are orphaned
- Content referencing these appears in the wrong place in the tree
- **Solution:** Update subcategory's `parentCategory`/`category` field OR migrate content to valid subcategories

### Duplicate Subcategories
- Same slug can exist multiple times (e.g., `meal-guides` appears twice)
- One with proper parent reference, one orphaned
- **Solution:** Migrate content from orphaned to valid subcategory, then delete orphan

### Schema Mismatch
- Old subcategories use `parentCategory` + `title`
- New subcategories use `category` + `name`
- API/backend must handle both patterns

## Key Workspace IDs

| Workspace | workspace_id (String) |
|-----------|----------------------|
| Be Fit Food | `1ea3b7f0-f04c-464c-8bf5-aecfc92c7ce9` |

## Be Fit Food Expected Structure

```
📁 Be Fit Food (directoryBusiness-c5db83e6-969f-4e0a-b3e4-4bb353e84d08)
├── 📁 Articles (directoryCategory-7c5ed049-a993-4cec-af8e-a257c125b389)
│   └── General (2 items)
├── 📁 Pages (directoryCategory-304c8556-d233-47ab-a366-a9c35e0175ff)
│   └── Homepage (1 item)
├── 📁 Product Guides (directoryCategory-88e3b33f-0072-4764-b5a9-6fd40ab8bfbf)
│   └── Meal Guides (470 items)
├── 📁 Product Information (directoryCategory-b767322d-c865-4210-8bbb-d1ca8ab84247)
│   ├── Food & Beverage Pairing Guides (1)
│   ├── Dietary & Nutritional Guides (2)
│   ├── Competitor Analysis (1)
│   ├── Delivery (4)
│   ├── Ordering (2)
│   ├── Fresh Meals (1)
│   ├── À La Carte (2)
│   ├── Meal Planning (11)
│   ├── Customer Segments (2)
│   ├── Weight Loss (10)
│   ├── Nutrition (10)
│   ├── Pricing (2)
│   └── Food Programs (5)
└── 📁 Programs (directoryCategory-ae4b135b-0cd1-418a-9267-e841c26b1beb)
    ├── Fitness & High Protein (3)
    ├── Weight Management (1)
    └── Lifestyle (2)

Total: 5 Categories, 19 Subcategories, 532 Content Items
```

## Useful GROQ Queries

### Find Orphaned Subcategories
```groq
*[_type == "directorySubcategory" && parentCategory == null && category == null]{
  _id, title, "slug": slug.current
}
```

### Find Content Referencing Specific Subcategory
```groq
*[references("directorySubcategory-XXX")]{_id, _type, title}
```

### Get Category with All Subcategories
```groq
*[_id == "directoryCategory-XXX"][0]{
  _id, title,
  "subcategories": *[_type == "directorySubcategory" &&
    (parentCategory._ref == ^._id || category._ref == ^._id)]{
    _id, title, "slug": slug.current
  }
}
```

### Find All Content for a Workspace
```groq
*[_type == "article" && workspace_id == "WORKSPACE-UUID"]{
  _id, title,
  "subcatRef": parentSubcategory._ref,
  "subcatTitle": parentSubcategory->title
}
```

## API Endpoints

- `/api/v1/directory/published-content/tree` - Returns tree structure for UI
- Query parameter: `parent_id` for lazy loading children

## Sanity Mutation Examples

### Update Subcategory Parent
```json
{
  "mutations": [
    {
      "patch": {
        "id": "directorySubcategory-XXX",
        "set": {
          "parentCategory": {
            "_type": "reference",
            "_ref": "directoryCategory-YYY"
          }
        }
      }
    }
  ]
}
```

### Delete Orphaned Document
```json
{
  "mutations": [
    {"delete": {"id": "directorySubcategory-XXX"}}
  ]
}
```

### Unset Field from Content
```json
{
  "mutations": [
    {
      "patch": {
        "id": "article-XXX",
        "unset": ["parentSubcategory"]
      }
    }
  ]
}
```

## Cross-Reference with Postgres

Content in Sanity should match Postgres `content` table:
- **Postgres column:** `sanity_document_id` (not `sanity_doc_id`)
- Content not in Postgres is orphaned and can be deleted from Sanity
- Use `content.workspace_id` to filter by workspace

### Postgres Query Example
```sql
SELECT id, sanity_document_id, title
FROM content
WHERE sanity_document_id = 'article-XXX';
```

## Key Category IDs (Be Fit Food)

| Category | Sanity ID |
|----------|-----------|
| Articles | `directoryCategory-7c5ed049-a993-4cec-af8e-a257c125b389` |
| Pages | `directoryCategory-304c8556-d233-47ab-a366-a9c35e0175ff` |
| Product Guides | `directoryCategory-88e3b33f-0072-4764-b5a9-6fd40ab8bfbf` |
| Product Information | `directoryCategory-b767322d-c865-4210-8bbb-d1ca8ab84247` |
| Programs | `directoryCategory-ae4b135b-0cd1-418a-9267-e841c26b1beb` |
| Business (parent) | `directoryBusiness-c5db83e6-969f-4e0a-b3e4-4bb353e84d08` |

## Cleanup Workflow

1. **Identify orphaned subcategories** - Query for null parent references
2. **Check content references** - Find what content uses orphaned subcategories
3. **Cross-reference Postgres** - Verify content exists in database
4. **Migrate or delete content** - Update valid content, delete orphaned
5. **Delete orphaned subcategories** - Remove after content is migrated
6. **Delete orphaned categories** - Remove categories with no valid subcategories
7. **Clean R2 storage** - Delete corresponding files from R2 bucket

## Cleanup History

### 2026-02-04: Be Fit Food Orphan Cleanup

**Problem:** UI showed "Article" category with "Food & Beverages" subcategory. This was caused by:
- Orphaned `article` category (duplicate of `articles`)
- 4 orphaned subcategories with null `parentCategory`
- 7 orphaned articles referencing these subcategories

**Deleted:**
- 7 orphaned articles (not in Postgres):
  - hearty winter meals - 001
  - Busy Professionals Meal Program Landing Page
  - Ultimate Guide: High Protein Meals
  - Healthy Meal Delivery for Every Goal
  - Fitness-Friendly Meals Category Page
  - High Protein Meal Collection Landing Page
  - Senior-Friendly Nutrition Hub

- 4 orphaned subcategories:
  - `directorySubcategory-59b10c3b-f907-4d73-8dcc-1c1ea895395e` (Food & Beverages)
  - `directorySubcategory-dbac05a5-508a-48ef-b667-5521c816be2c` (Fitness & High Protein)
  - `directorySubcategory-f4b446f9-b9fc-4f51-9770-97e7f533646d` (Lifestyle)
  - `directorySubcategory-05b27451-252b-4c4b-a98d-4ee94bd87fae` (Weight Management)

- 1 orphaned category:
  - `directoryCategory-67363c83-4eb3-4245-a3af-940738f2b8ec` (Article - singular)

**Note:** Valid subcategories with same names exist as `directorySubcategory-befit-*` IDs under Programs category.
