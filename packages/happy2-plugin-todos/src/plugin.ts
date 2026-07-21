import { join } from "node:path";
import {
    HostClient,
    McpServer,
    appResourceMetadata,
    appToolMetadata,
    happyCallContext,
    registerAppTool,
    registerHtmlAppResource,
    type CallToolResult,
    type HappyCallContext,
    type JsonObject,
} from "happy2-plugin-sdk/server";
import { z } from "zod";
import {
    TodosDatabase,
    databasePath,
    type TodoIndexSnapshot,
    type TodoItem,
    type TodoListDeletion,
    type TodoListSnapshot,
    type TodoListSummary,
    type TodoMutation,
} from "./database.js";

export const TODO_INDEX_URI = "ui://happy2-todos/index.html";
export const TODO_LIST_URI = "ui://happy2-todos/list.html";
const INDEX_INSTANCE_KEY = "todos.index";
const APP_ONLY_META = { ui: { visibility: ["app"] } } as const;
const MODEL_ONLY_META = { ui: { visibility: ["model"] } } as const;

type HostSurfaceClient = Pick<
    HostClient,
    "deleteAppInstance" | "putAppInstance" | "putContribution" | "updateAppInstanceContext"
>;

export interface TodosPluginOptions {
    readonly database?: TodosDatabase;
    readonly databasePath?: string;
    readonly hostClient?: HostSurfaceClient;
}

export interface TodosPluginRuntime {
    readonly database: TodosDatabase;
    readonly server: McpServer;
    close(): void;
}

/** Creates the official MCP server and durable TODO runtime without opening a transport. */
export function createTodosPlugin(options: TodosPluginOptions = {}): TodosPluginRuntime {
    const database = options.database ?? new TodosDatabase(options.databasePath ?? databasePath());
    const host = options.hostClient ?? HostClient.fromEnvironment();
    const surfaces = new TodoSurfaces(host, database);
    const server = new McpServer({ name: "happy2-todos", version: "1.0.0" });
    registerResources(server);
    registerModelTools(server, database, surfaces);
    registerAppTools(server, database, surfaces);
    return {
        database,
        server,
        close() {
            database.close();
        },
    };
}

function registerResources(server: McpServer): void {
    const metadata = appResourceMetadata({ prefersBorder: false });
    registerHtmlAppResource(server, {
        description: "Selector and overview for shared collaborative TODO lists.",
        htmlPath: join(import.meta.dirname, "apps/index.html"),
        name: "Collaborative TODO list selector",
        prefersBorder: metadata.ui.prefersBorder,
        uri: TODO_INDEX_URI,
    });
    registerHtmlAppResource(server, {
        description: "One collaborative TODO list with live shared activity.",
        htmlPath: join(import.meta.dirname, "apps/list.html"),
        name: "Collaborative TODO list",
        prefersBorder: metadata.ui.prefersBorder,
        uri: TODO_LIST_URI,
    });
}

