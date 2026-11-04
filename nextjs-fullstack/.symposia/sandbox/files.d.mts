// Types for #sandbox/files.
export declare const BACKEND: "gcs" | "blob";
export declare function env(): "dev" | "prod";
export declare function appSlug(): string;
/** apps/<app>/<env>/<name>; throws on an empty name or a ".." part. */
export declare function objectPath(name: string): string;
/** Stores bytes or text under `name` and returns the name. */
export declare function put(name: string, data: Uint8Array | string, options?: { contentType?: string }): Promise<string>;
export declare function read(name: string): Promise<Buffer>;
/** A temporary signed link the browser can load (default one hour). */
export declare function url(name: string, ttlSeconds?: number): Promise<string>;
/** Removes a file; quiet if it was never there. Also exported as `delete`. */
export declare function remove(name: string): Promise<void>;
export { remove as delete };
