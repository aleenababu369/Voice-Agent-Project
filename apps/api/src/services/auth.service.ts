import type { Account, Domain } from "../../../../packages/contracts/src/index.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { getJwtSecret, signJwt, verifyJwt } from "../lib/jwt.ts";
import { getCollection, stripId } from "../db/mongo.ts";

const ACCOUNTS_COLLECTION = "accounts";
const DEMO_ACCOUNT_IDS = ["city-hospital", "greenfield-college", "northstar-frontdesk"];

interface StoredAccount extends Account {
  passwordHash: string;
  passwordSalt: string;
}

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function toPublic(account: StoredAccount): Account {
  const { passwordHash: _hash, passwordSalt: _salt, ...rest } = account;
  return rest;
}

const now = () => new Date().toISOString();

class AuthService {
  private readonly accounts = new Map<string, StoredAccount>();
  private readonly byEmail = new Map<string, string>();
  private readonly secret = getJwtSecret();

  constructor() {
    // Demo accounts reuse the seeded profile tenant ids so the existing seeded agents stay scoped.
    this.seedDemoAccount("city-hospital", "City Hospital", "hospital@demo.local", "healthcare");
    this.seedDemoAccount("greenfield-college", "Greenfield College", "college@demo.local", "education");
    this.seedDemoAccount("northstar-frontdesk", "Northstar Business Center", "frontdesk@demo.local", "frontdesk");
  }

  private seedDemoAccount(id: string, name: string, email: string, useCase: Domain) {
    const { hash, salt } = hashPassword("demo1234");
    const account: StoredAccount = { id, name, email, useCase, isDemo: true, createdAt: now(), passwordHash: hash, passwordSalt: salt };
    this.accounts.set(id, account);
    this.byEmail.set(email.toLowerCase(), id);
  }

  getDefaultAccountId() {
    return "city-hospital";
  }

  /** Load persisted accounts from Mongo (when configured) and ensure the demo accounts exist. Called once at startup. */
  async hydrate() {
    const collection = await getCollection(ACCOUNTS_COLLECTION);
    if (collection) {
      const docs = await collection.find({}).toArray();
      for (const doc of docs) {
        const account = stripId<StoredAccount>(doc as Record<string, unknown>);
        if (account) {
          this.accounts.set(account.id, account);
          this.byEmail.set(account.email.toLowerCase(), account.id);
        }
      }
      for (const id of DEMO_ACCOUNT_IDS) {
        const demo = this.accounts.get(id);
        if (demo) await this.persist(demo);
      }
    }
  }

  private async persist(account: StoredAccount) {
    const collection = await getCollection(ACCOUNTS_COLLECTION);
    if (collection) await collection.replaceOne({ _id: account.id }, { ...account }, { upsert: true });
  }

  listAccounts(): Account[] {
    return [...this.accounts.values()].map(toPublic);
  }

  async signup(input: { name: string; email: string; password: string; useCase?: Domain | null | undefined }) {
    const email = input.email.trim().toLowerCase();
    if (this.byEmail.has(email)) throw new AuthError("An account with this email already exists.", 409);
    const base = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "account";
    let id = base;
    let suffix = 2;
    while (this.accounts.has(id)) id = `${base}-${suffix++}`;
    const { hash, salt } = hashPassword(input.password);
    const account: StoredAccount = { id, name: input.name.trim(), email, useCase: input.useCase ?? null, createdAt: now(), passwordHash: hash, passwordSalt: salt };
    this.accounts.set(id, account);
    this.byEmail.set(email, id);
    await this.persist(account);
    return { account: toPublic(account), token: this.issueToken(account) };
  }

  login(input: { email: string; password: string }) {
    const id = this.byEmail.get(input.email.trim().toLowerCase());
    const account = id ? this.accounts.get(id) : undefined;
    if (!account || !verifyPassword(input.password, account.passwordHash, account.passwordSalt)) {
      throw new AuthError("Invalid email or password.", 401);
    }
    return { account: toPublic(account), token: this.issueToken(account) };
  }

  getAccount(id: string): Account {
    const account = this.accounts.get(id);
    if (!account) throw new AuthError(`Account not found: ${id}`, 404);
    return toPublic(account);
  }

  findAccount(id: string): Account | undefined {
    const account = this.accounts.get(id);
    return account ? toPublic(account) : undefined;
  }

  async setUseCase(id: string, useCase: Domain): Promise<Account> {
    const account = this.accounts.get(id);
    if (!account) throw new AuthError(`Account not found: ${id}`, 404);
    account.useCase = useCase;
    this.accounts.set(id, account);
    await this.persist(account);
    return toPublic(account);
  }

  verifyToken(token: string): { accountId: string } | null {
    const payload = verifyJwt(token, this.secret);
    if (!payload || typeof payload.sub !== "string") return null;
    if (!this.accounts.has(payload.sub)) return null;
    return { accountId: payload.sub };
  }

  private issueToken(account: StoredAccount) {
    return signJwt({ sub: account.id, email: account.email }, this.secret);
  }
}

export const authService = new AuthService();