function registerModelTools(
    server: McpServer,
    database: TodosDatabase,
    surfaces: TodoSurfaces,
): void {
    registerAppTool(
        server,
        "todos_create_list",
        {
            description:
                "Creates a durable collaborative TODO list shared with everyone and adds it to the Happy sidebar.",
            inputSchema: z
                .object({ title: titleSchema("A concise title for the new list.", 120) })
                .strict(),
            _meta: appToolMetadata({ resourceUri: TODO_LIST_URI, visibility: ["model"] }),
            title: "Create a collaborative TODO list",
        },
        ({ title }, extra) =>
            safely(async () => {
                const context = mutationContext(extra);
                await surfaces.ensureGlobal(context.call);
                const mutation = database.createList(title, context.userId);
                await surfaces.created(mutation, context.call);
                return listCreatedResult(mutation.value, mutation);
            }),
    );

    server.registerTool(
        "todos_list_lists",
        {
            description:
                "Lists every collaborative TODO list with item counts, completion counts, and revision information.",
            inputSchema: z.object({}).strict(),
            _meta: MODEL_ONLY_META,
            title: "List collaborative TODO lists",
        },
        (_input, extra) =>
            safely(async () => {
                const context = happyCallContext(extra);
                await surfaces.ensureGlobal(context);
                return indexResult(database.indexSnapshot());
            }),
    );

    registerAppTool(
        server,
        "todos_get_list",
        {
            description:
                "Gets one collaborative TODO list, its ordered items, current revision, and recent activity.",
            inputSchema: z.object({ listId: idSchema("The TODO list ID.") }).strict(),
            _meta: appToolMetadata({ resourceUri: TODO_LIST_URI, visibility: ["model"] }),
            title: "Get a collaborative TODO list",
        },
        ({ listId }, extra) =>
            safely(async () => {
                const context = happyCallContext(extra);
                await surfaces.ensureGlobal(context);
                const snapshot = database.listSnapshot(listId);
                await surfaces.ensureList(snapshot.list, context);
                return listResult(snapshot);
            }),
    );

    server.registerTool(
        "todos_delete_list",
        {
            description:
                "Permanently deletes one collaborative TODO list, all of its items, and its sidebar app.",
            inputSchema: z.object({ listId: idSchema("The TODO list ID.") }).strict(),
            _meta: MODEL_ONLY_META,
            title: "Delete a collaborative TODO list",
        },
        ({ listId }, extra) => deleteList(database, surfaces, extra, listId),
    );

    server.registerTool(
        "todos_add_item",
        {
            description: "Adds one item to a collaborative TODO list.",
            inputSchema: z
                .object({
                    listId: idSchema("The TODO list ID."),
                    title: titleSchema("The task to add.", 240),
                })
                .strict(),
            _meta: MODEL_ONLY_META,
            title: "Add a TODO item",
        },
        ({ listId, title }, extra) =>
            mutate(database, surfaces, extra, listId, () =>
                database.addItem(listId, title, viewer(extra)),
            ).then((result) =>
                result.isError ? result : itemMutationResult("Added", result, database, listId),
            ),
    );

    server.registerTool(
        "todos_update_item",
        {
            description: "Renames one item in a collaborative TODO list.",
            inputSchema: itemTitleInput().strict(),
            _meta: MODEL_ONLY_META,
            title: "Update a TODO item",
        },
        ({ itemId, listId, title }, extra) =>
            mutate(database, surfaces, extra, listId, () =>
                database.updateItem(listId, itemId, title, viewer(extra)),
            ).then((result) =>
                result.isError ? result : itemMutationResult("Updated", result, database, listId),
            ),
    );

    server.registerTool(
        "todos_toggle_item",
        {
            description:
                "Marks one collaborative TODO item complete or reopens it using an explicit desired state.",
            inputSchema: toggleInput().strict(),
            _meta: MODEL_ONLY_META,
            title: "Toggle a TODO item",
        },
        ({ completed, itemId, listId }, extra) =>
            mutate(database, surfaces, extra, listId, () =>
                database.toggleItem(listId, itemId, completed, viewer(extra)),
            ).then((result) =>
                result.isError
                    ? result
                    : itemMutationResult(
                          completed ? "Completed" : "Reopened",
                          result,
                          database,
                          listId,
                      ),
            ),
    );

    server.registerTool(
        "todos_delete_item",
        {
            description: "Deletes one item from a collaborative TODO list.",
            inputSchema: itemIdentityInput().strict(),
            _meta: MODEL_ONLY_META,
            title: "Delete a TODO item",
        },
        ({ itemId, listId }, extra) =>
            mutate(database, surfaces, extra, listId, () =>
                database.deleteItem(listId, itemId, viewer(extra)),
            ).then((result) => {
                if (result.isError) return result;
                const snapshot = database.listSnapshot(listId);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Deleted the TODO item from “${snapshot.list.title}”.`,
                        },
                    ],
                    structuredContent: listStructured(snapshot),
                };
            }),
    );
}

function registerAppTools(
    server: McpServer,
    database: TodosDatabase,
    surfaces: TodoSurfaces,
): void {
    server.registerTool(
        "todos_app_index_snapshot",
        {
            description: "Reconciles the durable collaborative TODO list selector.",
            inputSchema: z.object({}).strict(),
            _meta: appToolMetadata({ resourceUri: TODO_INDEX_URI, visibility: ["app"] }),
            title: "Reconcile TODO list selector",
        },
        (_input, extra) =>
            safely(async () => {
                await surfaces.ensureGlobal(happyCallContext(extra));
                return indexResult(database.indexSnapshot());
            }),
    );
    server.registerTool(
        "todos_app_list_snapshot",
        {
            description: "Reconciles one durable collaborative TODO list.",
            inputSchema: z.object({ listId: idSchema("The TODO list ID.") }).strict(),
            _meta: appToolMetadata({ resourceUri: TODO_LIST_URI, visibility: ["app"] }),
            title: "Reconcile TODO list",
        },
        ({ listId }, extra) =>
            safely(async () => {
                const context = happyCallContext(extra);
                const snapshot = database.listSnapshot(listId);
                await surfaces.ensureList(snapshot.list, context);
                return listResult(snapshot);
            }),
    );
    server.registerTool(
        "todos_app_create_list",
        {
            description: "Creates a list from the interactive TODO selector.",
            inputSchema: z
                .object({ title: titleSchema("A concise title for the new list.", 120) })
                .strict(),
            _meta: APP_ONLY_META,
            title: "Create TODO list from app",
        },
        ({ title }, extra) =>
            safely(async () => {
                const context = mutationContext(extra);
                const mutation = database.createList(title, context.userId);
                await surfaces.created(mutation, context.call);
                return listCreatedResult(mutation.value, mutation);
            }),
    );
    server.registerTool(
        "todos_app_delete_list",
        {
            description: "Deletes a list from the interactive TODO selector.",
            inputSchema: z.object({ listId: idSchema("The TODO list ID.") }).strict(),
            _meta: APP_ONLY_META,
            title: "Delete TODO list from app",
        },
        ({ listId }, extra) => deleteList(database, surfaces, extra, listId),
    );
    server.registerTool(
        "todos_app_add_item",
        {
            description: "Adds an item from the interactive TODO list.",
            inputSchema: z
                .object({
                    listId: idSchema("The TODO list ID."),
                    title: titleSchema("The task to add.", 240),
                })
                .strict(),
            _meta: APP_ONLY_META,
            title: "Add TODO item from app",
        },
        ({ listId, title }, extra) =>
            mutate(database, surfaces, extra, listId, () =>
                database.addItem(listId, title, viewer(extra)),
            ).then((result) =>
                result.isError ? result : itemMutationResult("Added", result, database, listId),
            ),
    );
    server.registerTool(
        "todos_app_update_item",
        {
            description: "Renames an item from the interactive TODO list.",
            inputSchema: itemTitleInput().strict(),
            _meta: APP_ONLY_META,
            title: "Update TODO item from app",
        },
        ({ itemId, listId, title }, extra) =>
            mutate(database, surfaces, extra, listId, () =>
                database.updateItem(listId, itemId, title, viewer(extra)),
            ).then((result) =>
                result.isError ? result : itemMutationResult("Updated", result, database, listId),
            ),
    );
    server.registerTool(
        "todos_app_toggle_item",
        {
            description: "Completes or reopens an item from the interactive TODO list.",
            inputSchema: toggleInput().strict(),
            _meta: APP_ONLY_META,
            title: "Toggle TODO item from app",
        },
        ({ completed, itemId, listId }, extra) =>
            mutate(database, surfaces, extra, listId, () =>
                database.toggleItem(listId, itemId, completed, viewer(extra)),
            ).then((result) =>
                result.isError
                    ? result
                    : itemMutationResult(
                          completed ? "Completed" : "Reopened",
                          result,
                          database,
                          listId,
                      ),
            ),
    );
    server.registerTool(
        "todos_app_delete_item",
        {
            description: "Deletes an item from the interactive TODO list.",
            inputSchema: itemIdentityInput().strict(),
            _meta: APP_ONLY_META,
            title: "Delete TODO item from app",
        },
        ({ itemId, listId }, extra) =>
            mutate(database, surfaces, extra, listId, () =>
                database.deleteItem(listId, itemId, viewer(extra)),
            ).then((result) => {
                if (result.isError) return result;
                const snapshot = database.listSnapshot(listId);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Deleted the TODO item from “${snapshot.list.title}”.`,
                        },
                    ],
                    structuredContent: listStructured(snapshot),
                };
            }),
    );
}

