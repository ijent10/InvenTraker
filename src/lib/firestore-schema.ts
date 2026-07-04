export const DEFAULT_ORG_ID = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID || "demo-org"

export const firestoreCollections = {
  platformAdmins: "platformAdmins",
  platformLegal: "platformLegal",
  platformFeatureRequests: "platformFeatureRequests",
  platformFaqs: "platformFaqs",
  platformSubscriptions: "platformSubscriptions",
  platformProductApprovals: "platformProductApprovals",
  centralCatalog: "centralCatalog",
  assistantProductMemory: "assistantProductMemory",
  users: "users",
  orgs: "orgs",
  members: "members",
  preferences: "preferences",
  stores: "stores",
  storeProductDetails: "productDetails",
  storeVendorProducts: "vendorProducts",
  locations: "locations",
  departments: "departments",
  categories: "categories",
  displays: "displays",
  companyFiles: "companyFiles",
  fileCategories: "fileCategories",
  documentChunks: "documentChunks",
  documentAccessEvents: "documentAccessEvents",
  products: "products",
  inventory: "inventory",
  vendors: "vendors",
  orders: "orders",
  healthChecks: "healthChecks",
  healthCheckDrafts: "healthCheckDrafts",
  healthCheckResponses: "healthCheckResponses",
  history: "history",
  shiftNotes: "shiftNotes",
  notifications: "notifications",
  waste: "waste",
  restocks: "restocks",
  receiving: "receiving",
  portions: "portions",
  sales: "sales",
  insights: "insights",
  dashboardWidgets: "dashboardWidgets",
  themes: "themes",
  settings: "settings",
  formSaves: "formSaves",
  aiProductKnowledge: "aiProductKnowledge",
  aiLearningRuns: "aiLearningRuns",
  aiSources: "aiSources",
  aiPendingAutofills: "aiPendingAutofills",
  userPhraseMappings: "user_phrase_mappings",
  productAliases: "product_aliases",
  rejectedAliases: "rejected_aliases",
  intentPatterns: "intent_patterns",
  verifiedCorrections: "verified_corrections",
  acceptedAnswers: "accepted_answers",
  rejectedAnswers: "rejected_answers",
  storeSpecificTerminology: "store_specific_terminology",
  organizationSpecificTerminology: "organization_specific_terminology",
  productFactNotes: "product_fact_notes",
  operationalNotes: "operational_notes",
  ambiguousPhraseHistory: "ambiguous_phrase_history",
  productEnrichmentSuggestions: "product_enrichment_suggestions"
} as const

export type FirestoreCollectionKey = keyof typeof firestoreCollections

export function orgCollectionPath(orgId: string, collection: FirestoreCollectionKey) {
  return `${firestoreCollections.orgs}/${orgId}/${firestoreCollections[collection]}`
}

export function centralCatalogPath() {
  return firestoreCollections.centralCatalog
}

export function storeCollectionPath(orgId: string, storeId: string, collection: "storeProductDetails" | "storeVendorProducts") {
  return `${firestoreCollections.orgs}/${orgId}/${firestoreCollections.stores}/${storeId}/${firestoreCollections[collection]}`
}

export function userPreferencesPath(userId: string) {
  return `${firestoreCollections.users}/${userId}/${firestoreCollections.preferences}/workspace`
}

