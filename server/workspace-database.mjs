import { isDeepStrictEqual } from "node:util";

// This is CodexLAN state, not a second Codex transcript store. Small entity
// payloads retain optional-field semantics; large execution supplements are
// addressed individually and never serialized as a thread/collection blob.
export const WORKSPACE_SCHEMA_VERSION = 14;
const schema = `
  CREATE TABLE users (id TEXT PRIMARY KEY, position INTEGER NOT NULL, value TEXT NOT NULL);
  CREATE TABLE projects (id TEXT PRIMARY KEY, owner_id TEXT, position INTEGER NOT NULL, value TEXT NOT NULL);
  CREATE INDEX projects_owner ON projects(owner_id, position);
  CREATE TABLE thread_bindings (thread_id TEXT PRIMARY KEY, project_id TEXT NOT NULL);
  CREATE INDEX bindings_project ON thread_bindings(project_id);
  CREATE TABLE thread_settings (thread_id TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE queue_state (thread_id TEXT PRIMARY KEY, revision INTEGER, has_queue INTEGER NOT NULL);
  CREATE TABLE queue_items (thread_id TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(thread_id, id));
  CREATE INDEX queue_order ON queue_items(thread_id, position);
  CREATE TABLE thread_access (owner_id TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE auth_sessions (token_hash TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE async_input_answers (thread_id TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE execution_supplements (
    thread_id TEXT NOT NULL, turn_id TEXT NOT NULL, item_id TEXT NOT NULL,
    value TEXT NOT NULL, PRIMARY KEY(thread_id, turn_id, item_id)
  );
`;

const collections = {
  users: ["users", "id"], projects: ["projects", "id"],
  threadProjects: ["thread_bindings", "thread_id"], threadSettings: ["thread_settings", "thread_id"],
  queues: ["queue_state", "thread_id"], queueRevisions: ["queue_state", "thread_id"],
  threadAccesses: ["thread_access", "owner_id"], sessions: ["auth_sessions", "token_hash"],
  asyncInputAnswers: ["async_input_answers", "thread_id"],
};

export class WorkspaceDatabase {
  constructor(database, sqliteFile) {
    this.database = database;
    this.sqliteFile = sqliteFile;
    this.statements = new Map();
  }

  statement(sql) {
    if (!this.statements.has(sql)) this.statements.set(sql, this.database.prepare(sql));
    return this.statements.get(sql);
  }

  get version() {
    return this.database.prepare("PRAGMA user_version").get().user_version;
  }

