import { httpsCallable } from "firebase/functions"
import { functions } from "@/lib/firebase/client"
import type {
  ListMyOrganizationsRequest,
  ListMyOrganizationsResponse,
  EnsurePlatformPreferenceProfileRequest,
  EnsurePlatformPreferenceProfileResponse,
  PdfToHowtoDraftRequest,
  PdfToHowtoDraftResponse,
  GenerateOrderSuggestionsRequest,
  GenerateOrderSuggestionsResponse,
  ComputeFinancialHealthRequest,
  ComputeFinancialHealthResponse,
  AdminSafeEditRequest,
  AdminSafeEditResponse,
  AdminListOrganizationsRequest,
  AdminListOrganizationsResponse,
  AdminOrganizationDetailRequest,
  AdminOrganizationDetailResponse,
  AdminStoreDetailRequest,
  AdminStoreDetailResponse,
  AdminAuditLogsRequest,
  AdminAuditLogsResponse,
  ClaimOrganizationByCompanyCodeRequest,
  ClaimOrganizationByCompanyCodeResponse,
  ListPublicStripePlansRequest,
  ListPublicStripePlansResponse
} from "@inventracker/shared"

export async function listMyOrganizations(
  input: ListMyOrganizationsRequest = {}
): Promise<ListMyOrganizationsResponse | null> {
  if (!functions) return null
  const callable = httpsCallable<ListMyOrganizationsRequest, ListMyOrganizationsResponse>(
    functions,
    "listMyOrganizations"
  )
  const result = await callable(input)
  return result.data
}

export async function ensureProfile(input: EnsurePlatformPreferenceProfileRequest): Promise<EnsurePlatformPreferenceProfileResponse | null> {
  if (!functions) return null
  const callable = httpsCallable<EnsurePlatformPreferenceProfileRequest, EnsurePlatformPreferenceProfileResponse>(
    functions,
    "ensurePlatformPreferenceProfile"
  )
  const result = await callable(input)
  return result.data
}

export async function parsePdfToHowto(input: PdfToHowtoDraftRequest): Promise<PdfToHowtoDraftResponse | null> {
  if (!functions) return null
  const callable = httpsCallable<PdfToHowtoDraftRequest, PdfToHowtoDraftResponse>(functions, "pdfToHowtoDraft")
  const result = await callable(input)
  return result.data
}

export async function generateSuggestions(input: GenerateOrderSuggestionsRequest): Promise<GenerateOrderSuggestionsResponse | null> {
  if (!functions) return null
  const callable = httpsCallable<GenerateOrderSuggestionsRequest, GenerateOrderSuggestionsResponse>(functions, "generateOrderSuggestions")
  const result = await callable(input)
  return result.data
}

export async function computeFinancialHealth(input: ComputeFinancialHealthRequest): Promise<ComputeFinancialHealthResponse | null> {
  if (!functions) return null
  const callable = httpsCallable<ComputeFinancialHealthRequest, ComputeFinancialHealthResponse>(functions, "computeFinancialHealth")
  const result = await callable(input)
  return result.data
}

export async function adminSafeEdit(input: AdminSafeEditRequest): Promise<AdminSafeEditResponse | null> {
  if (!functions) return null
  const callable = httpsCallable<AdminSafeEditRequest, AdminSafeEditResponse>(functions, "adminSafeEdit")
  const result = await callable(input)
  return result.data
}

export async function adminListOrganizations(input: AdminListOrganizationsRequest): Promise<AdminListOrganizationsResponse | null> {
  if (!functions) return null
  const callable = httpsCallable<AdminListOrganizationsRequest, AdminListOrganizationsResponse>(
    functions,
    "adminListOrganizations"
  )
  const result = await callable(input)
  return result.data
}

export async function adminGetOrganizationDetail(
  input: AdminOrganizationDetailRequest
): Promise<AdminOrganizationDetailResponse | null> {
  if (!functions) return null
  const callable = httpsCallable<AdminOrganizationDetailRequest, AdminOrganizationDetailResponse>(
    functions,
    "adminGetOrganizationDetail"
  )
  const result = await callable(input)
  return result.data
}

export async function adminGetStoreDetail(input: AdminStoreDetailRequest): Promise<AdminStoreDetailResponse | null> {
  if (!functions) return null
  const callable = httpsCallable<AdminStoreDetailRequest, AdminStoreDetailResponse>(functions, "adminGetStoreDetail")
  const result = await callable(input)
  return result.data
}

export async function adminListAuditLogs(input: AdminAuditLogsRequest): Promise<AdminAuditLogsResponse | null> {
  if (!functions) return null
  const callable = httpsCallable<AdminAuditLogsRequest, AdminAuditLogsResponse>(functions, "adminListAuditLogs")
  const result = await callable(input)
  return result.data
}

