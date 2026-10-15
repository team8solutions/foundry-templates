import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  FormRequestError,
  formRedirectLocation,
  readFormRequest,
} from "@/lib/http";

export async function parseFormRequest(request: NextRequest) {
  try {
    return { ok: true as const, data: await readFormRequest(request) };
  } catch (error) {
    if (!(error instanceof FormRequestError)) throw error;
    return {
      ok: false as const,
      response: NextResponse.json({ error: error.message }, { status: error.status }),
    };
  }
}

export function formRedirect(
  pathname: string,
  message?: { error?: string; success?: string },
) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: formRedirectLocation(pathname, message) },
  });
}

export function privateJson(value: unknown, init?: ResponseInit) {
  const response = NextResponse.json(value, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