class TodoSurfaces {
    readonly #database: TodosDatabase;
    readonly #host: HostSurfaceClient;
    #globalInitialization: Promise<void> | undefined;

    constructor(host: HostSurfaceClient, database: TodosDatabase) {
        this.#host = host;
        this.#database = database;
    }

    ensureGlobal(context: HappyCallContext): Promise<void> {
        if (!this.#globalInitialization) {
            this.#globalInitialization = this.#createGlobal(context).catch((error: unknown) => {
                this.#globalInitialization = undefined;
                throw error;
            });
        }
        return this.#globalInitialization;
    }

    async created(
        mutation: TodoMutation<TodoListSummary>,
        context: HappyCallContext,
    ): Promise<void> {
        await this.ensureGlobal(context);
        await this.ensureList(mutation.value, context);
        await this.#revisions(
            mutation.value.id,
            mutation.listRevision,
            mutation.indexRevision,
            context,
        );
    }

    async deleted(deletion: TodoListDeletion, context: HappyCallContext): Promise<void> {
        await this.ensureGlobal(context);
        await this.#host.deleteAppInstance(
            { instanceKey: listInstanceKey(deletion.value.id) },
            context,
        );
        await this.#host.updateAppInstanceContext(
            {
                context: { dataRevision: deletion.indexRevision },
                instanceKey: INDEX_INSTANCE_KEY,
            },
            context,
        );
    }

    async ensureList(list: TodoListSummary, context: HappyCallContext): Promise<void> {
        await this.#host.putAppInstance(
            {
                assetId: "todo-mark",
                audience: { scope: "all_users" },
                context: { dataRevision: list.revision, listId: list.id },
                description: `Collaborative TODO list: ${list.title}`,
                instanceKey: listInstanceKey(list.id),
                position: 100,
                presentation: "sidebar",
                resourceUri: TODO_LIST_URI,
                title: list.title,
            },
            context,
        );
    }

    async mutated<T>(
        listId: string,
        mutation: TodoMutation<T>,
        context: HappyCallContext,
    ): Promise<void> {
        await this.ensureGlobal(context);
        await this.ensureList(this.#database.listSnapshot(listId).list, context);
        await this.#revisions(listId, mutation.listRevision, mutation.indexRevision, context);
    }

    async #createGlobal(context: HappyCallContext): Promise<void> {
        const revision = this.#database.indexSnapshot().revision;
        await this.#host.putAppInstance(
            {
                assetId: "todo-mark",
                audience: { scope: "all_users" },
                context: { dataRevision: revision },
                description: "Browse and create collaborative TODO lists.",
                instanceKey: INDEX_INSTANCE_KEY,
                position: 20,
                presentation: "sidebar",
                resourceUri: TODO_INDEX_URI,
                title: "TODO Lists",
            },
            context,
        );
        await this.#host.putContribution(
            {
                audience: { scope: "all_users" },
                description: "Open the collaborative TODO list selector.",
                externalKey: "todos.sidebar-menu",
                location: "sidebarMenu",
                position: 20,
                spec: {
                    action: {
                        openApp: { instanceKey: INDEX_INSTANCE_KEY, presentation: "primary" },
                        toolName: "todos_app_index_snapshot",
                    },
                    assetId: "todo-mark",
                    description: "Browse shared lists and choose one to open.",
                    id: "todos-open-index",
                    kind: "button",
                    title: "TODO Lists",
                },
                title: "TODO Lists",
            },
            context,
        );
        await this.#host.putContribution(
            {
                audience: { scope: "all_users" },
                description: "Open collaborative TODOs from the composer.",
                externalKey: "todos.composer",
                location: "composerIcon",
                position: 30,
                spec: {
                    action: {
                        openApp: { instanceKey: INDEX_INSTANCE_KEY, presentation: "modal" },
                        toolName: "todos_app_index_snapshot",
                    },
                    assetId: "todo-mark",
                    description: "Open TODO lists in a modal to add or select tasks.",
                    id: "todos-open-composer",
                    kind: "button",
                    title: "Open TODOs",
                },
                title: "Open TODOs",
            },
            context,
        );
    }

    async #revisions(
        listId: string,
        listRevision: number,
        indexRevision: number,
        context: HappyCallContext,
    ): Promise<void> {
        await this.#host.updateAppInstanceContext(
            {
                context: { dataRevision: listRevision, listId },
                instanceKey: listInstanceKey(listId),
            },
            context,
        );
        await this.#host.updateAppInstanceContext(
            { context: { dataRevision: indexRevision }, instanceKey: INDEX_INSTANCE_KEY },
            context,
        );
    }
}

