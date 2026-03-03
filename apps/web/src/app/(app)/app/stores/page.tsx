"use client"

import Link from "next/link"
import {
  AppButton,
  AppCard,
  AppInput,
  AppSelect,
  AppTextarea,
  DataTable,
  type TableColumn,
  SearchInput
} from "@inventracker/ui"
import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  createStore,
  fetchStoreAccessRequests,
  fetchStores,
  formatStoreLabel,
  reviewStoreAccessRequest,
  submitStoreAccessRequest,
  updateStore,
  type StoreWithPath
} from "@/lib/data/firestore"

export default function StoresPage() {
  const { user } = useAuthUser()
  const { activeOrgId, activeOrg, effectivePermissions } = useOrgContext()
  const [queryText, setQueryText] = useState("")
  const [title, setTitle] = useState("")
  const [storeNumber, setStoreNumber] = useState("")
  const [regionName, setRegionName] = useState("")
  const [districtName, setDistrictName] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [addressLine2, setAddressLine2] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [postalCode, setPostalCode] = useState("")
  const [country, setCountry] = useState("USA")
  const [status, setStatus] = useState("active")
  const [editingStoreId, setEditingStoreId] = useState("")
  const [requestReasonByStoreId, setRequestReasonByStoreId] = useState<Record<string, string>>({})
  const [requestingStoreId, setRequestingStoreId] = useState<string | null>(null)
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: stores = [], refetch } = useQuery({
    queryKey: ["stores", activeOrgId],
    queryFn: () => fetchStores(activeOrgId),
    enabled: Boolean(activeOrgId)
  })
  const { data: accessRequests = [], refetch: refetchAccessRequests } = useQuery({
    queryKey: ["store-access-requests", activeOrgId],
    queryFn: () => fetchStoreAccessRequests(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const filtered = useMemo(
    () =>
      stores.filter((store) =>
        `${formatStoreLabel(store)} ${store.city ?? ""} ${store.state ?? ""}`
          .toLowerCase()
          .includes(queryText.toLowerCase())
      ),
    [queryText, stores]
  )

  const assignedStoreIds = useMemo(() => new Set(activeOrg?.storeIds ?? []), [activeOrg?.storeIds])
  const requestableStores = useMemo(
    () => stores.filter((store) => !assignedStoreIds.has(store.id)),
    [assignedStoreIds, stores]
  )
  const myPendingRequests = useMemo(
    () => accessRequests.filter((entry) => entry.requesterUid === user?.uid && entry.status === "pending"),
    [accessRequests, user?.uid]
  )
  const pendingRequestsForReview = useMemo(
    () => accessRequests.filter((entry) => entry.status === "pending"),
    [accessRequests]
  )

  const columns: TableColumn<StoreWithPath>[] = [
    {
      key: "store",
      header: "Store",
      render: (store) => (
        <Link className="font-semibold text-blue-400" href={`/app/stores/${store.id}`}>
          {formatStoreLabel(store)}
        </Link>
      )
    },
    { key: "address", header: "Address", render: (store) => [store.addressLine1, store.city, store.state].filter(Boolean).join(", ") || "—" },
    { key: "region", header: "Region", render: (store) => store.regionId || "—" },
    { key: "district", header: "District", render: (store) => store.districtId || "—" },
    { key: "status", header: "Status", render: (store) => store.status },
    { key: "sync", header: "Last Sync", render: () => "—" },
    {
      key: "actions",
      header: "Actions",
      render: (store) => (
        <AppButton
          className="h-8 px-3 py-1"
          variant="secondary"
          onClick={() => {
            setEditingStoreId(store.id)
            setTitle(store.title ?? store.name)
            setStoreNumber(store.storeNumber ?? "")
            setAddressLine1(store.addressLine1 ?? "")
            setAddressLine2(store.addressLine2 ?? "")
            setCity(store.city ?? "")
            setState(store.state ?? "")
            setPostalCode(store.postalCode ?? "")
            setCountry(store.country ?? "USA")
            setRegionName("")
            setDistrictName("")
            setStatus(store.status || "active")
          }}
        >
          Edit
        </AppButton>
      )
    }
  ]

  const submitStore = async () => {
    if (!activeOrgId || !title.trim()) return
    if (!addressLine1.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
      setErrorMessage("Address line, city, state, and postal code are required.")
      return
    }
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      if (editingStoreId) {
        const store = stores.find((entry) => entry.id === editingStoreId)
        if (!store) {
          setErrorMessage("Selected store could not be found.")
          return
        }
        await updateStore(activeOrgId, store, {
          title: title.trim(),
          storeNumber: storeNumber.trim(),
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim(),
          city: city.trim(),
          state: state.trim(),
          postalCode: postalCode.trim(),
          country: country.trim() || "USA",
          status
        })
      } else {
        await createStore(activeOrgId, {
          title: title.trim(),
          storeNumber: storeNumber.trim(),
          regionName: regionName.trim() || undefined,
          districtName: districtName.trim() || undefined,
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim(),
          city: city.trim(),
          state: state.trim(),
          postalCode: postalCode.trim(),
          country: country.trim() || "USA"
        })
      }
      await refetch()
      setTitle("")
      setStoreNumber("")
      setRegionName("")
      setDistrictName("")
      setAddressLine1("")
      setAddressLine2("")
      setCity("")
      setState("")
      setPostalCode("")
      setCountry("USA")
      setStatus("active")
      setEditingStoreId("")
      setStatusMessage(editingStoreId ? "Store updated." : "Store created.")
    } catch {
      setErrorMessage(editingStoreId ? "Could not update store." : "Could not create store.")
    }
  }

  const requestStoreAccess = async (storeId: string) => {
    if (!activeOrgId || !effectivePermissions.requestStoreAccess) return
    setStatusMessage(null)
    setErrorMessage(null)
    setRequestingStoreId(storeId)
    try {
      await submitStoreAccessRequest({
        orgId: activeOrgId,
        storeId,
        reason: requestReasonByStoreId[storeId] ?? ""
      })
      await refetchAccessRequests()
      setStatusMessage("Store access request submitted.")
    } catch (error) {
      const message = String((error as { message?: string } | undefined)?.message ?? "")
      setErrorMessage(message || "Could not submit store access request.")
    } finally {
      setRequestingStoreId(null)
    }
  }

  const reviewAccessRequest = async (requestId: string, decision: "approved" | "denied") => {
    if (!activeOrgId || !effectivePermissions.approveStoreAccessRequests) return
    setStatusMessage(null)
    setErrorMessage(null)
    setReviewingRequestId(requestId)
    try {
      await reviewStoreAccessRequest({
        orgId: activeOrgId,
        requestId,
        decision
      })
      await refetchAccessRequests()
      setStatusMessage(decision === "approved" ? "Access request approved." : "Access request denied.")
    } catch (error) {
      const message = String((error as { message?: string } | undefined)?.message ?? "")
      setErrorMessage(message || "Could not review store access request.")
    } finally {
      setReviewingRequestId(null)
    }
  }

  if (!effectivePermissions.manageStores) {
    return (
      <div>
        <PageHead title="Stores" subtitle="Region and district are optional when creating a store." />
        <div className="space-y-4">
          <AppCard>
            <p className="secondary-text">You do not have permission to manage stores.</p>
          </AppCard>
          {effectivePermissions.requestStoreAccess ? (
            <AppCard>
              <h2 className="card-title">Request Store Access</h2>
              <p className="secondary-text mt-2">Request access to additional stores in your organization.</p>
              <div className="mt-4 space-y-3">
                {requestableStores.length === 0 ? (
                  <p className="secondary-text">No additional stores are available right now.</p>
                ) : (
                  requestableStores.map((store) => (
                    <div key={store.id} className="rounded-2xl border border-app-border p-3">
                      <p className="text-sm font-semibold">{formatStoreLabel(store)}</p>
                      <p className="secondary-text mt-1 text-xs">{[store.city, store.state].filter(Boolean).join(", ") || "No location set"}</p>
                      <AppTextarea
                        className="mt-2 min-h-24"
                        placeholder="Reason for access (optional)"
                        value={requestReasonByStoreId[store.id] ?? ""}
                        onChange={(event) =>
                          setRequestReasonByStoreId((current) => ({ ...current, [store.id]: event.target.value }))
                        }
                      />
                      <AppButton
                        className="mt-2"
                        onClick={() => void requestStoreAccess(store.id)}
                        disabled={requestingStoreId === store.id}
                      >
                        {requestingStoreId === store.id ? "Submitting..." : "Request Access"}
                      </AppButton>
                    </div>
                  ))
                )}
              </div>
              {myPendingRequests.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  You have {myPendingRequests.length} pending request(s).
                </div>
              ) : null}
            </AppCard>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Stores" subtitle="Region and district are optional when creating a store." />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.9fr]">
        <AppCard>
          <div className="flex items-center justify-between gap-2">
            <h2 className="card-title">{editingStoreId ? "Edit Store" : "Add Store"}</h2>
            {editingStoreId ? (
              <AppButton
                className="px-3 py-1"
                variant="secondary"
                onClick={() => {
                  setEditingStoreId("")
                  setTitle("")
                  setStoreNumber("")
                  setRegionName("")
                  setDistrictName("")
                  setAddressLine1("")
                  setAddressLine2("")
                  setCity("")
                  setState("")
                  setPostalCode("")
                  setCountry("USA")
                  setStatus("active")
                }}
              >
                Cancel edit
              </AppButton>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <AppInput
                placeholder="Store title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <AppInput
                placeholder="Store number"
                value={storeNumber}
                onChange={(event) => setStoreNumber(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <AppInput
                placeholder="Region name (optional)"
                value={regionName}
                onChange={(event) => setRegionName(event.target.value)}
              />
              <AppInput
                placeholder="District name (optional)"
                value={districtName}
                onChange={(event) => setDistrictName(event.target.value)}
              />
            </div>
            <AppInput
              placeholder="Address line 1"
              value={addressLine1}
              onChange={(event) => setAddressLine1(event.target.value)}
            />
            <AppInput
              placeholder="Address line 2 (optional)"
              value={addressLine2}
              onChange={(event) => setAddressLine2(event.target.value)}
            />
            <div className="grid grid-cols-3 gap-3">
              <AppInput
                placeholder="City"
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
              <AppInput
                placeholder="State"
                value={state}
                onChange={(event) => setState(event.target.value)}
              />
              <AppInput
                placeholder="Postal code"
                value={postalCode}
                onChange={(event) => setPostalCode(event.target.value)}
              />
            </div>
            <AppInput
              placeholder="Country"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            />
            <AppSelect
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </AppSelect>
            <AppButton onClick={() => void submitStore()}>
              {editingStoreId ? "Save Changes" : "Create Store"}
            </AppButton>
          </div>
        </AppCard>
        <AppCard>
          <SearchInput value={queryText} onChange={setQueryText} placeholder="Search stores" />
          <div className="mt-4">
            <DataTable columns={columns} rows={filtered} empty="No stores found." />
          </div>
          {effectivePermissions.approveStoreAccessRequests && pendingRequestsForReview.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-app-border p-3">
              <h3 className="text-sm font-semibold">Pending Access Requests</h3>
              <div className="mt-2 space-y-2">
                {pendingRequestsForReview.map((request) => (
                  <div key={request.id} className="rounded-xl border border-app-border bg-app-surface-soft p-3">
                    <p className="text-sm font-semibold">
                      {request.requesterName ?? request.requesterUid} → {request.targetStoreLabel ?? request.targetStoreId}
                    </p>
                    <p className="secondary-text mt-1 text-xs">{request.reason || "No reason provided."}</p>
                    <div className="mt-2 flex gap-2">
                      <AppButton
                        className="h-8 px-3 py-1"
                        onClick={() => void reviewAccessRequest(request.id, "approved")}
                        disabled={reviewingRequestId === request.id}
                      >
                        Approve
                      </AppButton>
                      <AppButton
                        className="h-8 px-3 py-1"
                        variant="secondary"
                        onClick={() => void reviewAccessRequest(request.id, "denied")}
                        disabled={reviewingRequestId === request.id}
                      >
                        Deny
                      </AppButton>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </AppCard>
      </div>
      {statusMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : null}
    </div>
  )
}
