import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { useHappyApp, useOpenHappyApp } from "happy2-plugin-sdk/app";
import { SHARED_STYLES } from "./shared";

/*
 * TODO list selector app (MCP Apps view). It lists every list in the shared
 * workspace, creates new lists, and opens a chosen list's own app via the SDK
 * `happy2/app-open` request. It re-reads the index whenever the instance
 * `dataRevision` advances so a collaborator's new list appears live.
 */

interface TodoListSummary {
    readonly completedCount: number;
    readonly id: string;
    readonly itemCount: number;
    readonly title: string;
}
interface IndexStructured {
    readonly lists: readonly TodoListSummary[];
    readonly revision: number;
}
interface CreateStructured {
    readonly indexRevision: number;
    readonly list: TodoListSummary;
}
interface ToolResultLike {
    readonly structuredContent?: unknown;
    readonly isError?: boolean;
}

function asIndex(value: unknown): IndexStructured | undefined {
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.lists)) return undefined;
    return record as unknown as IndexStructured;
}
function asCreate(value: unknown): CreateStructured | undefined {
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    if (!record.list) return undefined;
    return record as unknown as CreateStructured;
}

function IndexApp() {
    const { app, error, instance, isConnected } = useHappyApp({
        appInfo: { name: "happy2-todos-index", version: "1.0.0" },
        autoResize: true,
    });
    const openApp = useOpenHappyApp(app);
    const dataRevision = instance?.dataRevision;

    const [lists, setLists] = useState<readonly TodoListSummary[]>();
    const [loadError, setLoadError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const [draft, setDraft] = useState("");

    useEffect(() => {
        if (!app) return;
        let cancelled = false;
        void (async () => {
            try {
                const result = (await app.callServerTool({
                    name: "todos_app_index_snapshot",
                    arguments: {},
                })) as ToolResultLike;
                const parsed = asIndex(result.structuredContent);
                if (!cancelled && parsed) setLists(parsed.lists);
                if (!cancelled) setLoadError(parsed ? undefined : "Lists could not be loaded.");
            } catch (cause) {
                if (!cancelled)
                    setLoadError(
                        cause instanceof Error ? cause.message : "Lists could not be loaded.",
                    );
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [app, dataRevision]);

    const open = (listId: string) =>
        void openApp({ instanceKey: `todos.list.${listId}`, presentation: "primary" }).catch(
            () => undefined,
        );

    const create = async () => {
        const title = draft.trim();
        if (!app || busy || !title) return;
        setBusy(true);
        setDraft("");
        try {
            const result = (await app.callServerTool({
                name: "todos_app_create_list",
                arguments: { title },
            })) as ToolResultLike;
            const created = asCreate(result.structuredContent);
            if (created) {
                setLists((current) => [...(current ?? []), created.list]);
                open(created.list.id);
            }
        } catch (cause) {
            setLoadError(cause instanceof Error ? cause.message : "The list could not be created.");
        } finally {
            setBusy(false);
        }
    };

    if (error)
        return (
            <Shell>
                <Notice tone="error" title="Lists unavailable">
                    {error.message}
                </Notice>
            </Shell>
        );
    if (!isConnected || (!lists && !loadError))
        return (
            <Shell>
                <Notice tone="muted" title="Loading lists">
                    One moment…
                </Notice>
            </Shell>
        );

    const rows = lists ?? [];
    return (
        <Shell>
            <header className="td-head">
                <div>
                    <h1 className="td-title">TODO Lists</h1>
                    <p className="td-sub">
                        {rows.length === 0
                            ? "Create your first shared list"
                            : `${rows.length} lists`}
                    </p>
                </div>
            </header>

            <div className="td-add">
                <input
                    aria-label="New list name"
                    className="td-input"
                    disabled={busy}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") void create();
                    }}
                    placeholder="New list name…"
                    value={draft}
                />
                <button
                    className="td-btn td-btn-primary"
                    disabled={busy || !draft.trim()}
                    onClick={() => void create()}
                    type="button"
                >
                    Create
                </button>
            </div>

            {loadError ? <p className="td-error">{loadError}</p> : null}

            {rows.length === 0 ? (
                <p className="td-empty">No lists yet — name one above to get started.</p>
            ) : (
                <ul className="td-lists">
                    {rows.map((list) => {
                        const remaining = list.itemCount - list.completedCount;
                        return (
                            <li key={list.id}>
                                <button
                                    className="td-list-row"
                                    onClick={() => open(list.id)}
                                    type="button"
                                >
                                    <span className="td-list-name">{list.title}</span>
                                    <span className="td-list-meta">
                                        {list.itemCount === 0
                                            ? "empty"
                                            : `${remaining} open · ${list.completedCount} done`}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
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
        <IndexApp />
    </StrictMode>,
);
