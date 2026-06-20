import { MongoClient } from "mongodb";
import type { Collection, Db } from "mongodb";

// Documents are stored as the plain domain objects keyed by `id` as a string `_id`.
// The collection is intentionally typed loosely here (string _id, no-_id inserts) so the
// persistence layer can keep the real domain types at its own boundaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseCollection = Collection<any>;

let client: MongoClient | null = null;
let database: Db | null = null;
let unavailable = false;
let connecting: Promise<Db | null> | null = null;

/** Lazily connect to MongoDB. Returns null (and logs once) if MONGODB_URI is unset or the cluster is unreachable, so the app falls back to in-memory persistence. */
export async function getDb(): Promise<Db | null> {
  if (unavailable) return null;
  if (database) return database;
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (!connecting) {
    connecting = (async () => {
      try {
        const created = new MongoClient(uri, { serverSelectionTimeoutMS: 6000 });
        await created.connect();
        const db = created.db(process.env.MONGODB_DB || "voice_agent");
        await db.command({ ping: 1 });
        client = created;
        database = db;
        console.log(`[db] Connected to MongoDB (${db.databaseName}).`);
        return db;
      } catch (error) {
        unavailable = true;
        console.warn("[db] MongoDB unavailable, falling back to in-memory persistence.", error instanceof Error ? error.message : error);
        return null;
      }
    })();
  }
  return connecting;
}

export async function getCollection(name: string): Promise<LooseCollection | null> {
  const db = await getDb();
  return db ? (db.collection(name) as unknown as LooseCollection) : null;
}

export function isMongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    database = null;
  }
}

/** Strip Mongo's internal _id so stored documents round-trip as plain domain objects. */
export function stripId<T>(doc: Record<string, unknown> | null | undefined): T | undefined {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return rest as T;
}
