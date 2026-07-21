import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createId } from "@paralleldrive/cuid2";

const INDEX_SCOPE_ID = "all";

export interface TodoListSummary {
    readonly completedCount: number;
    readonly createdAt: string;
    readonly createdByUserId: string;
    readonly id: string;
    readonly itemCount: number;
    readonly revision: number;
    readonly title: string;
    readonly updatedAt: string;
}

export interface TodoItem {
    readonly completed: boolean;
    readonly createdAt: string;
    readonly createdByUserId: string;
    readonly id: string;
    readonly listId: string;
    readonly position: number;
    readonly title: string;
    readonly updatedAt: string;
}

export type TodoActivityKind =
    | "item_added"
    | "item_deleted"
    | "item_toggled"
    | "item_updated"
    | "list_created";

export interface TodoActivity {
    readonly actorUserId: string;
    readonly createdAt: string;
    readonly id: string;
    readonly itemId?: string;
    readonly kind: TodoActivityKind;
    readonly listId: string;
    readonly revision: number;
    readonly summary: string;
}

export interface TodoIndexSnapshot {
    readonly lists: readonly TodoListSummary[];
    readonly revision: number;
}

export interface TodoListSnapshot {
    readonly activity: readonly TodoActivity[];
    readonly items: readonly TodoItem[];
    readonly list: TodoListSummary;
    readonly revision: number;
}

export interface TodoMutation<T> {
    readonly indexRevision: number;
    readonly listRevision: number;
    readonly value: T;
}

export interface TodoListDeletion {
    readonly indexRevision: number;
    readonly value: {
        readonly id: string;
        readonly title: string;
    };
}

export interface TodosDatabaseOptions {
    readonly idFactory?: () => string;
    readonly now?: () => Date;
}

export class TodoDataError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TodoDataError";
    }
}

/** Durable, transactionally versioned collaborative TODO data. */
export class TodosDatabase {
    readonly #database: DatabaseSync;
    readonly #idFactory: () => string;
    readonly #now: () => Date;

