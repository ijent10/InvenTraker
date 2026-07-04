export const assistantAllowedData = [
  "Central product catalog records",
  "Organization and store operational settings",
  "Store inventory, stock, waste, sales, vendor, and ordering data",
  "Approved imports and training resources",
  "Approved internal business documents such as policies, SOPs, guides, vendor sheets, recipes, safety sheets, and training documents",
  "Store resources such as displays, departments, categories, and product documents",
  "Approved public web sources used for verification"
]

export const assistantBlockedData = [
  "Names, emails, phone numbers, employee IDs, or account identifiers",
  "Restricted HR, payroll, discipline, scheduling, or employee medical records",
  "Authentication records, passwords, password reset state, or session data",
  "Who completed a task, who approved a change, or who submitted a response",
  "Employee permission records, job assignment history, or personal preferences",
  "Payment identifiers or private subscription billing details"
]

export const assistantPrivacyContract =
  "The assistant may use product, inventory, organization, store, import, training, approved internal document, store-resource, and approved web verification data. It must not receive or infer personal identifying information, authentication data, employee identifiers, task-owner history, restricted HR/payroll/discipline records, or private billing identifiers."

export function assistantPrivacyPayload() {
  return {
    contract: assistantPrivacyContract,
    allowedData: assistantAllowedData,
    blockedData: assistantBlockedData,
    enforcement:
      "Server-side assistant context builders must redact personal/user fields before model calls. Human-facing admin pages may show user records, but those records are not assistant context."
  }
}
