import { createSignal, onCleanup, type Accessor } from "solid-js";
import type { DeepReadonly, DirectoryStore, ReadonlyStore, SidebarStore } from "happy2-state";

export function createDynamicSnapshot<Snapshot>(): {
    snapshot: Accessor<DeepReadonly<Snapshot> | undefined>;
    follow: (store?: ReadonlyStore<Snapshot>) => void;
} {
    const [snapshot, setSnapshot] = createSignal<DeepReadonly<Snapshot>>();
    let unsubscribe: (() => void) | undefined;
    const clear = () => {
        unsubscribe?.();
        unsubscribe = undefined;
        setSnapshot(undefined);
    };
    const follow = (store?: ReadonlyStore<Snapshot>) => {
        clear();
        if (!store) return;
        setSnapshot(() => store.get());
        unsubscribe = store.subscribe(() => setSnapshot(() => store.get()));
    };
    onCleanup(clear);
    return { snapshot, follow };
}

export function createStoreSnapshot<Snapshot>(
    store: ReadonlyStore<Snapshot>,
): Accessor<DeepReadonly<Snapshot>> {
    const [snapshot, setSnapshot] = createSignal(store.get(), { equals: false });
    onCleanup(store.subscribe(() => setSnapshot(() => store.get())));
    return snapshot;
}

export function createAvatarImages(actions: {
    fileDownload(fileId: string): Promise<ArrayBuffer>;
}) {
    const [urls, setUrls] = createSignal<Record<string, string>>({});
    const requested = new Set<string>();
    const owned = new Set<string>();
    let disposed = false;
    async function load(fileId: string) {
        try {
            const contents = await actions.fileDownload(fileId);
            if (disposed) return;
            const url = URL.createObjectURL(new Blob([contents]));
            owned.add(url);
            setUrls((current) => ({ ...current, [fileId]: url }));
        } catch {
            // An avatar is optional; the initials remain visible on failure.
        }
    }
    onCleanup(() => {
        disposed = true;
        for (const url of owned) URL.revokeObjectURL(url);
    });
    return {
        imageUrl(fileId?: string) {
            if (!fileId) return undefined;
            if (!requested.has(fileId)) {
                requested.add(fileId);
                queueMicrotask(() => void load(fileId));
            }
            return urls()[fileId];
        },
    };
}

export function createAvatarProjection(options: {
    user: Accessor<{ id: string; photoFileId?: string }>;
    sidebarSnapshot: Accessor<ReturnType<SidebarStore["get"]>>;
    directorySnapshot: Accessor<ReturnType<DirectoryStore["get"]>>;
    imageUrl(fileId?: string): string | undefined;
}) {
    const photoFiles = () => {
        const result: Record<string, string | undefined> = {};
        for (const person of options.directorySnapshot().users)
            result[person.id] = person.photoFileId;
        for (const projection of options.sidebarSnapshot().chats)
            for (const person of projection.participants) result[person.id] = person.photoFileId;
        result[options.user().id] = options.user().photoFileId;
        return result;
    };
    return (userId?: string, fallback?: string) =>
        options.imageUrl((userId ? photoFiles()[userId] : undefined) ?? fallback);
}