    constructor(path: string, options: TodosDatabaseOptions = {}) {
        if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
        this.#database = new DatabaseSync(path);
        this.#idFactory = options.idFactory ?? createId;
        this.#now = options.now ?? (() => new Date());
        this.#database.exec(
            "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
        );
        this.#migrate();
    }

    close(): void {
        this.#database.close();
    }

    indexSnapshot(): TodoIndexSnapshot {
        const revision = this.#revision("index", INDEX_SCOPE_ID);
        const rows = this.#database
            .prepare(`
                SELECT l.id, l.title, l.created_by_user_id, l.created_at, l.updated_at,
                       r.revision,
                       COUNT(i.id) AS item_count,
                       COALESCE(SUM(CASE WHEN i.completed = 1 THEN 1 ELSE 0 END), 0) AS completed_count
                FROM todo_lists l
                JOIN todo_revisions r ON r.scope = 'list' AND r.scope_id = l.id
                LEFT JOIN todo_items i ON i.list_id = l.id
                GROUP BY l.id
                ORDER BY l.updated_at DESC, l.id
            `)
            .all();
        return { lists: rows.map(listSummary), revision };
    }

    listSnapshot(listId: string): TodoListSnapshot {
        const list = this.#listSummary(listId);
        const items = this.#database
            .prepare(`
                SELECT id, list_id, title, completed, position, created_by_user_id, created_at, updated_at
                FROM todo_items WHERE list_id = ? ORDER BY position, created_at, id
            `)
            .all(listId)
            .map(todoItem);
        const activity = this.#database
            .prepare(`
                SELECT id, list_id, revision, actor_user_id, kind, item_id, summary, created_at
                FROM todo_activity WHERE list_id = ? ORDER BY revision DESC, created_at DESC LIMIT 40
            `)
            .all(listId)
            .map(todoActivity);
        return { activity, items, list, revision: list.revision };
    }

    createList(titleInput: string, actorUserId: string): TodoMutation<TodoListSummary> {
        const title = requiredText(titleInput, "List title", 120);
        return this.#transaction(() => {
            const id = this.#idFactory();
            const timestamp = this.#timestamp();
            this.#database
                .prepare(`
                    INSERT INTO todo_lists (id, title, created_by_user_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `)
                .run(id, title, actorUserId, timestamp, timestamp);
            this.#database
                .prepare(
                    "INSERT INTO todo_revisions (scope, scope_id, revision) VALUES ('list', ?, 1)",
                )
                .run(id);
            const indexRevision = this.#incrementRevision("index", INDEX_SCOPE_ID);
            this.#activity(id, 1, actorUserId, "list_created", undefined, `Created “${title}”.`);
            return { indexRevision, listRevision: 1, value: this.#listSummary(id) };
        });
    }

    addItem(listId: string, titleInput: string, actorUserId: string): TodoMutation<TodoItem> {
        const title = requiredText(titleInput, "Item title", 240);
        return this.#mutateList(listId, actorUserId, (revision, timestamp) => {
            const id = this.#idFactory();
            const positionRow = row(
                this.#database
                    .prepare(
                        "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM todo_items WHERE list_id = ?",
                    )
                    .get(listId),
                "Item position",
            );
            const position = integer(positionRow.position, "Item position");
            this.#database
                .prepare(`
                    INSERT INTO todo_items
                        (id, list_id, title, completed, position, created_by_user_id, created_at, updated_at)
                    VALUES (?, ?, ?, 0, ?, ?, ?, ?)
                `)
                .run(id, listId, title, position, actorUserId, timestamp, timestamp);
            this.#activity(listId, revision, actorUserId, "item_added", id, `Added “${title}”.`);
            return this.#item(id);
        });
    }

    updateItem(
        listId: string,
        itemId: string,
        titleInput: string,
        actorUserId: string,
    ): TodoMutation<TodoItem> {
        const title = requiredText(titleInput, "Item title", 240);
        return this.#mutateList(listId, actorUserId, (revision, timestamp) => {
            this.#requireItem(listId, itemId);
            this.#database
                .prepare(
                    "UPDATE todo_items SET title = ?, updated_at = ? WHERE id = ? AND list_id = ?",
                )
                .run(title, timestamp, itemId, listId);
            this.#activity(
                listId,
                revision,
                actorUserId,
                "item_updated",
                itemId,
                `Renamed item to “${title}”.`,
            );
            return this.#item(itemId);
        });
    }

    toggleItem(
        listId: string,
        itemId: string,
        completed: boolean,
        actorUserId: string,
    ): TodoMutation<TodoItem> {
        return this.#mutateList(listId, actorUserId, (revision, timestamp) => {
            const existing = this.#requireItem(listId, itemId);
            this.#database
                .prepare(
                    "UPDATE todo_items SET completed = ?, updated_at = ? WHERE id = ? AND list_id = ?",
                )
                .run(completed ? 1 : 0, timestamp, itemId, listId);
            this.#activity(
                listId,
                revision,
                actorUserId,
                "item_toggled",
                itemId,
                `${completed ? "Completed" : "Reopened"} “${string(existing.title, "Item title")}”.`,
            );
            return this.#item(itemId);
        });
    }

    deleteItem(listId: string, itemId: string, actorUserId: string): TodoMutation<{ id: string }> {
        return this.#mutateList(listId, actorUserId, (revision) => {
            const existing = this.#requireItem(listId, itemId);
            this.#database
                .prepare("DELETE FROM todo_items WHERE id = ? AND list_id = ?")
                .run(itemId, listId);
            this.#activity(
                listId,
                revision,
                actorUserId,
                "item_deleted",
                undefined,
                `Deleted “${string(existing.title, "Item title")}”.`,
            );
            return { id: itemId };
        });
    }

    deleteList(listId: string): TodoListDeletion {
        return this.#transaction(() => {
            const list = this.#listSummary(listId);
            const indexRevision = this.#incrementRevision("index", INDEX_SCOPE_ID);
            this.#database
                .prepare("DELETE FROM todo_revisions WHERE scope = 'list' AND scope_id = ?")
                .run(listId);
            this.#database.prepare("DELETE FROM todo_lists WHERE id = ?").run(listId);
            return { indexRevision, value: { id: list.id, title: list.title } };
        });
    }

    #mutateList<T>(
        listId: string,
        actorUserId: string,
        mutate: (revision: number, timestamp: string) => T,
    ): TodoMutation<T> {
        return this.#transaction(() => {
            this.#requireList(listId);
            const timestamp = this.#timestamp();
            const listRevision = this.#incrementRevision("list", listId);
            const indexRevision = this.#incrementRevision("index", INDEX_SCOPE_ID);
            const value = mutate(listRevision, timestamp);
            this.#database
                .prepare("UPDATE todo_lists SET updated_at = ? WHERE id = ?")
                .run(timestamp, listId);
            return { indexRevision, listRevision, value };
        });
    }

    #listSummary(listId: string): TodoListSummary {
        const value = this.#database
            .prepare(`
                SELECT l.id, l.title, l.created_by_user_id, l.created_at, l.updated_at,
                       r.revision,
                       COUNT(i.id) AS item_count,
                       COALESCE(SUM(CASE WHEN i.completed = 1 THEN 1 ELSE 0 END), 0) AS completed_count
                FROM todo_lists l
                JOIN todo_revisions r ON r.scope = 'list' AND r.scope_id = l.id
                LEFT JOIN todo_items i ON i.list_id = l.id
                WHERE l.id = ? GROUP BY l.id
            `)
            .get(listId);
        if (!value) throw new TodoDataError(`TODO list ${listId} was not found.`);
        return listSummary(value);
    }

    #item(itemId: string): TodoItem {
        return todoItem(
            this.#database
                .prepare(`
                    SELECT id, list_id, title, completed, position, created_by_user_id, created_at, updated_at
                    FROM todo_items WHERE id = ?
                `)
                .get(itemId),
        );
    }

    #requireList(listId: string): void {
        if (!this.#database.prepare("SELECT 1 FROM todo_lists WHERE id = ?").get(listId))
            throw new TodoDataError(`TODO list ${listId} was not found.`);
    }

    #requireItem(listId: string, itemId: string): Readonly<Record<string, unknown>> {
        const value = this.#database
            .prepare("SELECT id, title FROM todo_items WHERE id = ? AND list_id = ?")
            .get(itemId, listId);
        if (!value) throw new TodoDataError(`TODO item ${itemId} was not found in list ${listId}.`);
        return value;
    }

    #revision(scope: "index" | "list", scopeId: string): number {
        const value = row(
            this.#database
                .prepare("SELECT revision FROM todo_revisions WHERE scope = ? AND scope_id = ?")
                .get(scope, scopeId),
            "TODO revision",
        );
        return integer(value.revision, "TODO revision");
    }

    #incrementRevision(scope: "index" | "list", scopeId: string): number {
        this.#database
            .prepare(
                "UPDATE todo_revisions SET revision = revision + 1 WHERE scope = ? AND scope_id = ?",
            )
            .run(scope, scopeId);
        return this.#revision(scope, scopeId);
    }

    #activity(
        listId: string,
        revision: number,
        actorUserId: string,
        kind: TodoActivityKind,
        itemId: string | undefined,
        summary: string,
    ): void {
        this.#database
            .prepare(`
                INSERT INTO todo_activity
                    (id, list_id, revision, actor_user_id, kind, item_id, summary, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
                this.#idFactory(),
                listId,
                revision,
                actorUserId,
                kind,
                itemId ?? null,
                summary,
                this.#timestamp(),
            );
    }

    #transaction<T>(operation: () => T): T {
        this.#database.exec("BEGIN IMMEDIATE");
        try {
            const result = operation();
            this.#database.exec("COMMIT");
            return result;
        } catch (error) {
            this.#database.exec("ROLLBACK");
            throw error;
        }
    }

    #timestamp(): string {
        return this.#now().toISOString();
    }

    #migrate(): void {
        this.#database.exec(`
            CREATE TABLE IF NOT EXISTS todo_lists (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_by_user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            ) STRICT;
            CREATE TABLE IF NOT EXISTS todo_items (
                id TEXT PRIMARY KEY,
                list_id TEXT NOT NULL REFERENCES todo_lists(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
                position INTEGER NOT NULL,
                created_by_user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            ) STRICT;
            CREATE INDEX IF NOT EXISTS todo_items_list_position ON todo_items(list_id, position);
            CREATE TABLE IF NOT EXISTS todo_revisions (
                scope TEXT NOT NULL CHECK (scope IN ('index', 'list')),
                scope_id TEXT NOT NULL,
                revision INTEGER NOT NULL CHECK (revision >= 0),
                PRIMARY KEY (scope, scope_id)
            ) STRICT;
            CREATE TABLE IF NOT EXISTS todo_activity (
                id TEXT PRIMARY KEY,
                list_id TEXT NOT NULL REFERENCES todo_lists(id) ON DELETE CASCADE,
                revision INTEGER NOT NULL,
                actor_user_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                item_id TEXT,
                summary TEXT NOT NULL,
                created_at TEXT NOT NULL
            ) STRICT;
            CREATE INDEX IF NOT EXISTS todo_activity_list_revision
                ON todo_activity(list_id, revision DESC);
            INSERT OR IGNORE INTO todo_revisions (scope, scope_id, revision)
                VALUES ('index', '${INDEX_SCOPE_ID}', 0);
        `);
    }
}

function listSummary(value: unknown): TodoListSummary {
    const source = row(value, "TODO list");
    return {
        completedCount: integer(source.completed_count, "Completed count"),
        createdAt: string(source.created_at, "Created at"),
        createdByUserId: string(source.created_by_user_id, "Creator"),
        id: string(source.id, "List ID"),
        itemCount: integer(source.item_count, "Item count"),
        revision: integer(source.revision, "List revision"),
        title: string(source.title, "List title"),
        updatedAt: string(source.updated_at, "Updated at"),
    };
}

function todoItem(value: unknown): TodoItem {
    const source = row(value, "TODO item");
    return {
        completed: integer(source.completed, "Completed") === 1,
        createdAt: string(source.created_at, "Created at"),
        createdByUserId: string(source.created_by_user_id, "Creator"),
        id: string(source.id, "Item ID"),
        listId: string(source.list_id, "List ID"),
        position: integer(source.position, "Position"),
        title: string(source.title, "Item title"),
        updatedAt: string(source.updated_at, "Updated at"),
    };
}

function todoActivity(value: unknown): TodoActivity {
    const source = row(value, "TODO activity");
    const kind = string(source.kind, "Activity kind") as TodoActivityKind;
    return {
        actorUserId: string(source.actor_user_id, "Activity actor"),
        createdAt: string(source.created_at, "Activity time"),
        id: string(source.id, "Activity ID"),
        ...(source.item_id === null ? {} : { itemId: string(source.item_id, "Activity item ID") }),
        kind,
        listId: string(source.list_id, "Activity list ID"),
        revision: integer(source.revision, "Activity revision"),
        summary: string(source.summary, "Activity summary"),
    };
}

function row(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`${label} row is invalid.`);
    return value as Readonly<Record<string, unknown>>;
}

function integer(value: unknown, label: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value))
        throw new Error(`${label} is invalid.`);
    return value;
}

function string(value: unknown, label: string): string {
    if (typeof value !== "string") throw new Error(`${label} is invalid.`);
    return value;
}

function requiredText(value: string, label: string, maximum: number): string {
    const result = value.trim();
    if (!result) throw new TodoDataError(`${label} is required.`);
    if (result.length > maximum)
        throw new TodoDataError(`${label} must contain at most ${maximum} characters.`);
    return result;
}

export function databasePath(environment: NodeJS.ProcessEnv = process.env): string {
    return environment.HAPPY2_TODOS_DATABASE_PATH?.trim() || "/workspace/todos.db";
}
