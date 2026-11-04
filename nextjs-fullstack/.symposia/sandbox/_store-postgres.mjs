// Saved data in Postgres, for #sandbox/db where Firestore is not available (Azure, previews): the
// Node twin of _store_postgres.py. It reads and writes the same table in the same format, so the two
// share data.
//
// It offers the part of the Firestore Node.js client that apps use, with the same names and shapes:
// collections and documents (also nested), get/set/create/update/delete, add, where/orderBy/limit/
// offset and cursors, get/count, runTransaction and batch, and FieldValue's serverTimestamp, delete,
// increment, arrayUnion and arrayRemove. Anything else throws NotSupported, with what to use instead.
//
// Each document is a row of one table, keyed by its collection path and id, its fields as JSON. Dates,
// bytes and document references are stored as one-key objects ({"$date": ...}) that sort correctly.
import { appRequire, node } from "./_server.mjs";

export const TABLE = "symposia_documents";
const OPERATORS = new Set(["==", "!=", "<", "<=", ">", ">=", "in", "not-in", "array-contains", "array-contains-any"]);
const DIRECTIONS = new Set(["asc", "desc"]);

// The errors match Firestore's by their gRPC code, so `instanceof AlreadyExists` works on both backends.
export class AlreadyExists extends Error {
  static [Symbol.hasInstance](error) { return error?.code === 6; }
  constructor(message) { super(message); this.name = "AlreadyExists"; this.code = 6; }
}
export class NotFound extends Error {
  static [Symbol.hasInstance](error) { return error?.code === 5; }
  constructor(message) { super(message); this.name = "NotFound"; this.code = 5; }
}
export class NotSupported extends Error {
  constructor(message) { super(message); this.name = "NotSupported"; }
}

class Sentinel {
  constructor(kind, value) { this.kind = kind; this.value = value; }
}
const SERVER_TIMESTAMP = new Sentinel("serverTimestamp"), DELETE_FIELD = new Sentinel("delete");
export const FieldValue = {
  serverTimestamp: () => SERVER_TIMESTAMP,
  delete: () => DELETE_FIELD,
  increment: (n) => new Sentinel("increment", n),
  arrayUnion: (...values) => new Sentinel("arrayUnion", values),
  arrayRemove: (...values) => new Sentinel("arrayRemove", values),
};

// Like Firestore's Timestamp, which is what Firestore returns for dates.
export class Timestamp {
  constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromDate(date) { return Timestamp.fromMillis(date.getTime()); }
  static fromMillis(ms) {
    const seconds = Math.floor(ms / 1000);
    return new Timestamp(seconds, Math.round((ms - seconds * 1000) * 1e6));
  }
  toDate() { return new Date(this.toMillis()); }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  isEqual(other) { return other instanceof Timestamp && other.seconds === this.seconds && other.nanoseconds === this.nanoseconds; }
  valueOf() { return String(this.seconds + 62135596800).padStart(12, "0") + "." + String(this.nanoseconds).padStart(9, "0"); }
  toJSON() { return { seconds: this.seconds, nanoseconds: this.nanoseconds }; }
}

// ── Values ─────────────────────────────────────────────────────────────────────────────────────────
const isMap = (v) => v !== null && typeof v === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(v));
// Field names come from app data: "__proto__" must stay a field, never become the object's prototype.
const put = (target, key, value) =>
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });

// The same text as Python's strftime("%Y-%m-%dT%H:%M:%S.%fZ"): microseconds, so stored dates sort.
function dateText(stamp) {
  const micros = String(Math.floor(stamp.nanoseconds / 1000)).padStart(6, "0");
  return new Date(stamp.seconds * 1000).toISOString().slice(0, 19) + "." + micros + "Z";
}

function encode(value, now) {
  if (value === SERVER_TIMESTAMP) value = now;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new NotSupported("an invalid Date cannot be saved");
    value = Timestamp.fromDate(value);
  }
  if (value instanceof Timestamp) return { $date: dateText(value) };
  if (value instanceof Uint8Array) return { $bytes: Buffer.from(value).toString("base64") };
  if (value instanceof DocumentReference) return { $ref: value.path };
  if (Array.isArray(value)) return value.map((v) => encode(v, now));
  if (isMap(value))
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== DELETE_FIELD).map(([k, v]) => [k, encode(v, now)]));
  if (value instanceof Sentinel) throw new NotSupported(`FieldValue.${value.kind}() can only be a field's value in set() or update()`);
  if (value === undefined) throw new NotSupported('"undefined" cannot be saved; leave the field out or use null');
  if (typeof value === "number" && !Number.isFinite(value)) throw new NotSupported(`${value} cannot be saved`);
  if (value === null || ["boolean", "number", "string"].includes(typeof value)) return value;
  throw new NotSupported("this value cannot be saved; use strings, numbers, booleans, null, Dates, Buffers, " +
    "arrays or plain objects");
}

