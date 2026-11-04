// #sandbox/db — saved data for your app, with nothing to set up. Server code only.
//
//     import { collection, FieldValue, AlreadyExists } from "#sandbox/db";
//
//     const notes = collection("notes");
//     await notes.add({ text: "hello", created_at: FieldValue.serverTimestamp() });
//     const { docs } = await notes.where("text", "==", "hello").orderBy("created_at").get();
//     for (const doc of docs) console.log(doc.id, doc.data());
//
// The Node twin of sandbox_db.py, with the same guarantees: one app never sees another app's data
// (each app has its own database, enforced by the app's identity), and Preview ("dev") never touches
// what real users created on the published app ("prod").
//
// It works the same wherever the app is published (Google Cloud stores it in Firestore, Azure and
// previews in Postgres), so use only what this module offers: collection() and document(); a
// document's get/set(data, { merge })/create/update/delete and collection(); a collection's add/doc/
// get/listDocuments, where(field, op, value) with ==, !=, <, <=, >, >=, in, not-in, array-contains,
// array-contains-any, orderBy(field, "asc" | "desc"), limit, limitToLast, offset, cursors and
// count(); runTransaction(); batch(); and FieldValue's serverTimestamp, delete, increment, arrayUnion,
// arrayRemove. Dates come back as Timestamps (toDate(), toMillis()). Catch AlreadyExists and NotFound
// from here. Never import @google-cloud, @azure or pg in app code.
import { appRequire, node } from "./_server.mjs";
import * as store from "./_store-postgres.mjs";

export const { AlreadyExists, NotFound } = store;

// Where this app's data lives, set by the platform: "firestore" (Google Cloud) or "postgres" (Azure,
// and previews).
export const BACKEND = (process.env.SYMPOSIA_DATA_BACKEND || "").trim() === "postgres" ? "postgres" : "firestore";

// The app this code belongs to. Set by the platform for both Preview and the published site; falls
// back to the working directory's name so a bare local run still does something sensible.
export function appSlug() {
  return (process.env.SYMPOSIA_APP || node("path").basename(process.cwd()) || "app").trim();
}

// "dev" in Preview, "prod" on the published site. Anything unrecognised is "dev", so a
// misconfiguration can only fail safe: never write into real users' data by accident.
export function env() {
  return (process.env.SYMPOSIA_ENV || "dev").trim().toLowerCase() === "prod" ? "prod" : "dev";
}

// The database the publisher provisioned for this project; existing apps without the setting keep
// their original one.
export function databaseId() {
  const explicit = process.env.SYMPOSIA_DATABASE;
  if (explicit) return explicit.trim();
  const fs = node("fs"), path = node("path");
  const assignment = path.join(process.cwd(), ".symposia-database");
  if (fs.existsSync(assignment)) {
    const owner = path.join(process.cwd(), ".symposia-owner");
    const expected = `${process.env.SYMPOSIA_TENANT_SLUG || ""}:${process.env.CODER_WORKSPACE_OWNER_EMAIL || ""}`;
    if (!fs.existsSync(owner) || fs.readFileSync(owner, "utf8").trim() !== expected)
      throw new Error("this database belongs to another workspace");
    return fs.readFileSync(assignment, "utf8").trim();
  }
  return "app-" + appSlug();
}

// Created on first use, so importing this module never needs credentials or a network.
let client;
function client_() {
  if (!client && BACKEND === "postgres") client = store.client();
  if (!client) {
    const { Firestore } = appRequire("@google-cloud/firestore");
    client = new Firestore({ projectId: process.env.GOOGLE_CLOUD_PROJECT || undefined, databaseId: databaseId() });
  }
  return client;
}

const fieldValue = () => (BACKEND === "postgres" ? store.FieldValue : appRequire("@google-cloud/firestore").FieldValue);
export const FieldValue = {
  serverTimestamp: () => fieldValue().serverTimestamp(),
  delete: () => fieldValue().delete(),
  increment: (n) => fieldValue().increment(n),
  arrayUnion: (...values) => fieldValue().arrayUnion(...values),
  arrayRemove: (...values) => fieldValue().arrayRemove(...values),
};

// A collection scoped to THIS app and THIS environment: a subcollection under a per-environment root
// document, so "dev" and "prod" never collide. The name you pass is exactly what you read back.
export function collection(name) {
  if (!name || typeof name !== "string" || name.includes("/")) throw new TypeError("collection name must be a simple name with no '/'");
  return client_().collection("_env").doc(env()).collection(name);
}

// One document by id within an app+env-scoped collection.
export function document(collectionName, id) {
  return collection(collectionName).doc(id);
}

// runTransaction(async (t) => { const snap = await t.get(ref); t.update(ref, {...}); }): reads first,
// then writes, all applied together; retried when another transaction got in the way.
export function runTransaction(fn) {
  return client_().runTransaction(fn);
}

// Several writes applied together: batch().set(...).update(...).delete(...), then await .commit().
export function batch() {
  return client_().batch();
}
