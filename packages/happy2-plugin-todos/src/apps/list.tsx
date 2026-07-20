import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { useHappyApp } from "happy2-plugin-sdk/app";
import { SHARED_STYLES } from "./shared";

/*
 * Collaborative TODO list app (MCP Apps view). It renders one list identified by
 * `happy2/instance.context.listId`, and creates/toggles/renames/deletes items
 * through the exact app-visible tools. It re-reads its snapshot whenever the
 * instance `dataRevision` advances (a collaborator's edit) without remounting,
 * and surfaces recent activity so concurrent editors see each other's changes.
 */

interface TodoItem {
    readonly completed: boolean;
    readonly createdByUserId: string;
    readonly id: string;
    readonly listId: string;
    readonly position: number;
    readonly title: string;
    readonly updatedAt: string;
}
interface TodoListSummary {
    readonly completedCount: number;
    readonly id: string;
    readonly itemCount: number;
    readonly title: string;
}
interface TodoActivity {
    readonly actorUserId: string;
    readonly createdAt: string;
    readonly id: string;
    readonly kind: string;
    readonly summary: string;
}
interface ListStructured {
    readonly activity: readonly TodoActivity[];
    readonly items: readonly TodoItem[];
    readonly list: TodoListSummary;
    readonly revision: number;
}
interface ToolResultLike {
    readonly structuredContent?: unknown;
    readonly isError?: boolean;
}

function asList(value: unknown): ListStructured | undefined {
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    if (!record.list || !Array.isArray(record.items)) return undefined;
    return record as unknown as ListStructured;
}

function shortActor(userId: string): string {
    return userId.slice(0, 2).toUpperCase();
}

