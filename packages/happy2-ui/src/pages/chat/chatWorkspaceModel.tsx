import { createEffect, createMemo, createSignal, type Accessor } from "solid-js";
import type { WorkspaceFileStore, WorkspaceStore } from "happy2-state";
import { Banner } from "./ChatPageComponents.js";
import type { ChatPageActions } from "./ChatPage.js";
import { createDynamicSnapshot } from "./chatStoreBindings.js";
import { workspaceNodes } from "./workspaceTree.js";

export function chatWorkspaceModelCreate(options: {
    activeChatId(): string;
    actions: ChatPageActions;
    workspace?: WorkspaceStore;
    workspaceFile?: WorkspaceFileStore;
    openPath: Accessor<string | undefined>;
}) {
    const workspaceReader = createDynamicSnapshot<ReturnType<WorkspaceStore["get"]>>();
    const fileReader = createDynamicSnapshot<ReturnType<WorkspaceFileStore["get"]>>();
    createEffect(() => workspaceReader.follow(options.workspace));
    createEffect(() => fileReader.follow(options.workspaceFile));
    const workspaceSnapshot = workspaceReader.snapshot;
    const fileSnapshot = fileReader.snapshot;
    const [selected, setSelected] = createSignal<string>();
    const [loadingPaths, setLoadingPaths] = createSignal<string[]>([]);
    const openPath = options.openPath;

    const workspace = () => {
        const status = workspaceSnapshot()?.status;
        return status?.type === "ready" ? status.value : undefined;
    };
    const tree = createMemo(() =>
        workspace()
            ? workspaceNodes(
                  workspace()!,
                  new Set(workspaceSnapshot()?.requestedDirectories ?? []),
                  new Set(loadingPaths()),
              )
            : [],
    );
    function panelOpen() {
        const chatId = options.activeChatId();
        if (chatId) options.actions.workspaceOpen(chatId);
    }
    function panelClose() {
        options.actions.workspaceClose();
    }
    function directoryToggle(path: string) {
        if (!options.workspace) return;
        const next = new Set(workspaceSnapshot()?.requestedDirectories ?? []);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        setLoadingPaths([path]);
        options.workspace.directoriesUpdate([...next]);
        queueMicrotask(() => setLoadingPaths([]));
    }
    function directoryMore(path: string) {
        setLoadingPaths([path]);
        options.workspace?.directoryMore(path);
        queueMicrotask(() => setLoadingPaths([]));
    }
    function entrySelect(path: string) {
        setSelected(path);
        if (path.endsWith("/")) directoryToggle(path);
        else fileOpen(path);
    }
    function fileOpen(path: string) {
        options.actions.workspaceFileOpen(options.activeChatId(), path);
    }
    function fileClose() {
        options.actions.workspaceFileClose();
    }
    const fileBase = () => {
        const file = fileSnapshot()?.file;
        return file?.type === "ready" ? file.value : undefined;
    };
    const fileContent = () => fileSnapshot()?.content ?? "";
    const fileSaving = () => fileSnapshot()?.saveState.type === "saving";
    const fileDirty = () => fileSnapshot()?.saveState.type === "dirty";
    const fileConflict = () => fileSnapshot()?.saveState.type === "conflict";
    const fileStatus = () => {
        const save = fileSnapshot()?.saveState;
        if (save?.type === "saving") return "Saving…";
        if (save?.type === "conflict") return "Conflict";
        if (save?.type === "error") return save.error.message;
        if (save?.type === "dirty") return "Unsaved";
        return fileBase() ? formatBytes(fileBase()!.size) : "";
    };
    const fileBanner = () =>
        fileConflict() ? (
            <Banner
                action={{
                    label: "Reload",
                    onClick: () =>
                        options.actions.workspaceFileReload(options.activeChatId(), openPath()!),
                }}
                tone="danger"
            >
                This file changed on disk and your edits overlap. Reload to discard your changes.
            </Banner>
        ) : undefined;

    return {
        workspaceSnapshot,
        workspace,
        tree,
        selected,
        panelOpen,
        panelClose,
        directoryToggle,
        directoryMore,
        entrySelect,
        openPath,
        fileClose,
        fileBase,
        fileContent,
        fileSaving,
        fileDirty,
        fileStatus,
        fileBanner,
    };
}

function formatBytes(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
    return `${Math.round(size / (102.4 * 1024)) / 10} MB`;
}
