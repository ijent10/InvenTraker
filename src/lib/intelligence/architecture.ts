export const retailIntelligenceArchitecture = {
  name: "Retail/Product Intelligence Engine",
  purpose:
    "One backend intelligence API for Inventraker and SimpliPantri that understands products, inventory, waste, pricing, expiration, operations, and business signals.",
  architecture: [
    "Frontend apps",
    "Central API",
    "Intent classifier and privacy/domain filter",
    "Retrieval planner and internal tool orchestration",
    "Approved document retrieval",
    "Retail/Product Intelligence Engine",
    "OpenAI Responses API structured reasoning layer",
    "Strict JSON response validator",
    "Internal database and search indexes",
    "Approved external enrichment sources",
    "Pending suggestion and verified learning layer"
  ],
  databaseModels: [
    "user_phrase_mappings",
    "product_aliases",
    "rejected_aliases",
    "intent_patterns",
    "verified_corrections",
    "accepted_answers",
    "rejected_answers",
    "store_specific_terminology",
    "organization_specific_terminology",
    "product_fact_notes",
    "operational_notes",
    "ambiguous_phrase_history",
    "companyFiles",
    "fileCategories",
    "documentChunks",
    "documentAccessEvents",
    "product_enrichment_suggestions",
    "centralCatalog",
    "orgs/{orgId}/products",
    "orgs/{orgId}/inventory",
    "orgs/{orgId}/waste",
    "orgs/{orgId}/sales",
    "orgs/{orgId}/insights"
  ],
  apiRoutes: [
    {
      route: "POST /api/ai/ask",
      purpose: "Active assistant route with internal retrieval, tool orchestration, OpenAI structured reasoning, strict validation, and local fallback."
    },
    {
      route: "POST /api/intelligence/query",
      purpose: "Structured product, inventory, waste, pricing, expiration, and operations question answering."
    },
    {
      route: "GET|POST /api/intelligence/recommendations",
      purpose: "Business recommendations from inventory movement, waste, expiration, weather, holidays, and operational context."
    },
    {
      route: "POST /api/intelligence/enrich",
      purpose: "Create pending product metadata suggestions from approved external sources without overwriting product data."
    },
    {
      route: "POST /api/intelligence/verify",
      purpose: "Human-verified learning for accepted answers, rejected answers, phrase mappings, aliases, corrections, and intent patterns."
    },
    {
      route: "GET /api/intelligence/architecture",
      purpose: "Machine-readable contract and flow for integrating other apps."
    }
  ],
  retrievalFlow: [
    "Exact match",
    "Alias/synonym match",
    "Fuzzy search",
    "Semantic search",
    "Vector similarity search",
    "Barcode lookup",
    "Recipe/ingredient relationship lookup",
    "Approved internal document lookup",
    "Approved external source lookup only if internal data is insufficient"
  ],
  documentFlow: [
    "Upload file as draft",
    "Extract text, headings, page/section hints, tables, and metadata",
    "Chunk by section, page, heading, and semantic meaning",
    "Generate searchable embeddings",
    "Approve before authoritative assistant use",
    "Retrieve exact, heading, semantic, vector, recency, version, and status-filtered chunks",
    "Return clickable citations with section/page/source previews"
  ],
  learningFlow: [
    "Answer is generated with confidence, provenance, and sources",
    "User accepts or rejects/corrects the answer",
    "Verification route stores phrase mapping, alias, intent pattern, accepted/rejected answer, and correction records",
    "Future retrieval reads verified records before external enrichment"
  ],
  enrichmentFlow: [
    "Detect missing metadata",
    "Search approved external sources",
    "Create product_enrichment_suggestions",
    "Human approves or rejects",
    "Only approved suggestions can update product data"
  ],
  safety: [
    "Internal data is preferred",
    "External data is second",
    "Approved internal documents are preferred before external data",
    "Unsupported claims are avoided",
    "The model is not the source of truth",
    "Low-confidence answers include follow-up prompts",
    "External data is treated as enrichment only",
    "AI-generated changes require human approval",
    "Accepted and rejected answers are audited",
    "Personal identity and task-owner data is never exposed to the assistant",
    "Document text is treated as data and cannot override system, privacy, approval, or citation rules"
  ]
} as const
