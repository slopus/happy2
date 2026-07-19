import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DirectorySnapshot, SidebarSnapshot } from "happy2-state";
import type { StoreApi } from "zustand/vanilla";

const emptySubscribe = () => () => undefined;
const emptySnapshot = () => undefined;

export function useOptionalStoreSnapshot<Snapshot extends object>(
    store?: StoreApi<Snapshot>,
): Snapshot | undefined {
    return useSyncExternalStore(
        store?.subscribe ?? emptySubscribe,
        store ? store.getState : emptySnapshot,
        store ? store.getInitialState : emptySnapshot,
    );
}

export function useStoreSnapshot<Snapshot extends object>(store: StoreApi<Snapshot>): Snapshot {
    return useSyncExternalStore(store.subscribe, store.getState, store.getInitialState);
}

export function useAvatarImages(actions: { fileDownload(fileId: string): Promise<ArrayBuffer> }) {
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [requested] = useState(() => new Set<string>());
    const [owned] = useState(() => new Set<string>());
    const disposed = useRef(false);
    async function load(fileId: string) {
        try {
            const contents = await actions.fileDownload(fileId);
            if (disposed.current) return;
            const url = URL.createObjectURL(new Blob([contents]));
            owned.add(url);
            setUrls((current) => ({ ...current, [fileId]: url }));
        } catch {
            // An avatar is optional; the initials remain visible on failure.
        }
    }
    useLayoutEffect(() => {
        disposed.current = false;
        return () => {
            disposed.current = true;
            for (const url of owned) URL.revokeObjectURL(url);
        };
    }, [owned]);
    return {
        imageUrl(fileId?: string) {
            if (!fileId) return undefined;
            if (!requested.has(fileId)) {
                requested.add(fileId);
                queueMicrotask(() => void load(fileId));
            }
            return urls[fileId];
        },
    };
}
export function usePluginRequestImages(actions: {
    pluginRequestImageDownload?(chatId: string, requestId: string): Promise<ArrayBuffer>;
}) {
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [requested] = useState(() => new Set<string>());
    const [owned] = useState(() => new Set<string>());
    const disposed = useRef(false);
    async function load(chatId: string, requestId: string, key: string) {
        try {
            const contents = await actions.pluginRequestImageDownload!(chatId, requestId);
            if (disposed.current) return;
            const url = URL.createObjectURL(new Blob([contents], { type: "image/png" }));
            owned.add(url);
            setUrls((current) => ({ ...current, [key]: url }));
        } catch {
            // The staged image is optional; the glyph fallback remains visible.
        }
    }
    useLayoutEffect(() => {
        disposed.current = false;
        return () => {
            disposed.current = true;
            for (const url of owned) URL.revokeObjectURL(url);
        };
    }, [owned]);
    return {
        /**
         * Reactive object URL for one staged request image. `available` gates the
         * download to pending/processing requests whose package is still staged;
         * a previously downloaded image stays cached for the terminal card.
         */
        imageUrl(chatId: string, requestId: string, available: boolean) {
            const key = `${chatId}\u0000${requestId}`;
            if (available && actions.pluginRequestImageDownload && !requested.has(key)) {
                requested.add(key);
                queueMicrotask(() => void load(chatId, requestId, key));
            }
            return urls[key];
        },
    };
}

export function createAvatarProjection(options: {
    user: () => {
        id: string;
        photoFileId?: string;
    };
    sidebarSnapshot: () => SidebarSnapshot;
    directorySnapshot: () => DirectorySnapshot;
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
