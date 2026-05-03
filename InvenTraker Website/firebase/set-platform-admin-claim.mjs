#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import admin from "firebase-admin";

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function usage() {
  console.log(
    [
      "Usage:",
      "  node set-platform-admin-claim.mjs --email you@company.com",
      "  node set-platform-admin-claim.mjs --uid FIREBASE_UID",
      "",
      "Optional:",
      "  --remove    remove platform_admin claim instead of enabling it",
      "",
      "Environment:",
      "  GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json"
    ].join("\n")
  );
}

function loadServiceAccount() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not set.");
  }
  const absolutePath = path.resolve(credentialsPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Service account file not found at ${absolutePath}`);
  }
  const raw = fs.readFileSync(absolutePath, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = typeof args.email === "string" ? args.email.trim().toLowerCase() : "";
  const uidArg = typeof args.uid === "string" ? args.uid.trim() : "";
  const shouldRemove = Boolean(args.remove);

  if (!email && !uidArg) {
    usage();
    process.exit(1);
  }

  const serviceAccount = loadServiceAccount();
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || "inventracker-f1229"
    });
  }

  let uid = uidArg;
  if (!uid) {
    const user = await admin.auth().getUserByEmail(email);
    uid = user.uid;
  }

  const userRecord = await admin.auth().getUser(uid);
  const existingClaims = userRecord.customClaims || {};
  const nextClaims = { ...existingClaims };
  if (shouldRemove) {
    delete nextClaims.platform_admin;
  } else {
    nextClaims.platform_admin = true;
  }

  await admin.auth().setCustomUserClaims(uid, nextClaims);
  console.log(
    shouldRemove
      ? `Removed platform_admin claim for ${uid}.`
      : `Set platform_admin=true for ${uid}.`
  );
  console.log("Have the user sign out and sign in again so the new claim is applied.");
}

main().catch((error) => {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
});
