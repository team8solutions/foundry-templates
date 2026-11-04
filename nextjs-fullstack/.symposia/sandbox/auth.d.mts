// Types for #sandbox/auth.
import type { DocumentSnapshot } from "./db.mjs";

/** A Response or NextResponse, a Node/Express response, or a cookie store such as Next.js cookies(). */
export type CookieTarget =
  | { headers: { append(name: string, value: string): void } }
  | { appendHeader(name: string, value: string): unknown }
  | { set(name: string, value: string, options: object): unknown };
/** A Request or NextRequest, a Node/Express request, or a cookie store such as Next.js cookies(). */
export type CookieSource =
  | { headers: { get(name: string): string | null } }
  | { headers: { cookie?: string } }
  | { get(name: string): { value: string } | undefined };
export interface SessionOptions { cookieName?: string; salt?: string; maxAge?: number }

export declare function sessionSecret(): Promise<string>;
export declare function sign(value: string, salt?: string): Promise<string>;
/** The signed value, or null when the token is invalid or older than maxAge seconds. */
export declare function unsign(token: string | null | undefined, salt?: string, maxAge?: number): Promise<string | null>;
export declare function setSession(response: CookieTarget, userId: string, options?: SessionOptions): Promise<void>;
/** The user's document in `users` (default "users"), or null. */
export declare function currentUser(request: CookieSource, options?: SessionOptions & { users?: string }): Promise<DocumentSnapshot | null>;
export declare function clearSession(response: CookieTarget, options?: { cookieName?: string }): void;
