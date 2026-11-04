// Types for #sandbox/db: the part of the Firestore Node.js client it offers on every backend.
export type DocumentData = { [field: string]: any };
export type WhereFilterOp = "<" | "<=" | "==" | "!=" | ">=" | ">" | "array-contains" | "in" | "not-in" | "array-contains-any";
export type OrderByDirection = "asc" | "desc";

/** A saved date, as Firestore returns it. */
export interface Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
  toDate(): Date;
  toMillis(): number;
  isEqual(other: Timestamp): boolean;
}
/** A FieldValue: only meaningful as a field's value in set(), update(), add() or create(). */
export interface FieldValueSentinel { readonly __fieldValue?: never }

export interface WriteResult { readonly writeTime: Timestamp }

export interface DocumentSnapshot<T = DocumentData> {
  readonly id: string;
  readonly ref: DocumentReference<T>;
  readonly exists: boolean;
  readonly createTime?: Timestamp;
  readonly updateTime?: Timestamp;
  /** The fields, or undefined when the document does not exist. */
  data(): T | undefined;
  /** One field ("name" or "address.city"), or undefined. */
  get(fieldPath: string): any;
}
export interface QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {
  readonly exists: true;
  data(): T;
}
export interface QuerySnapshot<T = DocumentData> {
  readonly docs: QueryDocumentSnapshot<T>[];
  readonly size: number;
  readonly empty: boolean;
  forEach(callback: (doc: QueryDocumentSnapshot<T>) => void): void;
}

export interface Query<T = DocumentData> {
  where(fieldPath: string, op: WhereFilterOp, value: unknown): Query<T>;
  orderBy(fieldPath: string, direction?: OrderByDirection): Query<T>;
  limit(count: number): Query<T>;
  limitToLast(count: number): Query<T>;
  offset(count: number): Query<T>;
  startAt(snapshot: DocumentSnapshot<any>): Query<T>;
  startAt(...fieldValues: unknown[]): Query<T>;
  startAfter(snapshot: DocumentSnapshot<any>): Query<T>;
  startAfter(...fieldValues: unknown[]): Query<T>;
  endAt(snapshot: DocumentSnapshot<any>): Query<T>;
  endAt(...fieldValues: unknown[]): Query<T>;
  endBefore(snapshot: DocumentSnapshot<any>): Query<T>;
  endBefore(...fieldValues: unknown[]): Query<T>;
  get(): Promise<QuerySnapshot<T>>;
  count(): { get(): Promise<{ data(): { count: number } }> };
}

export interface CollectionReference<T = DocumentData> extends Query<T> {
  readonly id: string;
  readonly path: string;
  readonly parent: DocumentReference | null;
  /** A document by id, or a new one with a generated id. */
  doc(id?: string): DocumentReference<T>;
  /** Creates a document with a generated id. */
  add(data: T): Promise<DocumentReference<T>>;
  listDocuments(): Promise<DocumentReference<T>[]>;
}

export interface DocumentReference<T = DocumentData> {
  readonly id: string;
  readonly path: string;
  readonly parent: CollectionReference<T>;
  collection(id: string): CollectionReference;
  isEqual(other: DocumentReference<any>): boolean;
  get(): Promise<DocumentSnapshot<T>>;
  set(data: T, options?: { merge?: boolean }): Promise<WriteResult>;
  /** Throws AlreadyExists when the document exists. */
  create(data: T): Promise<WriteResult>;
  /** Field paths to values; throws NotFound when the document does not exist. */
  update(data: { [fieldPath: string]: unknown }): Promise<WriteResult>;
  delete(): Promise<WriteResult>;
}

export interface Transaction {
  get<T>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>>;
  get<T>(query: Query<T>): Promise<QuerySnapshot<T>>;
  set<T>(ref: DocumentReference<T>, data: T, options?: { merge?: boolean }): Transaction;
  create<T>(ref: DocumentReference<T>, data: T): Transaction;
  update(ref: DocumentReference<any>, data: { [fieldPath: string]: unknown }): Transaction;
  delete(ref: DocumentReference<any>): Transaction;
}
export interface WriteBatch {
  set<T>(ref: DocumentReference<T>, data: T, options?: { merge?: boolean }): WriteBatch;
  create<T>(ref: DocumentReference<T>, data: T): WriteBatch;
  update(ref: DocumentReference<any>, data: { [fieldPath: string]: unknown }): WriteBatch;
  delete(ref: DocumentReference<any>): WriteBatch;
  commit(): Promise<WriteResult[]>;
}

export declare const FieldValue: {
  serverTimestamp(): FieldValueSentinel;
  delete(): FieldValueSentinel;
  increment(n: number): FieldValueSentinel;
  arrayUnion(...elements: unknown[]): FieldValueSentinel;
  arrayRemove(...elements: unknown[]): FieldValueSentinel;
};
/** `error instanceof AlreadyExists` after create() or add() of an existing document. */
export declare class AlreadyExists extends Error {}
/** `error instanceof NotFound` after update() of a missing document. */
export declare class NotFound extends Error {}

export declare const BACKEND: "firestore" | "postgres";
export declare function appSlug(): string;
export declare function env(): "dev" | "prod";
export declare function databaseId(): string;
/** A collection scoped to this app and environment ("dev" in Preview, "prod" when published). */
export declare function collection<T = DocumentData>(name: string): CollectionReference<T>;
export declare function document<T = DocumentData>(collectionName: string, id: string): DocumentReference<T>;
export declare function runTransaction<R>(fn: (transaction: Transaction) => Promise<R>): Promise<R>;
export declare function batch(): WriteBatch;
