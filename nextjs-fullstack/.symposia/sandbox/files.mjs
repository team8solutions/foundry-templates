// #sandbox/files — files for your app (uploads, images, generated PDFs), with nothing to set up.
// Server code only.
//
//     import { put, url, read } from "#sandbox/files";
//
//     await put("logo.png", imageBuffer, { contentType: "image/png" });
//     const href = await url("logo.png");   // a temporary link the browser can load
//     const data = await read("logo.png");  // the bytes back, as a Buffer
//
// The Node twin of sandbox_files.py: files live in this app's own private area and are served by
// short-lived signed links, never a public bucket and never readable by another app. Preview ("dev")
// and the published app ("prod") keep separate areas. It works the same wherever the app is published
// (Google Cloud Storage, Azure Blob Storage, or a folder in Preview).
import { appRequire, node } from "./_server.mjs";
import { appSlug as app, databaseId, env } from "./db.mjs";

export { env };

// Where files live, set by the platform: "gcs" (Google Cloud Storage) or "blob" (Azure Blob Storage).
export const BACKEND = (process.env.SYMPOSIA_FILES_BACKEND || "").trim() === "blob" ? "blob" : "gcs";

export function appSlug() {
  const explicit = process.env.SYMPOSIA_FILES_NAMESPACE;
  if (explicit) return explicit.trim();
  const assigned = databaseId();
  return assigned === "app-" + app() ? app() : assigned;
}

// Where a file is stored: scoped to this app and environment. Rejects path tricks so a file name can
// never escape the app's own area.
export function objectPath(name) {
  name = String(name ?? "").trim().replace(/^\/+/, "");
  if (!name || name.split("/").includes("..")) throw new Error("invalid file name");
  return `apps/${appSlug()}/${env()}/${name}`;
}

const encoded = (objectName) => objectName.split("/").map(encodeURIComponent).join("/");

function localPath(name) {
  const root = process.env.SYMPOSIA_LOCAL_FILES;
  if (!root) return null;
  const path = node("path"), base = path.resolve(root), file = path.resolve(base, objectPath(name));
  if (!file.startsWith(base + path.sep)) throw new Error("invalid file name");
  return file;
}

let gcs, blobService;
function bucket() {
  const name = process.env.SYMPOSIA_FILES_BUCKET;
  if (!name) throw new Error("file storage isn't available here yet (SYMPOSIA_FILES_BUCKET unset)");
  if (!gcs) {
    const { Storage } = appRequire("@google-cloud/storage");
    gcs = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT || undefined });
  }
  return gcs.bucket(name);
}

// This app's own Blob container, signed in as the app's managed identity.
function container() {
  const account = process.env.SYMPOSIA_FILES_ACCOUNT, name = process.env.SYMPOSIA_FILES_CONTAINER;
  if (!account || !name) throw new Error("file storage isn't available here yet (SYMPOSIA_FILES_ACCOUNT unset)");
  if (!blobService) {
    const { BlobServiceClient } = appRequire("@azure/storage-blob");
    const { ManagedIdentityCredential } = appRequire("@azure/identity");
    blobService = new BlobServiceClient(`https://${account}.blob.core.windows.net`,
      new ManagedIdentityCredential({ clientId: process.env.AZURE_CLIENT_ID || undefined }));
  }
  return blobService.getContainerClient(name);
}

// Stores bytes (a Buffer or Uint8Array) or a string under `name`. Returns the name you gave it.
export async function put(name, data, { contentType } = {}) {
  if (typeof data === "string") data = Buffer.from(data, "utf8");
  const local = localPath(name);
  if (local) {
    const fs = node("fs/promises");
    await fs.mkdir(node("path").dirname(local), { recursive: true });
    await fs.writeFile(local, data);
  } else if (BACKEND === "blob")
    await container().getBlockBlobClient(objectPath(name)).uploadData(data,
      contentType ? { blobHTTPHeaders: { blobContentType: contentType } } : {});
  else await bucket().file(objectPath(name)).save(data, { contentType, resumable: false });
  return name;
}

// Reads a file back as a Buffer.
export async function read(name) {
  const local = localPath(name);
  if (local) return node("fs/promises").readFile(local);
  if (BACKEND === "blob") return container().getBlockBlobClient(objectPath(name)).downloadToBuffer();
  const [data] = await bucket().file(objectPath(name)).download();
  return data;
}

// A temporary signed link the browser can load. Defaults to one hour; the storage is never public.
export async function url(name, ttlSeconds = 3600) {
  if (localPath(name)) return "/_symposia/files/" + encoded(objectPath(name));
  if (BACKEND === "blob") {
    // Signed with a user delegation key: it reaches only what the app itself may read, and expires.
    const { BlobSASPermissions, generateBlobSASQueryParameters } = appRequire("@azure/storage-blob");
    const target = container(), blobName = objectPath(name);
    const startsOn = new Date(Date.now() - 5 * 60 * 1000), expiresOn = new Date(Date.now() + ttlSeconds * 1000);
    const key = await blobService.getUserDelegationKey(startsOn, expiresOn);
    const sas = generateBlobSASQueryParameters({ containerName: target.containerName, blobName,
      permissions: BlobSASPermissions.parse("r"), startsOn, expiresOn }, key, blobService.accountName);
    return `${target.url}/${encoded(blobName)}?${sas}`;
  }
  const [link] = await bucket().file(objectPath(name)).getSignedUrl({ version: "v4", action: "read",
    expires: Date.now() + ttlSeconds * 1000 });
  return link;
}

// Removes a file. Quiet if it was never there.
export async function remove(name) {
  const local = localPath(name);
  if (local) return node("fs/promises").rm(local, { force: true });
  if (BACKEND === "blob") await container().getBlockBlobClient(objectPath(name)).deleteIfExists().catch(() => {});
  else await bucket().file(objectPath(name)).delete({ ignoreNotFound: true }).catch(() => {});
}
export { remove as delete };