function decode(value, client) {
  if (Array.isArray(value)) return value.map((v) => decode(v, client));
  if (!isMap(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1) {
    const inner = value[keys[0]];
    if (keys[0] === "$date") {
      const [, base, fraction = ""] = /^(.*?)(?:\.(\d+))?Z$/.exec(inner);
      return new Timestamp(Date.parse(base + "Z") / 1000, Number((fraction + "000000000").slice(0, 9)));
    }
    if (keys[0] === "$bytes") return Buffer.from(inner, "base64");
    if (keys[0] === "$ref") return client.doc(inner);
  }
  const out = {};
  for (const key of keys) put(out, key, decode(value[key], client));
  return out;
}

// Equality of saved values (for arrayUnion and arrayRemove), whatever order a map's keys are in.
function same(a, b) {
  const text = (v) => JSON.stringify(v, (_, x) => (isMap(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
  return text(encode(a, null)) === text(encode(b, null));
}

function split(fieldPath) {
  if (!fieldPath || typeof fieldPath !== "string")
    throw new TypeError("a field path is a non-empty string such as 'name' or 'address.city'");
  return fieldPath.split(".");
}

// Writes one value (or FieldValue) at a field path into a decoded document.
function apply(data, path, value, now) {
  let node = data;
  for (const key of path.slice(0, -1)) {
    if (!isMap(node[key])) {
      if (value === DELETE_FIELD) return;
      put(node, key, {});
    }
    node = node[key];
  }
  const last = path.at(-1), current = Object.hasOwn(node, last) ? node[last] : undefined;
  if (value === DELETE_FIELD) delete node[last];
  else if (value instanceof Sentinel && value.kind === "increment")
    put(node, last, (typeof current === "number" ? current : 0) + value.value);
  else if (value instanceof Sentinel && value.kind === "arrayUnion") {
    const list = Array.isArray(current) ? current : [];
    put(node, last, [...list, ...value.value.filter((v) => !list.some((c) => same(c, v)))]);
  } else if (value instanceof Sentinel && value.kind === "arrayRemove")
    put(node, last, (Array.isArray(current) ? current : []).filter((c) => !value.value.some((v) => same(c, v))));
  else if (value === SERVER_TIMESTAMP) put(node, last, now);
  else if (isMap(value)) put(node, last, resolve(value, now));
  else put(node, last, value);
}

// A new map with its serverTimestamp values filled in and delete() fields dropped.
function resolve(value, now) {
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    if (inner instanceof Sentinel && ["increment", "arrayUnion", "arrayRemove"].includes(inner.kind)) apply(out, [key], inner, now);
    else if (isMap(inner)) put(out, key, resolve(inner, now));
    else if (inner !== DELETE_FIELD) put(out, key, inner === SERVER_TIMESTAMP ? now : inner);
  }
  return out;
}

function merge(target, source, now) {
  for (const [key, value] of Object.entries(source)) {
    if (isMap(value) && isMap(target[key])) merge(target[key], value, now);
    else apply(target, [key], value, now);
  }
}

function fields(data) {
  if (!isMap(data)) throw new TypeError("document data is a plain object of fields");
  return data;
}

function autoId() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 20 }, () => letters[node("crypto").randomInt(letters.length)]).join("");
}

const stamp = (date) => (date ? Timestamp.fromDate(date) : undefined);

// ── Snapshots and references ───────────────────────────────────────────────────────────────────────
class WriteResult {
  constructor(writeTime) { this.writeTime = writeTime; }
}

class DocumentSnapshot {
  constructor(ref, data, createTime, updateTime) {
    this.ref = ref; this._data = data; this.createTime = createTime; this.updateTime = updateTime;
  }
  get id() { return this.ref.id; }
  get exists() { return this._data != null; }
  data() { return this._data == null ? undefined : decode(this._data, this.ref._client); }
  get(fieldPath) {
    let node = this.data();
    for (const key of split(fieldPath)) {
      if (!isMap(node) || !Object.hasOwn(node, key)) return undefined;
      node = node[key];
    }
    return node;
  }
}

class QuerySnapshot {
  constructor(docs) { this.docs = docs; }
  get size() { return this.docs.length; }
  get empty() { return this.docs.length === 0; }
  forEach(callback, thisArg) { this.docs.forEach(callback, thisArg); }
}