function ListApp() {
    const { app, error, instance, isConnected } = useHappyApp({
        appInfo: { name: "happy2-todos-list", version: "1.0.0" },
        autoResize: true,
    });
    const listId =
        typeof instance?.context.listId === "string" ? instance.context.listId : undefined;
    const dataRevision = instance?.dataRevision;

    const [snapshot, setSnapshot] = useState<ListStructured>();
    const [loadError, setLoadError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const [draft, setDraft] = useState("");
    const [editing, setEditing] = useState<{ id: string; title: string } | undefined>(undefined);

    // Re-read the authoritative snapshot on connect and on every dataRevision
    // change, so a collaborator's edit reconciles this view without a remount.
    useEffect(() => {
        if (!app || !listId) return;
        let cancelled = false;
        void (async () => {
            try {
                const result = (await app.callServerTool({
                    name: "todos_app_list_snapshot",
                    arguments: { listId },
                })) as ToolResultLike;
                const parsed = asList(result.structuredContent);
                if (!cancelled && parsed) setSnapshot(parsed);
                if (!cancelled) setLoadError(parsed ? undefined : "This list could not be loaded.");
            } catch (cause) {
                if (!cancelled)
                    setLoadError(
                        cause instanceof Error ? cause.message : "This list could not be loaded.",
                    );
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [app, listId, dataRevision]);

    const call = async (name: string, args: Record<string, unknown>) => {
        if (!app || busy) return;
        setBusy(true);
        try {
            const result = (await app.callServerTool({ name, arguments: args })) as ToolResultLike;
            const parsed = asList(result.structuredContent);
            if (parsed) setSnapshot(parsed);
        } catch (cause) {
            setLoadError(cause instanceof Error ? cause.message : "That change did not apply.");
        } finally {
            setBusy(false);
        }
    };

    const addItem = () => {
        const title = draft.trim();
        if (!title || !listId) return;
        setDraft("");
        void call("todos_app_add_item", { listId, title });
    };
    const commitEdit = () => {
        const target = editing;
        setEditing(undefined);
        if (!target || !listId) return;
        const title = target.title.trim();
        if (!title) return;
        void call("todos_app_update_item", { listId, itemId: target.id, title });
    };

    if (error)
        return (
            <Shell>
                <Notice tone="error" title="List unavailable">
                    {error.message}
                </Notice>
            </Shell>
        );
    if (!isConnected || (!snapshot && !loadError))
        return (
            <Shell>
                <Notice tone="muted" title="Loading list">
                    One moment…
                </Notice>
            </Shell>
        );
    if (!listId)
        return (
            <Shell>
                <Notice tone="muted" title="No list selected">
                    Open a list to see its tasks.
                </Notice>
            </Shell>
        );
    if (!snapshot)
        return (
            <Shell>
                <Notice tone="error" title="List unavailable">
                    {loadError}
                </Notice>
            </Shell>
        );

    const { list, items, activity } = snapshot;
    const remaining = list.itemCount - list.completedCount;

    return (
        <Shell>
            <header className="td-head">
                <div>
                    <h1 className="td-title">{list.title}</h1>
                    <p className="td-sub">
                        {list.itemCount === 0
                            ? "No tasks yet"
                            : `${remaining} open · ${list.completedCount} done`}
                    </p>
                </div>
            </header>

            <div className="td-add">
                <input
                    aria-label="New task"
                    className="td-input"
                    disabled={busy}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") addItem();
                    }}
                    placeholder="Add a task…"
                    value={draft}
                />
                <button
                    className="td-btn td-btn-primary"
                    disabled={busy || !draft.trim()}
                    onClick={addItem}
                    type="button"
                >
                    Add
                </button>
            </div>

            {loadError ? <p className="td-error">{loadError}</p> : null}

            {items.length === 0 ? (
                <p className="td-empty">Nothing here yet — add your first task above.</p>
            ) : (
                <ul className="td-list">
                    {items.map((item) => (
                        <li
                            className="td-item"
                            data-completed={item.completed ? "" : undefined}
                            key={item.id}
                        >
                            <input
                                aria-label={
                                    item.completed
                                        ? `Mark ${item.title} not done`
                                        : `Mark ${item.title} done`
                                }
                                checked={item.completed}
                                className="td-check"
                                disabled={busy}
                                onChange={(event) =>
                                    void call("todos_app_toggle_item", {
                                        listId,
                                        itemId: item.id,
                                        completed: event.target.checked,
                                    })
                                }
                                type="checkbox"
                            />
                            {editing?.id === item.id ? (
                                <input
                                    autoFocus
                                    className="td-input td-edit"
                                    onBlur={commitEdit}
                                    onChange={(event) =>
                                        setEditing({ id: item.id, title: event.target.value })
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") commitEdit();
                                        if (event.key === "Escape") setEditing(undefined);
                                    }}
                                    value={editing.title}
                                />
                            ) : (
                                <button
                                    className="td-item-title"
                                    onClick={() => setEditing({ id: item.id, title: item.title })}
                                    title="Rename"
                                    type="button"
                                >
                                    {item.title}
                                </button>
                            )}
                            <button
                                aria-label={`Delete ${item.title}`}
                                className="td-btn td-btn-ghost td-delete"
                                disabled={busy}
                                onClick={() =>
                                    void call("todos_app_delete_item", { listId, itemId: item.id })
                                }
                                type="button"
                            >
                                Delete
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {activity.length > 0 ? (
                <section className="td-activity" aria-label="Recent activity">
                    <h2 className="td-activity-head">Activity</h2>
                    <ul className="td-activity-list">
                        {activity.slice(0, 6).map((entry) => (
                            <li className="td-activity-row" key={entry.id}>
                                <span className="td-avatar" aria-hidden="true">
                                    {shortActor(entry.actorUserId)}
                                </span>
                                <span className="td-activity-text">{entry.summary}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </Shell>
    );
}

function Shell(props: { children: ReactNode }) {
    return (
        <div className="td-root">
            <style>{SHARED_STYLES}</style>
            <div className="td-card">{props.children}</div>
        </div>
    );
}

function Notice(props: { tone: "error" | "muted"; title: string; children: ReactNode }) {
    return (
        <div
            className={`td-notice td-notice-${props.tone}`}
            role={props.tone === "error" ? "alert" : "status"}
        >
            <p className="td-notice-title">{props.title}</p>
            <p className="td-notice-body">{props.children}</p>
        </div>
    );
}

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ListApp />
    </StrictMode>,
);
