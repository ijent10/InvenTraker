#!/usr/bin/env node

/**
 * Dry-run and optional cleanup for duplicate organization names.
 *
 * Usage:
 *   node remove-duplicate-orgs.mjs --name "Fresh Market"
 *   node remove-duplicate-orgs.mjs --name "Fresh Market" --apply
 *
 * Requires:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json"
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import admin from "firebase-admin";

function parseArgs(argv) {
  const out = {
    name: "",
    apply: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === "--name") {
      out.name = (argv[i + 1] ?? "").trim();
      i += 1;
      continue;
    }
    if (current === "--apply") {
      out.apply = true;
      continue;
    }
    if (current === "--help" || current === "-h") {
      out.help = true;
      continue;
    }
  }
  return out;
}

function printHelp() {
  console.log(
    [
      "Duplicate organization cleanup",
      "",
      "Options:",
      "  --name <text>   Required. Match organization names case-insensitively (contains match).",
      "  --apply         Actually delete duplicate org(s). Without this flag it only reports.",
      "  --help          Show this help.",
      "",
      "Example:",
      "  npm run dedupe-orgs -- --name \"Fresh Market\"",
      "  npm run dedupe-orgs -- --name \"Fresh Market\" --apply"
    ].join("\n")
  );
}

function requireServiceAccountPath() {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccountPath) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not set.");
  }
  return resolve(serviceAccountPath);
}

function normalizeName(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function organizationInventoryMetrics(db, orgId) {
  const itemsSnapshot = await db.collection("organizations").doc(orgId).collection("items").get();
  let totalQuantity = 0;
  for (const item of itemsSnapshot.docs) {
    const qty = item.get("totalQuantity");
    if (typeof qty === "number" && Number.isFinite(qty)) {
      totalQuantity += qty;
    }
  }
  return {
    itemCount: itemsSnapshot.size,
    totalQuantity
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.name) {
    printHelp();
    throw new Error("Missing required --name argument.");
  }

  const serviceAccountPath = requireServiceAccountPath();
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
  }

  const db = admin.firestore();
  const targetName = normalizeName(args.name);

  const orgSnapshot = await db.collection("organizations").get();
  const matching = orgSnapshot.docs.filter((doc) => normalizeName(doc.get("name") ?? "").includes(targetName));

  if (matching.length < 2) {
    console.log(`Found ${matching.length} organization(s) named "${args.name}". Nothing to dedupe.`);
    return;
  }

  const scored = [];
  for (const orgDoc of matching) {
    const metrics = await organizationInventoryMetrics(db, orgDoc.id);
    scored.push({
      id: orgDoc.id,
      name: orgDoc.get("name") ?? "Unnamed",
      ownerUid: orgDoc.get("ownerUid") ?? "",
      itemCount: metrics.itemCount,
      totalQuantity: metrics.totalQuantity
    });
  }

  scored.sort((left, right) => {
    if (right.itemCount !== left.itemCount) return right.itemCount - left.itemCount;
    if (right.totalQuantity !== left.totalQuantity) return right.totalQuantity - left.totalQuantity;
    return left.id.localeCompare(right.id);
  });

  const keep = scored[0];
  const remove = scored.slice(1);

  console.log(`Keeping organization: ${keep.id} (${keep.name})`);
  console.log(`  items=${keep.itemCount}, totalQuantity=${keep.totalQuantity.toFixed(3)}`);
  if (remove.length === 0) return;

  console.log("");
  console.log("Duplicate org(s) marked for deletion:");
  for (const entry of remove) {
    console.log(
      `  - ${entry.id} (${entry.name}) owner=${entry.ownerUid} items=${entry.itemCount} totalQuantity=${entry.totalQuantity.toFixed(3)}`
    );
  }

  if (!args.apply) {
    console.log("");
    console.log("Dry run only. Re-run with --apply to delete the duplicates above.");
    return;
  }

  for (const entry of remove) {
    const orgRef = db.collection("organizations").doc(entry.id);
    await db.recursiveDelete(orgRef);
    console.log(`Deleted organization ${entry.id}`);
  }
}

main().catch((error) => {
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