export class DocumentReference {
  constructor(client, parent, id) {
    if (!id || typeof id !== "string" || id.includes("/")) throw new TypeError("a document id is a non-empty name without '/'");
    this._client = client; this._parent = parent; this.id = id;
  }
  get path() { return `${this._parent}/${this.id}`; }
  get parent() { return new CollectionReference(this._client, this._parent); }
  collection(id) { return new CollectionReference(this._client, `${this.path}/${id}`); }
  isEqual(other) { return other instanceof DocumentReference && other.path === this.path; }
  get() { return this._client._atomic((db) => db.read(this)); }
  set(data, options) { return this._client._atomic((db) => db.set(this, data, !!options?.merge)); }
  create(data) { return this._client._atomic((db) => db.create(this, data)); }
  update(data) { return this._client._atomic((db) => db.update(this, data)); }
  delete() { return this._client._atomic((db) => db.delete(this)); }
}

class Query {
  constructor(client, parent, state = {}) {
    this._client = client; this._parent = parent;
    this._state = { filters: [], orders: [], limit: null, offset: null, start: null, end: null, last: false, ...state };
  }
  _with(changes) { return new Query(this._client, this._parent, { ...this._state, ...changes }); }
  where(fieldPath, op, value) {
    if (typeof fieldPath !== "string") throw new NotSupported("Filter.or/Filter.and are not supported here: run one query per condition");
    if (!OPERATORS.has(op)) throw new NotSupported(`the '${op}' operator is not supported; use one of ${[...OPERATORS].join(", ")}`);
    split(fieldPath);
    return this._with({ filters: [...this._state.filters, [fieldPath, op, value]] });
  }
  orderBy(fieldPath, direction = "asc") {
    if (!DIRECTIONS.has(direction)) throw new TypeError("direction is 'asc' or 'desc'");
    split(fieldPath);
    return this._with({ orders: [...this._state.orders, [fieldPath, direction]] });
  }
  limit(count) { return this._with({ limit: Math.trunc(count), last: false }); }
  limitToLast(count) {
    if (!this._state.orders.length) throw new TypeError("limitToLast needs an orderBy");
    return this._with({ limit: Math.trunc(count), last: true });
  }
  offset(count) { return this._with({ offset: Math.trunc(count) }); }
  _cursor(values, exclusive, kind) {
    if (values.length === 1 && values[0] instanceof DocumentSnapshot) {
      const snapshot = values[0];
      values = [...this._state.orders.map(([field]) => snapshot.get(field)), snapshot.id];
    }
    return { [kind]: [values, exclusive, kind] };
  }
  startAt(...values) { return this._with(this._cursor(values, false, "start")); }
  startAfter(...values) { return this._with(this._cursor(values, true, "start")); }
  endAt(...values) { return this._with(this._cursor(values, false, "end")); }
  endBefore(...values) { return this._with(this._cursor(values, true, "end")); }
  get() { return this._client._atomic((db) => db.query(this)).then((docs) => new QuerySnapshot(docs)); }
  count() {
    return { get: async () => { const { size } = await this.get(); return { data: () => ({ count: size }) }; } };
  }
}

class CollectionReference extends Query {
  constructor(client, path) {
    if (!path || typeof path !== "string" || path.startsWith("/") || path.endsWith("/") || path.split("/").length % 2 === 0)
      throw new TypeError("a collection path has an odd number of parts, such as 'notes' or 'users/u1/notes'");
    super(client, path);
  }
  get id() { return this._parent.split("/").at(-1); }
  get path() { return this._parent; }
  get parent() {
    const at = this._parent.lastIndexOf("/");
    return at < 0 ? null : this._client.doc(this._parent.slice(0, at));
  }
  doc(id) { return new DocumentReference(this._client, this._parent, id ?? autoId()); }
  async add(data) {
    const ref = this.doc();
    await ref.create(data);
    return ref;
  }
  async listDocuments() { return (await this.get()).docs.map((snapshot) => snapshot.ref); }
}

// ── The database ───────────────────────────────────────────────────────────────────────────────────
// One connection's work, inside a database transaction.
class Session {
  constructor(client, connection) { this.client = client; this.connection = connection; }

  async _row(ref, lock) {
    const { rows } = await this.connection.query(
      `SELECT data, create_time, update_time FROM ${TABLE} WHERE parent = $1 AND id = $2${lock ? " FOR UPDATE" : ""}`,
      [ref._parent, ref.id]);
    return rows[0];
  }

  async read(ref, lock = false) {
    const row = await this._row(ref, lock);
    return new DocumentSnapshot(ref, row ? row.data : null, stamp(row?.create_time), stamp(row?.update_time));
  }