export async function claimOrganizationByCompanyCode(
  input: ClaimOrganizationByCompanyCodeRequest
): Promise<ClaimOrganizationByCompanyCodeResponse | null> {
  if (!functions) return null
  const callable = httpsCallable<
    ClaimOrganizationByCompanyCodeRequest,
    ClaimOrganizationByCompanyCodeResponse
  >(functions, "claimOrganizationByCompanyCode")
  const result = await callable(input)
  return result.data
}

export type SendOrgNotificationRequest = {
  orgId: string
  storeId?: string
  name: string
  content: string
  attachmentAssetId?: string
  attachmentName?: string
  attachmentUrl?: string
  attachmentContentType?: string
  attachmentSizeBytes?: number
  roleTargets: string[]
  dispatchMode: "immediate" | "scheduled"
  scheduledFor?: Date | string
  senderName?: string
  senderEmployeeId?: string
}

export async function sendOrgNotification(input: SendOrgNotificationRequest): Promise<{ ok: boolean; id: string } | null> {
  if (!functions) return null
  const callable = httpsCallable<SendOrgNotificationRequest, { ok: boolean; id: string }>(
    functions,
    "sendOrgNotification"
  )
  const result = await callable(input)
  return result.data
}

export async function removeOrgNotificationByCallable(input: {
  orgId: string
  notificationId: string
}): Promise<{ ok: boolean } | null> {
  if (!functions) return null
  const callable = httpsCallable<{ orgId: string; notificationId: string }, { ok: boolean }>(
    functions,
    "removeOrgNotification"
  )
  const result = await callable(input)
  return result.data
}

export async function sendPlatformNotification(input: {
  orgId?: string
  name: string
  content: string
  includeEmployees?: boolean
}): Promise<{ ok: boolean; organizationsNotified: number; pushSent: number; pushFailed: number } | null> {
  if (!functions) return null
  const callable = httpsCallable<
    { orgId?: string; name: string; content: string; includeEmployees?: boolean },
    { ok: boolean; organizationsNotified: number; pushSent: number; pushFailed: number }
  >(functions, "sendPlatformNotification")
  const result = await callable(input)
  return result.data
}

export async function requestStoreAccess(input: {
  orgId: string
  storeId: string
  reason?: string
}): Promise<{ ok: boolean; requestId: string; status: "pending" } | null> {
  if (!functions) return null
  const callable = httpsCallable<
    { orgId: string; storeId: string; reason?: string },
    { ok: boolean; requestId: string; status: "pending" }
  >(functions, "requestStoreAccess")
  const result = await callable(input)
  return result.data
}

export async function reviewStoreAccessRequest(input: {
  orgId: string
  requestId: string
  decision: "approved" | "denied"
  note?: string
}): Promise<{ ok: boolean; status: "approved" | "denied" } | null> {
  if (!functions) return null
  const callable = httpsCallable<
    { orgId: string; requestId: string; decision: "approved" | "denied"; note?: string },
    { ok: boolean; status: "approved" | "denied" }
  >(functions, "reviewStoreAccessRequest")
  const result = await callable(input)
  return result.data
}

export async function savePublicSiteContentByCallable(input: {
  privacyContent?: string
  termsContent?: string
  contactEmail?: string
  contactPhone?: string
  faq?: Array<{ id?: string; question?: string; answer?: string }>
}): Promise<{ ok: boolean } | null> {
  if (!functions) return null
  const callable = httpsCallable<
    {
      privacyContent?: string
      termsContent?: string
      contactEmail?: string
      contactPhone?: string
      faq?: Array<{ id?: string; question?: string; answer?: string }>
    },
    { ok: boolean }
  >(functions, "savePublicSiteContent")
  const result = await callable(input)
  return result.data
}

export async function createCheckoutSession(input: {
  orgId: string
  priceId: string
  successUrl: string
  cancelUrl: string
  trialFromPlanDays?: number
}): Promise<{ ok: boolean; url?: string; pending?: boolean; sessionDocPath: string } | null> {
  if (!functions) return null
  const callable = httpsCallable<
    {
      orgId: string
      priceId: string
      successUrl: string
      cancelUrl: string
      trialFromPlanDays?: number
    },
    { ok: boolean; url?: string; pending?: boolean; sessionDocPath: string }
  >(functions, "createStripeCheckoutSession")
  const result = await callable(input)
  return result.data
}

export async function createBillingPortalSession(input: {
  orgId: string
  returnUrl: string
}): Promise<{ ok: boolean; url?: string; pending?: boolean; sessionDocPath: string } | null> {
  if (!functions) return null
  const callable = httpsCallable<{ orgId: string; returnUrl: string }, { ok: boolean; url?: string; pending?: boolean; sessionDocPath: string }>(
    functions,
    "createStripePortalSession"
  )
  const result = await callable(input)
  return result.data
}

export async function listPublicStripePlans(
  input: ListPublicStripePlansRequest = {}
): Promise<ListPublicStripePlansResponse | null> {
  if (!functions) return null
  const callable = httpsCallable<ListPublicStripePlansRequest, ListPublicStripePlansResponse>(
    functions,
    "listPublicStripePlans"
  )
  const result = await callable(input)
  return result.data
}
