"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppButton, AppCard, DataTable, type TableColumn } from "@inventracker/ui"
import { sendPasswordResetEmail } from "firebase/auth"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { auth } from "@/lib/firebase/client"
import { fetchAdminOrganizationDetailDirect, upsertMember } from "@/lib/data/firestore"
import { adminGetOrganizationDetail, adminSafeEdit } from "@/lib/firebase/functions"

type AdminMemberRow = {
  id: string
  email?: string
  firstName?: string
  lastName?: string
  employeeId?: string
  role?: string
  storeIds?: string[]
  permissionFlags?: Record<string, boolean>
}

export default function AdminStoreUsersPage({ params }: { params: { orgId: string; storeId: string } }) {
  const { canViewAdmin, loading } = useOrgContext()
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data, refetch } = useQuery({
    queryKey: ["admin-store-users", params.orgId, params.storeId],
    queryFn: async () => {
      try {
        return await adminGetOrganizationDetail({ orgId: params.orgId })
      } catch {
        return await fetchAdminOrganizationDetailDirect(params.orgId)
      }
    },
    enabled: canViewAdmin
  })

  const members = (((data?.members as AdminMemberRow[] | undefined) ?? []).filter((member) => {
    if (member.role === "Owner") return true
    const storeIds = member.storeIds ?? []
    return storeIds.includes(params.storeId)
  })).sort((a, b) => {
    const aName = `${a.lastName ?? ""} ${a.firstName ?? ""}`.trim() || a.email || a.id
    const bName = `${b.lastName ?? ""} ${b.firstName ?? ""}`.trim() || b.email || b.id
    return aName.localeCompare(bName)
  })

  const updateMember = async (member: AdminMemberRow, nextRole: "Owner" | "Manager" | "Staff") => {
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      await adminSafeEdit({
        orgId: params.orgId,
        targetType: "member",
        targetId: member.id,
        storeId: params.storeId,
        patch: {
          role: nextRole,
          storeIds: nextRole === "Owner" ? [] : [params.storeId]
        }
      })
      await refetch()
      setStatusMessage("User permissions updated.")
    } catch {
      try {
        await upsertMember(params.orgId, {
          userId: member.id,
          role: nextRole,
          storeIds: nextRole === "Owner" ? [] : [params.storeId],
          departmentIds: [],
          locationIds: [],
          email: member.email,
          firstName: member.firstName,
          lastName: member.lastName,
          employeeId: member.employeeId,
          jobTitle: undefined,
          assignmentType: "store",
          permissionFlags: member.permissionFlags ?? {}
        })
        await refetch()
        setStatusMessage("User permissions updated.")
      } catch {
        setErrorMessage("Could not update permissions.")
      }
    }
  }

  const resetPassword = async (member: AdminMemberRow) => {
    if (!member.email || !auth) return
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      await sendPasswordResetEmail(auth, member.email)
      setStatusMessage(`Password reset email sent to ${member.email}.`)
    } catch {
      setErrorMessage("Could not send password reset email.")
    }
  }

  const columns: TableColumn<AdminMemberRow>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) =>
        `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.email || row.id
    },
    { key: "employeeId", header: "Employee ID", render: (row) => row.employeeId ?? "—" },
    { key: "email", header: "Email", render: (row) => row.email ?? "—" },
    { key: "role", header: "Role", render: (row) => row.role ?? "Staff" },
    {
      key: "permissions",
      header: "Permissions",
      render: (row) =>
        Object.entries(row.permissionFlags ?? {})
          .filter((entry) => entry[1])
          .map((entry) => entry[0])
          .join(", ") || "—"
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <AppButton variant="secondary" className="!px-3 !py-1" onClick={() => void updateMember(row, "Staff")}>
            Set Staff
          </AppButton>
          <AppButton variant="secondary" className="!px-3 !py-1" onClick={() => void updateMember(row, "Manager")}>
            Set Manager
          </AppButton>
          <AppButton variant="secondary" className="!px-3 !py-1" onClick={() => void updateMember(row, "Owner")}>
            Set Owner
          </AppButton>
          <AppButton variant="secondary" className="!px-3 !py-1" onClick={() => void resetPassword(row)}>
            Reset Password
          </AppButton>
        </div>
      )
    }
  ]

  if (loading) {
    return (
      <div>
        <PageHead title="Store Users" subtitle="Loading access..." />
        <AppCard>
          <p className="secondary-text">Checking admin permissions.</p>
        </AppCard>
      </div>
    )
  }

  if (!canViewAdmin) {
    return (
      <div>
        <PageHead title="Store Users" subtitle="Platform Admin only." />
        <AppCard>
          <p className="secondary-text">Access denied.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Store Users" subtitle="Name, permissions, and password reset controls." />
      <AppCard>
        <DataTable columns={columns} rows={members} empty="No users found for this store." />
      </AppCard>
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