  async _write(ref, data, now) {
    const at = dateText(now);
    await this.connection.query(
      `INSERT INTO ${TABLE} (parent, id, data, create_time, update_time) VALUES ($1, $2, $3, $4, $4) ` +
      "ON CONFLICT (parent, id) DO UPDATE SET data = EXCLUDED.data, update_time = EXCLUDED.update_time",
      [ref._parent, ref.id, JSON.stringify(encode(data, now)), at]);
    return new WriteResult(now);
  }

  async set(ref, data, mergeFields = false) {
    const now = Timestamp.now();
    if (!mergeFields) return this._write(ref, resolve(fields(data), now), now);
    const row = await this._row(ref, true);
    const current = row ? decode(row.data, this.client) : {};
    merge(current, fields(data), now);
    return this._write(ref, current, now);
  }

  async create(ref, data) {
    const now = Timestamp.now(), at = dateText(now);
    const { rows } = await this.connection.query(
      `INSERT INTO ${TABLE} (parent, id, data, create_time, update_time) VALUES ($1, $2, $3, $4, $4) ` +
      "ON CONFLICT (parent, id) DO NOTHING RETURNING id",
      [ref._parent, ref.id, JSON.stringify(encode(resolve(fields(data), now), now)), at]);
    if (!rows.length) throw new AlreadyExists(`Document already exists: ${ref.path}`);
    return new WriteResult(now);
  }

  async update(ref, updates) {
    const now = Timestamp.now();
    const row = await this._row(ref, true);
    if (!row) throw new NotFound(`No document to update: ${ref.path}`);
    const current = decode(row.data, this.client);
    for (const [fieldPath, value] of Object.entries(fields(updates))) apply(current, split(fieldPath), value, now);
    return this._write(ref, current, now);
  }

  async delete(ref) {
    await this.connection.query(`DELETE FROM ${TABLE} WHERE parent = $1 AND id = $2`, [ref._parent, ref.id]);
    return new WriteResult(Timestamp.now());
  }

  async query(query, lock = false) {
    const params = [], p = (value) => (params.push(value), `$${params.length}`);
    const json = (value) => p(JSON.stringify(encode(value, null))) + "::jsonb";
    const list = (op, value) => {
      if (!Array.isArray(value)) throw new TypeError(`'${op}' needs an array of values`);
      return p(JSON.stringify(value.map((v) => encode(v, null)))) + "::jsonb";
    };
    const { filters, orders, start, end, last, limit, offset } = query._state;
    const where = [`parent = ${p(query._parent)}`];
    for (const [fieldPath, op, value] of filters) {
      const f = `(data #> ${p(split(fieldPath))}::text[])`;
      if (op === "==") where.push(`${f} = ${json(value)}`);
      else if (op === "!=") where.push(`${f} IS NOT NULL AND ${f} <> ${json(value)}`);
      else if (["<", "<=", ">", ">="].includes(op)) {
        // As in Firestore, a range only matches values of the same type.
        const v = json(value);
        where.push(`jsonb_typeof(${f}) = jsonb_typeof(${v}) AND ${f} ${op} ${v}`);
      } else if (op === "in") where.push(`${f} IN (SELECT jsonb_array_elements(${list(op, value)}))`);
      else if (op === "not-in") where.push(`${f} IS NOT NULL AND ${f} NOT IN (SELECT jsonb_array_elements(${list(op, value)}))`);
      else if (op === "array-contains") where.push(`jsonb_typeof(${f}) = 'array' AND ${f} @> jsonb_build_array(${json(value)})`);
      else where.push(`jsonb_typeof(${f}) = 'array' AND EXISTS ` +
        `(SELECT 1 FROM jsonb_array_elements(${list(op, value)}) v WHERE ${f} @> jsonb_build_array(v))`);
    }
    // As in Firestore, ordering by a field leaves out documents without it.
    const columns = orders.map(([fieldPath]) => `(data #> ${p(split(fieldPath))}::text[])`);
    for (const column of columns) where.push(`${column} IS NOT NULL`);
    for (const cursor of [start, end]) {
      if (!cursor) continue;
      const [values, exclusive, kind] = cursor;
      if (new Set(orders.map(([, d]) => d)).size > 1) throw new NotSupported("cursors need every orderBy in the same direction");
      const descending = orders.length > 0 && orders[0][1] === "desc";
      const compared = columns.slice(0, values.length);
      const encoded = values.slice(0, compared.length).map(json);
      if (values.length > compared.length) { // a snapshot cursor also compares the document id
        compared.push("to_jsonb(id)");
        encoded.push(p(JSON.stringify(values.at(-1))) + "::jsonb");
      }
      const after = (kind === "start") !== descending;
      const op = after ? (exclusive ? ">" : ">=") : (exclusive ? "<" : "<=");
      where.push(`(${compared.join(", ")}) ${op} (${encoded.join(", ")})`);
    }
    const order = columns.map((c, i) => `${c} ${(orders[i][1] === "desc") !== last ? "DESC" : "ASC"}`);
    order.push(`id ${last ? "DESC" : "ASC"}`);
    let sql = `SELECT id, data, create_time, update_time FROM ${TABLE} WHERE ${where.join(" AND ")} ORDER BY ${order.join(", ")}`;
    if (limit != null) sql += ` LIMIT ${p(limit)}`;
    if (offset) sql += ` OFFSET ${p(offset)}`;
    if (lock) sql += " FOR UPDATE";
    const { rows } = await this.connection.query(sql, params);
    if (last) rows.reverse();
    return rows.map((r) => new DocumentSnapshot(new DocumentReference(this.client, query._parent, r.id), r.data,
      stamp(r.create_time), stamp(r.update_time)));
  }
}