export const appDataModel = [
  ["Platform admins", "platformAdmins/{uid}", "Global InvenTracker administrators who can manage legal, organizations, subscriptions, and support operations."],
  ["Platform legal", "platformLegal/{documentId}", "Terms, privacy policy, public FAQ text, and publication state."],
  ["Platform feature requests", "platformFeatureRequests/{requestId}", "Incoming feature requests, status, priority, votes, and release notes."],
  ["Platform subscriptions", "platformSubscriptions/{subscriptionId}", "Plan, seat, billing status, renewal, and support metadata for each organization."],
  [
    "Platform product approvals",
    "platformProductApprovals/{requestId}",
    "Organization-submitted products that need platform administrator approval before they can enter the central catalog or organization catalog."
  ],
  [
    "Central catalog",
    "centralCatalog/{centralProductId}",
    "Global product identity for every scanned product across organizations: name, SKU/barcode, nutrition, average price, average expiration, average case quantity, images, and verified source metadata."
  ],
  [
    "Assistant product memory",
    "assistantProductMemory/{memoryId}",
    "Private server-only assistant notes for source-backed product facts, cached lookups, confidence, and evidence. Client Firestore rules deny direct access."
  ],
  ["Organization", "orgs/{orgId}", "Company identity, defaults, permission policies, and business settings."],
  ["Members", "orgs/{orgId}/members/{uid}", "Employee profile, role, store scope, department scope, and permissions."],
  ["User preferences", "users/{uid}/preferences/workspace", "Personal theme, saved themes, dashboard layout, density, and device-independent preferences."],
  ["Stores", "orgs/{orgId}/stores/{storeId}", "Store identity, display areas, local settings, and store-specific permissions."],
  [
    "Store product details",
    "orgs/{orgId}/stores/{storeId}/productDetails/{storeProductId}",
    "Store-local product details that reference organization products: vendor, local price, expiration behavior, case quantity, location, and store notes."
  ],
  [
    "Store vendor products",
    "orgs/{orgId}/stores/{storeId}/vendorProducts/{vendorProductId}",
    "Vendor-specific store records that reference organization products and hold lead time, price, pack size, ordering notes, and replacement rules."
  ],
  ["Departments", "orgs/{orgId}/departments/{departmentId}", "Department names, category groups, default permissions, and operating labels."],
  ["Categories", "orgs/{orgId}/categories/{categoryId}", "Department-owned product categories such as wine styles, bakery groups, or produce families."],
  ["Displays", "orgs/{orgId}/displays/{displayId}", "Store-managed display locations, capacities, schedules, and product assignments."],
  [
    "Company files",
    "orgs/{orgId}/companyFiles/{documentId}",
    "Approved and draft business documents, policies, SOPs, vendor sheets, recipes, guides, reports, visibility scopes, file links, approval status, and parsing state."
  ],
  [
    "File categories",
    "orgs/{orgId}/fileCategories/{categoryId}",
    "Nested file manager categories that can contain files or additional categories."
  ],
  [
    "Document chunks",
    "orgs/{orgId}/documentChunks/{chunkId}",
    "Searchable document sections with page/heading metadata, table data, embeddings, and citation text for approved document intelligence."
  ],
  [
    "Document access events",
    "orgs/{orgId}/documentAccessEvents/{eventId}",
    "Non-personal aggregate file access events used for recents, most-opened sorting, and observability."
  ],
  [
    "Organization products",
    "orgs/{orgId}/products/{productId}",
    "Organization-approved product references to centralCatalog with org categories, notes, expiration defaults, and operating overrides. New products created by an organization are held in platformProductApprovals until a platform admin approves them."
  ],
  [
    "Inventory",
    "orgs/{orgId}/inventory/{itemId}",
    "Store-scoped stock and operating details that reference organization products only: front/back quantities, vendor, price, expiration, case quantity, locations, pars, and archive state."
  ],
  ["Vendors", "orgs/{orgId}/vendors/{vendorId}", "Vendor contacts, lead times, minimums, order settings, and catalogs."],
  ["Orders", "orgs/{orgId}/orders/{orderId}", "Drafts, submitted orders, line items, approvals, and export settings."],
  ["Health checks", "orgs/{orgId}/healthChecks/{checkId}", "Reusable templates, schedule, assignment, and permissions."],
  ["Health drafts", "orgs/{orgId}/healthCheckDrafts/{draftId}", "Draft templates with answer types, required fields, and publication status."],
  ["Health responses", "orgs/{orgId}/healthCheckResponses/{responseId}", "Completed responses with user, employee id, store, date, time, and answers."],
  ["History", "orgs/{orgId}/history/{recordId}", "Spot checks, restocks, waste, receive, portion, and order activity streams."],
  ["Shift notes", "orgs/{orgId}/shiftNotes/{noteId}", "Editable personal, department, people, and organization notes shared according to visibility settings."],
  ["Notifications", "orgs/{orgId}/notifications/{notificationId}", "Per-workspace notifications, unread state, destinations, and timestamps."],
  ["Waste", "orgs/{orgId}/waste/{wasteId}", "Waste events, product links, reasons, quantities, users, and store scope."],
  ["Restocks", "orgs/{orgId}/restocks/{restockId}", "Restock scans, front/back changes, calculated pulls, and completion users."],
  ["Receiving", "orgs/{orgId}/receiving/{receivingId}", "Receiving sessions, product quantities, vendor references, and batch data."],
  ["Portions", "orgs/{orgId}/portions/{portionId}", "Prep or portion actions that affect stock and history."],
  ["Sales", "orgs/{orgId}/sales/{saleId}", "Sales/imported movement records for insight and ordering calculations."],
  ["Insights", "orgs/{orgId}/insights/{insightId}", "Computed signals and future AI-generated summary records."],
  ["Dashboard widgets", "orgs/{orgId}/dashboardWidgets/{widgetId}", "Organization-level widget definitions users can add to their personal dashboard."],
  ["Themes", "orgs/{orgId}/themes/{themeId}", "Organization-approved theme presets and brand defaults."],
  ["Settings", "orgs/{orgId}/settings/{settingId}", "Organization and store-level defaults that should survive every device session."],
  ["Form saves", "orgs/{orgId}/formSaves/{formSaveId}", "Latest saved snapshots from admin, settings, and builder forms that do not yet have a specialized collection."],
  ["AI knowledge", "orgs/{orgId}/aiProductKnowledge/{recordId}", "Verified product facts, sources, nutrition evidence, and model context."],
  ["AI learning runs", "orgs/{orgId}/aiLearningRuns/{runId}", "Audit trail for product learning, source refreshes, and assistant updates."],
  ["AI sources", "orgs/{orgId}/aiSources/{sourceId}", "Approved external or supplier sources available to assistant workflows."],
  ["Pending autofill", "orgs/{orgId}/aiPendingAutofills/{batchId}", "AI-proposed nutrition/images/product fields awaiting human approval."],
  [
    "User phrase mappings",
    "orgs/{orgId}/user_phrase_mappings/{mappingId}",
    "Human-verified phrases and vague wording mapped to resolved products or meanings."
  ],
  ["Product aliases", "orgs/{orgId}/product_aliases/{aliasId}", "Verified alternate names, synonyms, supplier names, and natural phrases for products."],
  ["Rejected aliases", "orgs/{orgId}/rejected_aliases/{aliasId}", "Rejected alias candidates that should reduce future mistaken matches."],
  ["Intent patterns", "orgs/{orgId}/intent_patterns/{patternId}", "Verified wording patterns for product lookup, ordering, enrichment, and operational recommendations."],
  ["Verified corrections", "orgs/{orgId}/verified_corrections/{correctionId}", "Human-corrected answers and resolved meanings for audit and future retrieval."],
  ["Accepted answers", "orgs/{orgId}/accepted_answers/{answerId}", "Accepted intelligence answers with query, answer, source, confidence, and verification metadata."],
  ["Rejected answers", "orgs/{orgId}/rejected_answers/{answerId}", "Rejected intelligence answers with correction notes and audit context."],
  ["Store terminology", "orgs/{orgId}/store_specific_terminology/{termId}", "Store-specific terms, display names, local labels, and approved meanings."],
  ["Organization terminology", "orgs/{orgId}/organization_specific_terminology/{termId}", "Organization-wide product, department, and workflow language."],
  ["Product fact notes", "orgs/{orgId}/product_fact_notes/{noteId}", "Approved source-backed product facts and supersession history."],
  ["Operational notes", "orgs/{orgId}/operational_notes/{noteId}", "Approved non-personal operating observations the assistant may use for recommendations."],
  ["Ambiguous phrase history", "orgs/{orgId}/ambiguous_phrase_history/{phraseId}", "Unresolved or ambiguous phrasing that should prompt clarification until reviewed."],
  [
    "Product enrichment suggestions",
    "orgs/{orgId}/product_enrichment_suggestions/{suggestionId}",
    "AI-proposed product metadata updates from approved external sources. Suggestions stay pending until approved or rejected."
  ]
] as const
