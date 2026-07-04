import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"

import { auth, db } from "@/lib/firebase"
import { centralCatalogPath, DEFAULT_ORG_ID, firestoreCollections, orgCollectionPath, storeCollectionPath, type FirestoreCollectionKey } from "@/lib/firestore-schema"

function ensureDb() {
  if (!db) {
    throw new Error("Firebase is not configured for this browser session.")
  }

  return db
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function compactFirestoreValue(value: unknown): unknown {
  if (value === undefined) return undefined
  if (Array.isArray(value)) return value.map(compactFirestoreValue).filter((item) => item !== undefined)
  if (!isPlainRecord(value)) return value

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nestedValue]) => [key, compactFirestoreValue(nestedValue)] as const)
      .filter(([, nestedValue]) => nestedValue !== undefined)
  )
}

function compactFirestoreData(data: Record<string, unknown>) {
  return compactFirestoreValue(data) as Record<string, unknown>
}

export async function writeOrgRecord(collectionKey: FirestoreCollectionKey, recordId: string | undefined, data: Record<string, unknown>, orgId = DEFAULT_ORG_ID) {
  const firestore = ensureDb()
  const path = orgCollectionPath(orgId, collectionKey)
  const ref = recordId ? doc(firestore, path, recordId) : doc(collection(firestore, path))
  const payload = compactFirestoreData({
    ...data,
    updatedAt: serverTimestamp(),
    ...(recordId ? {} : { createdAt: serverTimestamp() })
  })

  await setDoc(ref, payload, { merge: true })

  return ref.id
}

export function centralProductId({ sku, name }: { sku?: string; name: string }) {
  const key = slugify(sku || name)
  return key ? `central-${key}` : undefined
}

export async function writeCentralCatalogProduct(recordId: string | undefined, data: Record<string, unknown>) {
  const firestore = ensureDb()
  const path = centralCatalogPath()
  const ref = recordId ? doc(firestore, path, recordId) : doc(collection(firestore, path))
  const payload = compactFirestoreData({
    ...data,
    updatedAt: serverTimestamp(),
    ...(recordId ? {} : { createdAt: serverTimestamp() })
  })

  await setDoc(ref, payload, { merge: true })

  return ref.id
}

export async function submitPlatformProductApproval(recordId: string | undefined, data: Record<string, unknown>) {
  const firestore = ensureDb()
  const userId = await currentUserId()
  if (!userId) {
    throw new Error("Sign in before submitting product approval candidates.")
  }

  const ref = recordId ? doc(firestore, firestoreCollections.platformProductApprovals, recordId) : doc(collection(firestore, firestoreCollections.platformProductApprovals))
  const payload = compactFirestoreData({
    ...data,
    submittedByUid: userId,
    status: "pending",
    updatedAt: serverTimestamp(),
    ...(recordId ? {} : { createdAt: serverTimestamp() })
  })

  await setDoc(ref, payload, { merge: true })

  return ref.id
}

export async function writeStoreProductDetail(
  storeId: string,
  recordId: string | undefined,
  data: Record<string, unknown>,
  orgId = DEFAULT_ORG_ID
) {
  const firestore = ensureDb()
  const path = storeCollectionPath(orgId, storeId, "storeProductDetails")
  const ref = recordId ? doc(firestore, path, recordId) : doc(collection(firestore, path))
  const payload = compactFirestoreData({
    ...data,
    updatedAt: serverTimestamp(),
    ...(recordId ? {} : { createdAt: serverTimestamp() })
  })

  await setDoc(ref, payload, { merge: true })

  return ref.id
}

export async function archiveOrgRecord(collectionKey: FirestoreCollectionKey, recordId: string, orgId = DEFAULT_ORG_ID) {
  return writeOrgRecord(
    collectionKey,
    recordId,
    {
      archived: true,
      status: "Archived",
      archivedAt: serverTimestamp()
    },
    orgId
  )
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

function normalizeFormValue(value: FormDataEntryValue) {
  if (typeof value === "string") return value

  return {
    fileName: value.name,
    size: value.size,
    type: value.type
  }
}

function mergeFormField(fields: Record<string, unknown>, key: string, value: unknown) {
  const existingValue = fields[key]
  if (existingValue === undefined) {
    fields[key] = value
    return
  }

  fields[key] = Array.isArray(existingValue) ? [...existingValue, value] : [existingValue, value]
}

function formFields(form: HTMLFormElement | null) {
  if (!form) return scopedFields()

  const fields: Record<string, unknown> = {}
  const formData = new FormData(form)

  formData.forEach((value, key) => {
    if (!key) return
    mergeFormField(fields, key, normalizeFormValue(value))
  })

  form.querySelectorAll<HTMLInputElement>("input[type='checkbox'][name]").forEach((checkbox) => {
    fields[checkbox.name] = checkbox.checked
  })

  return fields
}

function controlSnapshot(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  if (control instanceof HTMLInputElement) {
    if (control.type === "checkbox") return control.checked
    if (control.type === "radio") return control.checked ? control.value : undefined
    if (control.type === "file") {
      return Array.from(control.files ?? []).map((file) => ({
        fileName: file.name,
        size: file.size,
        type: file.type
      }))
    }
  }

  if (control instanceof HTMLSelectElement && control.multiple) {
    return Array.from(control.selectedOptions).map((option) => option.value)
  }

  return control.value
}

function scopedFields() {
  const root = typeof document === "undefined" ? null : document.querySelector("main")
  if (!root) return {}

  const fields: Record<string, unknown> = {}
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input[name], select[name], textarea[name]").forEach((control) => {
    const value = controlSnapshot(control)
    if (value === undefined) return
    mergeFormField(fields, control.name, value)
  })

  return fields
}

async function currentUserId() {
  const firebaseAuth = auth
  if (!firebaseAuth) return null
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser.uid

  return new Promise<string | null>((resolve) => {
    let unsubscribe = () => {}
    const timeout = window.setTimeout(() => {
      unsubscribe()
      resolve(firebaseAuth.currentUser?.uid ?? null)
    }, 2000)

    unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (user) => {
        window.clearTimeout(timeout)
        unsubscribe()
        resolve(user?.uid ?? null)
      },
      () => {
        window.clearTimeout(timeout)
        unsubscribe()
        resolve(null)
      }
    )
  })
}

export async function writeFormSnapshot({
  actionLabel,
  form,
  orgId = DEFAULT_ORG_ID,
  pathname = "/"
}: {
  actionLabel: string
  form: HTMLFormElement | null
  orgId?: string
  pathname?: string
}) {
  if (!db || !auth) {
    throw new Error("Firebase is not configured, so this cannot sync to the database yet.")
  }

  const userId = await currentUserId()
  if (!userId) {
    throw new Error("Sign in before saving so this can sync across devices.")
  }

  const recordId = slugify(`${pathname || "workspace"}-${actionLabel || "save"}`) || "workspace-save"

  return writeOrgRecord(
    "formSaves",
    recordId,
    {
      actionLabel,
      fields: formFields(form),
      pathname,
      savedBy: userId,
      savedAt: serverTimestamp(),
      source: "web",
      schemaVersion: 1
    },
    orgId
  )
}