// Reads lock what they read; writes apply when the transaction commits, all or nothing.
class Transaction {
  constructor(session) { this._session = session; this._writes = []; }
  get(target) {
    if (target instanceof DocumentReference) return this._session.read(target, true);
    if (target instanceof Query) return this._session.query(target, true).then((docs) => new QuerySnapshot(docs));
    throw new TypeError("transaction.get takes a document reference or a query");
  }
  set(ref, data, options) { this._writes.push((db) => db.set(ref, data, !!options?.merge)); return this; }
  create(ref, data) { this._writes.push((db) => db.create(ref, data)); return this; }
  update(ref, data) { this._writes.push((db) => db.update(ref, data)); return this; }
  delete(ref) { this._writes.push((db) => db.delete(ref)); return this; }
}

class WriteBatch extends Transaction {
  constructor(client) { super(null); this._client = client; }
  commit() {
    const writes = this._writes;
    this._writes = [];
    return this._client._atomic(async (db) => {
      const results = [];
      for (const write of writes) results.push(await write(db));
      return results;
    });
  }
}

// A small connection pool per app instance (a few connections, closed when idle): many apps share one
// database server, whose connections are limited.
export class Client {
  constructor(url) { this._url = url; this._pool = null; }

  _connections() {
    this._pool ??= (async () => {
      const { Pool } = appRequire("pg");
      const pool = new Pool({ connectionString: this._url, max: 4, idleTimeoutMillis: 60000 });
      // A dropped idle connection is replaced on next use; without a listener it would stop the app.
      pool.on("error", (error) => console.error("app database connection lost:", error.message));
      await pool.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (parent text NOT NULL, id text NOT NULL, ` +
        "data jsonb NOT NULL, create_time timestamptz NOT NULL, update_time timestamptz NOT NULL, PRIMARY KEY (parent, id))");
      return pool;
    })().catch((error) => {
      this._pool = null;
      throw error;
    });
    return this._pool;
  }

  async _atomic(work) {
    const connection = await (await this._connections()).connect();
    let broken = false;
    try {
      await connection.query("BEGIN");
      const result = await work(new Session(this, connection));
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => { broken = true; });
      throw error;
    } finally {
      connection.release(broken);
    }
  }

  collection(path) { return new CollectionReference(this, path); }
  doc(path) {
    const at = String(path).lastIndexOf("/");
    return new DocumentReference(this, path.slice(0, at), path.slice(at + 1));
  }
  batch() { return new WriteBatch(this); }

  // Like Firestore's runTransaction: runs fn(transaction) in one database transaction, retrying when
  // another transaction got in the way.
  async runTransaction(fn) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this._atomic(async (db) => {
          const transaction = new Transaction(db);
          const result = await fn(transaction);
          for (const write of transaction._writes) await write(db);
          return result;
        });
      } catch (error) {
        // 40001 serialization failure, 40P01 deadlock
        if (attempt >= 5 || !["40001", "40P01"].includes(error?.code)) throw error;
      }
    }
  }

  collectionGroup() { throw new NotSupported("collectionGroup queries are not supported; query each collection"); }

  async close() {
    const pool = await this._pool?.catch(() => null);
    this._pool = null;
    await pool?.end();
  }
}

export function client() {
  const url = process.env.SYMPOSIA_DATABASE_URL;
  if (!url) throw new Error("this app's database is not configured (SYMPOSIA_DATABASE_URL unset)");
  return new Client(url);
}
