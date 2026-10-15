export const MAX_FORM_BYTES = 16 * 1024;

export class FormRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.host === host;
  } catch {
    return false;
  }
}

export function isFormContentType(request: Request) {
  const type = request.headers.get("content-type")?.toLowerCase() || "";
  return type.startsWith("application/x-www-form-urlencoded");
}

export async function readFormRequest(request: Request, maxBytes = MAX_FORM_BYTES) {
  if (!isSameOrigin(request)) throw new FormRequestError("Invalid request origin", 403);
  if (!isFormContentType(request))
    throw new FormRequestError("Expected URL-encoded form data", 415);

  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FormRequestError("Form data is too large", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return Object.fromEntries(new URLSearchParams(new TextDecoder().decode(bytes)));
}

export function formRedirectLocation(
  pathname: string,
  message?: { error?: string; success?: string },
) {
  if (!pathname.startsWith("/") || pathname.startsWith("//"))
    throw new Error("Redirect path must be application-relative");
  const query = new URLSearchParams();
  if (message?.error) query.set("error", message.error);
  if (message?.success) query.set("success", message.success);
  if (!query.size) return pathname;
  return `${pathname}${pathname.includes("?") ? "&" : "?"}${query}`;
}

export function safeMessage(value: string | null) {
  return value?.slice(0, 160) || "";
}