async function deleteList(
    database: TodosDatabase,
    surfaces: TodoSurfaces,
    extra: Parameters<typeof happyCallContext>[0],
    listId: string,
): Promise<CallToolResult> {
    return safely(async () => {
        const context = mutationContext(extra);
        const deletion = database.deleteList(listId);
        await surfaces.deleted(deletion, context.call);
        return listDeletedResult(deletion);
    });
}

async function mutate<T>(
    database: TodosDatabase,
    surfaces: TodoSurfaces,
    extra: Parameters<typeof happyCallContext>[0],
    listId: string,
    operation: () => TodoMutation<T>,
): Promise<CallToolResult & { mutation?: TodoMutation<T> }> {
    try {
        const context = mutationContext(extra);
        const mutation = operation();
        await surfaces.mutated(listId, mutation, context.call);
        return { content: [], mutation };
    } catch (error) {
        return errorResult(error);
    }
}

function itemMutationResult<T>(
    verb: string,
    result: CallToolResult & { mutation?: TodoMutation<T> },
    database: TodosDatabase,
    listId: string,
): CallToolResult {
    const mutation = result.mutation;
    if (!mutation) return result;
    const snapshot = database.listSnapshot(listId);
    const item = mutation.value as TodoItem;
    return {
        content: [{ type: "text", text: `${verb} “${item.title}” in “${snapshot.list.title}”.` }],
        structuredContent: listStructured(snapshot),
    };
}

