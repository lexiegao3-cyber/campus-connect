import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * In-process stand-in for Cloudflare D1 backed by better-sqlite3, so the
 * Worker's real SQL (including the migration file) runs in plain Node tests.
 * Implements the subset of the D1 API the app uses: prepare/bind/first/all/
 * run and transactional batch().
 */

type Row = Record<string, unknown>;

// D1 binds positional args to ?1..?N; better-sqlite3 wants an object for numbered params.
const toNamed = (args: unknown[]) => Object.fromEntries(args.map((v, i) => [i + 1, v === undefined ? null : v]));

class Statement {
  constructor(
    private readonly db: Database.Database,
    readonly sql: string,
    private readonly args: unknown[] = [],
  ) {}

  bind(...args: unknown[]) {
    return new Statement(this.db, this.sql, args);
  }

  private stmt() {
    return this.db.prepare(this.sql);
  }

  private params() {
    return this.args.length ? [toNamed(this.args)] : [];
  }

  exec(): { results: Row[]; changes: number } {
    const s = this.stmt();
    if (s.reader) return { results: s.all(...this.params()) as Row[], changes: 0 };
    const info = s.run(...this.params());
    return { results: [], changes: info.changes };
  }

  async first<T = Row>(col?: string): Promise<T | null> {
    const row = this.exec().results[0];
    if (!row) return null;
    return (col ? row[col] : row) as T;
  }

  async all<T = Row>() {
    const { results, changes } = this.exec();
    return { results: results as T[], success: true, meta: { changes } };
  }

  async run() {
    const { results, changes } = this.exec();
    return { results, success: true, meta: { changes } };
  }
}

export function createD1(): D1Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync(fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url).href), "utf8"));
  const shim = {
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (stmts: Statement[]) =>
      db.transaction(() => stmts.map((s) => ({ ...s.exec(), success: true })))(),
    exec: async (sql: string) => {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
    raw: db,
  };
  return shim as unknown as D1Database;
}