  migrate(state) {
    if (this.version === WORKSPACE_SCHEMA_VERSION) return;
    if (this.version !== 0) throw new Error(`Unsupported SQLite schema version: ${this.version}.`);
    const legacy = this.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='state'").get();
    if (legacy && this.database.prepare("SELECT 1 FROM state LIMIT 1").get()) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      this.backupFile = `${this.sqliteFile}.pre-v14-${stamp}`;
      // SQLite makes a consistent snapshot, including committed WAL contents.
      this.database.prepare("VACUUM INTO ?").run(this.backupFile);
    }
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.exec(schema);
      this.write(state, null, { transaction: false });
      if (!isDeepStrictEqual(this.read(), state)) throw new Error("SQLite migration changed workspace fields or relationships.");
      this.database.exec("DROP TABLE IF EXISTS turn_metrics; DROP TABLE IF EXISTS state;");
      this.database.exec(`PRAGMA user_version=${WORKSPACE_SCHEMA_VERSION}; COMMIT`);
    } catch (error) {
      this.database.exec("ROLLBACK");
      this.statements.clear();
      throw error;
    }
  }

  read() {
    const state = { version: 13, users: [], projects: [], threadProjects: {}, threadSettings: {},
      queues: {}, queueRevisions: {}, threadAccesses: {}, sessions: {}, asyncInputAnswers: {}, turnMetrics: {} };
    for (const name of ["users", "projects"]) {
      state[name] = this.database.prepare(`SELECT value FROM ${name} ORDER BY position`).all().map((row) => JSON.parse(row.value));
    }
    for (const row of this.database.prepare("SELECT * FROM thread_bindings").all()) state.threadProjects[row.thread_id] = row.project_id;
    for (const [name, table, key] of [
      ["threadSettings", "thread_settings", "thread_id"], ["threadAccesses", "thread_access", "owner_id"],
      ["sessions", "auth_sessions", "token_hash"], ["asyncInputAnswers", "async_input_answers", "thread_id"],
    ]) {
      for (const row of this.database.prepare(`SELECT * FROM ${table}`).all()) state[name][row[key]] = JSON.parse(row.value);
    }
    for (const row of this.database.prepare("SELECT * FROM queue_state").all()) {
      if (row.revision !== null) state.queueRevisions[row.thread_id] = row.revision;
      if (row.has_queue) state.queues[row.thread_id] = [];
    }
    for (const row of this.database.prepare("SELECT thread_id, value FROM queue_items ORDER BY thread_id, position").all()) {
      (state.queues[row.thread_id] ||= []).push(JSON.parse(row.value));
    }
    for (const row of this.database.prepare("SELECT * FROM execution_supplements ORDER BY rowid").all()) {
      const turns = state.turnMetrics[row.thread_id] ||= {};
      const turn = turns[row.turn_id] ||= { items: {} };
      if (row.item_id === "") Object.assign(turn, JSON.parse(row.value));
      else turn.items[row.item_id] = JSON.parse(row.value);
    }
    return state;
  }

  allChanges(state) {
    const changes = {};
    for (const [name, [table, key]] of Object.entries(collections)) {
      const ids = Array.isArray(state[name]) ? state[name].map((record) => record.id) : Object.keys(state[name]);
      changes[name] = new Set([...ids, ...this.statement(`SELECT ${key} FROM ${table}`).all().map((row) => row[key])]);
    }
    changes.turnMetrics = new Set(Object.keys(state.turnMetrics));
    for (const row of this.statement("SELECT DISTINCT thread_id FROM execution_supplements").all()) changes.turnMetrics.add(row.thread_id);
    return changes;
  }

  write(state, changes, { transaction = true } = {}) {
    const db = this.database;
    changes ||= this.allChanges(state);
    if (transaction) db.exec("BEGIN IMMEDIATE");
    try {
      for (const name of ["users", "projects"]) {
        for (const id of changes[name] || []) {
          const position = state[name].findIndex((record) => record.id === id);
          if (position < 0) this.statement(`DELETE FROM ${name} WHERE id=?`).run(id);
          else if (name === "projects") this.statement("INSERT INTO projects VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id, position=excluded.position, value=excluded.value")
            .run(id, state[name][position].ownerId ?? null, position, JSON.stringify(state[name][position]));
          else this.statement("INSERT INTO users VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET position=excluded.position, value=excluded.value")
            .run(id, position, JSON.stringify(state[name][position]));
        }
      }
      for (const id of changes.threadProjects || []) {
        if (Object.hasOwn(state.threadProjects, id)) this.statement("INSERT INTO thread_bindings VALUES (?, ?) ON CONFLICT(thread_id) DO UPDATE SET project_id=excluded.project_id").run(id, state.threadProjects[id]);
        else this.statement("DELETE FROM thread_bindings WHERE thread_id=?").run(id);
      }
      for (const name of ["threadSettings", "threadAccesses", "sessions", "asyncInputAnswers"]) {
        const [table, key] = collections[name];
        for (const id of changes[name] || []) {
          if (Object.hasOwn(state[name], id)) this.statement(`INSERT INTO ${table} VALUES (?, ?) ON CONFLICT(${key}) DO UPDATE SET value=excluded.value`).run(id, JSON.stringify(state[name][id]));
          else this.statement(`DELETE FROM ${table} WHERE ${key}=?`).run(id);
        }
      }
      const queueIds = new Set([...(changes.queues || []), ...(changes.queueRevisions || [])]);
      for (const id of queueIds) {
        const hasQueue = Object.hasOwn(state.queues, id);
        if (hasQueue || Object.hasOwn(state.queueRevisions, id)) this.statement("INSERT INTO queue_state VALUES (?, ?, ?) ON CONFLICT(thread_id) DO UPDATE SET revision=excluded.revision, has_queue=excluded.has_queue")
          .run(id, state.queueRevisions[id] ?? null, Number(hasQueue));
        else this.statement("DELETE FROM queue_state WHERE thread_id=?").run(id);
        if (!changes.queues?.has(id)) continue;
        const remaining = new Set(this.statement("SELECT id FROM queue_items WHERE thread_id=?").all(id).map((row) => row.id));
        for (const [position, item] of (state.queues[id] || []).entries()) {
          remaining.delete(item.id);
          this.statement("INSERT INTO queue_items VALUES (?, ?, ?, ?) ON CONFLICT(thread_id, id) DO UPDATE SET position=excluded.position, value=excluded.value WHERE position IS NOT excluded.position OR value IS NOT excluded.value")
            .run(id, item.id, position, JSON.stringify(item));
        }
        for (const itemId of remaining) this.statement("DELETE FROM queue_items WHERE thread_id=? AND id=?").run(id, itemId);
      }
      // Full thread replacement is used only for migration, deletion and pruning.
      for (const threadId of changes.turnMetrics || []) {
        this.statement("DELETE FROM execution_supplements WHERE thread_id=?").run(threadId);
        for (const [turnId, turn] of Object.entries(state.turnMetrics[threadId] || {})) {
          const { items, ...metric } = turn;
          this.writeSupplement(threadId, turnId, "", metric);
          for (const [itemId, item] of Object.entries(items || {})) this.writeSupplement(threadId, turnId, itemId, item);
        }
      }
      for (const key of changes.supplements || []) {
        const [threadId, turnId, itemId] = JSON.parse(key);
        const turn = state.turnMetrics[threadId]?.[turnId];
        if (!turn) this.statement("DELETE FROM execution_supplements WHERE thread_id=? AND turn_id=?").run(threadId, turnId);
        else if (itemId) {
          if (turn.items?.[itemId]) this.writeSupplement(threadId, turnId, itemId, turn.items[itemId]);
          else this.statement("DELETE FROM execution_supplements WHERE thread_id=? AND turn_id=? AND item_id=?").run(threadId, turnId, itemId);
        } else {
          const { items, ...metric } = turn;
          this.writeSupplement(threadId, turnId, "", metric);
        }
      }
      if (transaction) db.exec("COMMIT");
    } catch (error) {
      if (transaction) db.exec("ROLLBACK");
      throw error;
    }
  }

  writeSupplement(threadId, turnId, itemId, value) {
    this.statement("INSERT INTO execution_supplements VALUES (?, ?, ?, ?) ON CONFLICT(thread_id, turn_id, item_id) DO UPDATE SET value=excluded.value WHERE value IS NOT excluded.value")
      .run(threadId, turnId, itemId, JSON.stringify(value));
  }
}