function listCreatedResult(
    list: TodoListSummary,
    mutation: TodoMutation<TodoListSummary>,
): CallToolResult {
    return {
        content: [
            {
                type: "text",
                text: `Created collaborative TODO list “${list.title}” with no items.`,
            },
        ],
        structuredContent: {
            indexRevision: mutation.indexRevision,
            list: listStructuredSummary(list),
        },
    };
}

function listDeletedResult(deletion: TodoListDeletion): CallToolResult {
    return {
        content: [
            {
                type: "text",
                text: `Deleted collaborative TODO list “${deletion.value.title}”.`,
            },
        ],
        structuredContent: {
            deletedList: { ...deletion.value },
            indexRevision: deletion.indexRevision,
        },
    };
}

function indexResult(snapshot: TodoIndexSnapshot): CallToolResult {
    return {
        content: [
            {
                type: "text",
                text: `Found ${snapshot.lists.length} collaborative TODO list${snapshot.lists.length === 1 ? "" : "s"}.`,
            },
        ],
        structuredContent: indexStructured(snapshot),
    };
}

function listResult(snapshot: TodoListSnapshot): CallToolResult {
    return {
        content: [
            {
                type: "text",
                text: `“${snapshot.list.title}” has ${snapshot.items.length} item${snapshot.items.length === 1 ? "" : "s"}, ${snapshot.list.completedCount} completed.`,
            },
        ],
        structuredContent: listStructured(snapshot),
    };
}

function indexStructured(snapshot: TodoIndexSnapshot): JsonObject {
    return {
        lists: snapshot.lists.map(listStructuredSummary),
        revision: snapshot.revision,
    };
}

function listStructured(snapshot: TodoListSnapshot): JsonObject {
    return {
        activity: snapshot.activity.map((entry) => ({
            actorUserId: entry.actorUserId,
            createdAt: entry.createdAt,
            id: entry.id,
            ...(entry.itemId ? { itemId: entry.itemId } : {}),
            kind: entry.kind,
            listId: entry.listId,
            revision: entry.revision,
            summary: entry.summary,
        })),
        items: snapshot.items.map((item) => ({ ...item })),
        list: listStructuredSummary(snapshot.list),
        revision: snapshot.revision,
    };
}

function listStructuredSummary(list: TodoListSummary): JsonObject {
    return { ...list };
}

async function safely(operation: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
        return await operation();
    } catch (error) {
        return errorResult(error);
    }
}

function errorResult(error: unknown): CallToolResult {
    return {
        content: [
            {
                type: "text",
                text: error instanceof Error ? error.message : "The TODO operation failed.",
            },
        ],
        isError: true,
    };
}

function mutationContext(extra: Parameters<typeof happyCallContext>[0]): {
    readonly call: HappyCallContext;
    readonly userId: string;
} {
    const call = happyCallContext(extra);
    if (!call.viewer)
        throw new Error("Happy did not provide the protected current viewer capability.");
    return { call, userId: call.viewer.id };
}

function viewer(extra: Parameters<typeof happyCallContext>[0]): string {
    return mutationContext(extra).userId;
}

function titleSchema(description: string, maximum: number) {
    return z.string().min(1).max(maximum).describe(description);
}

function idSchema(description: string) {
    return z.string().min(1).max(128).describe(description);
}

function itemIdentityInput() {
    return z.object({
        itemId: idSchema("The TODO item ID."),
        listId: idSchema("The TODO list ID."),
    });
}

function itemTitleInput() {
    return itemIdentityInput().extend({ title: titleSchema("The item's new title.", 240) });
}

function toggleInput() {
    return itemIdentityInput().extend({
        completed: z.boolean().describe("The desired completed state."),
    });
}

function listInstanceKey(listId: string): string {
    return `todos.list.${listId}`;
}
