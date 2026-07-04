"use client"

import { useEffect, useState } from "react"
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile, type User } from "firebase/auth"
import { doc, serverTimestamp, setDoc } from "firebase/firestore"
import { CheckCircle2, Database, LogOut, PlugZap, UserPlus } from "lucide-react"

import { Button, Field, Panel, StatusPill, TextInput } from "@/components/ui"
import { auth, db, firebaseConfigured } from "@/lib/firebase"
import { DEFAULT_ORG_ID } from "@/lib/firestore-schema"

function errorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : "Firebase request failed."

  if (code.includes("auth/email-already-in-use")) return "That email already has a Firebase account. Use Sign in instead."
  if (code.includes("auth/invalid-credential")) return "Firebase did not accept that email/password."
  if (code.includes("auth/weak-password")) return "Use a password with at least 6 characters."
  if (code.includes("permission-denied")) {
    return "Firebase is connected, but Firestore blocked the write. If this org already belongs to another owner, seed or switch the default org."
  }

  return message
}

function displayNameFor(user: User | null, fallback: string) {
  return user?.displayName || fallback.trim() || user?.email?.split("@")[0] || "Owner"
}

export function FirebaseConnectionPanel({ defaultName, defaultEmail }: { defaultName?: string; defaultEmail?: string }) {
  const [user, setUser] = useState<User | null>(null)
  const [name, setName] = useState(defaultName ?? "")
  const [email, setEmail] = useState(defaultEmail ?? "")
  const [password, setPassword] = useState("")
  const [companyName, setCompanyName] = useState("InvenTracker Workspace")
  const [busy, setBusy] = useState<"signin" | "create" | "prepare" | "signout" | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      if (nextUser?.email) setEmail(nextUser.email)
      if (nextUser?.displayName) setName(nextUser.displayName)
    })
  }, [])

  async function createAccount() {
    if (!auth) throw new Error("Firebase Auth is not configured.")
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
    if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() })
    setUser(credential.user)
    setMessage("Firebase account created. Prepare the workspace next so saves can sync.")
  }

  async function signIn() {
    if (!auth) throw new Error("Firebase Auth is not configured.")
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password)
    setUser(credential.user)
    setMessage("Signed in to Firebase. Prepare the workspace if this is the first time on this database.")
  }

  async function prepareWorkspace() {
    if (!db) throw new Error("Firestore is not configured.")
    if (!user) throw new Error("Sign in before preparing the workspace.")

    const ownerName = displayNameFor(user, name)
    const firestore = db
    const orgRef = doc(firestore, "orgs", DEFAULT_ORG_ID)
    const memberRef = doc(firestore, "orgs", DEFAULT_ORG_ID, "members", user.uid)
    const userRef = doc(firestore, "users", user.uid)
    const preferencesRef = doc(firestore, "users", user.uid, "preferences", "workspace")

    const orgPayload = {
      ownerId: user.uid,
      companyName: companyName.trim() || "InvenTracker Workspace",
      logoUrl: "/inventracker-mark.svg",
      headerText: "Connected workspace",
      accentColor: "#2563eb",
      secondaryColor: "#14b8a6",
      defaultMode: "Dark",
      defaultTheme: "Blue steel",
      schemaVersion: 1,
      updatedAt: serverTimestamp()
    }

    const memberPayload = {
      id: user.uid,
      uid: user.uid,
      name: ownerName,
      email: user.email ?? email.trim(),
      employeeId: "OWNER-001",
      phone: "",
      jobTitle: "Organization Owner",
      department: "Administration",
      location: "All stores",
      store: "All stores",
      status: "Active",
      role: "owner",
      permissions: ["*"],
      lastActive: "Connected now",
      schemaVersion: 1,
      updatedAt: serverTimestamp()
    }

    const writeOrg = () => setDoc(orgRef, orgPayload, { merge: true })
    const writeMember = () => setDoc(memberRef, memberPayload, { merge: true })

    try {
      await writeOrg()
      await writeMember()
    } catch (firstError) {
      await writeMember().catch(() => {
        throw firstError
      })
      await writeOrg()
    }

    await setDoc(userRef, { email: user.email ?? email.trim(), name: ownerName, defaultOrgId: DEFAULT_ORG_ID, updatedAt: serverTimestamp() }, { merge: true })
    await setDoc(preferencesRef, { schemaVersion: 1, updatedAt: serverTimestamp() }, { merge: true })

    setMessage(`Workspace connected to Firestore at orgs/${DEFAULT_ORG_ID}. Saves can now sync across devices.`)
  }

  async function run(kind: "signin" | "create" | "prepare" | "signout", action: () => Promise<void>) {
    setBusy(kind)
    setMessage("")
    setError("")

    try {
      await action()
    } catch (caughtError) {
      setError(errorMessage(caughtError))
    } finally {
      setBusy(null)
    }
  }

  const connected = Boolean(firebaseConfigured && auth && db)

  return (
    <Panel className="p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-text)]">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-[var(--app-text)]">Firebase connection</h2>
            <p className="app-tip mt-1 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
              Connect this browser to Firebase Auth and create the owner workspace records needed for database-backed saves.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={connected ? "green" : "red"}>{connected ? "Config loaded" : "Config missing"}</StatusPill>
          <StatusPill tone={user ? "blue" : "neutral"}>{user ? "Signed in" : "Not signed in"}</StatusPill>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Owner name" autoComplete="name" />
          </Field>
          <Field label="Company or workspace">
            <TextInput value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="The Fresh Market" />
          </Field>
          <Field label="Firebase email">
            <TextInput value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="owner@example.com" autoComplete="email" />
          </Field>
          <Field label="Firebase password">
            <TextInput
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Password"
              autoComplete={user ? "current-password" : "new-password"}
            />
          </Field>
        </div>

        <div className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
          <p className="text-sm font-semibold text-[var(--app-text)]">Current workspace</p>
          <div className="mt-3 space-y-2 text-sm text-[var(--app-muted)]">
            <p>
              Org path: <span className="font-semibold text-[var(--app-text)]">orgs/{DEFAULT_ORG_ID}</span>
            </p>
            <p>
              User: <span className="font-semibold text-[var(--app-text)]">{user?.email ?? "Not signed in"}</span>
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" icon={<PlugZap className="h-4 w-4" />} disabled={!connected || busy !== null} onClick={() => void run("signin", signIn)}>
              {busy === "signin" ? "Signing in..." : "Sign in"}
            </Button>
            <Button variant="secondary" icon={<UserPlus className="h-4 w-4" />} disabled={!connected || busy !== null} onClick={() => void run("create", createAccount)}>
              {busy === "create" ? "Creating..." : "Create account"}
            </Button>
            <Button icon={<CheckCircle2 className="h-4 w-4" />} disabled={!connected || !user || busy !== null} onClick={() => void run("prepare", prepareWorkspace)}>
              {busy === "prepare" ? "Preparing..." : "Prepare workspace"}
            </Button>
            {user ? (
              <Button
                variant="ghost"
                icon={<LogOut className="h-4 w-4" />}
                disabled={busy !== null}
                onClick={() =>
                  void run("signout", async () => {
                    if (!auth) return
                    await signOut(auth)
                    setMessage("Signed out of Firebase.")
                  })
                }
              >
                Sign out
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {message ? <p className="mt-4 text-sm font-semibold text-emerald-300">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-semibold text-rose-300">{error}</p> : null}
    </Panel>
  )
}
