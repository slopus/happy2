import { useLayoutEffect, useReducer, useRef } from "react";
import type { HappyState } from "happy2-state";
type Entry = {
    url?: string;
    failed?: boolean;
};
export type AvatarImages = {
    /**
     * Reactive object URL for a user's avatar `photoFileId`. Returns `undefined`
     * until the file has been downloaded (and permanently for a file that fails
     * to load). Keyed by file id, so a new avatar id downloads a fresh image
     * while previously seen avatars stay cached for the session.
     */
    imageUrl: (fileId?: string) => string | undefined;
};
/**
 * Resolves user `photoFileId`s to displayable image URLs by downloading each
 * file once through the authenticated state transport and memoizing the object
 * URL. Owns the object URLs and revokes them when its owning component unmounts,
 * so avatars stay live for other users without leaking blobs.
 */
export function useAvatarImages(state: HappyState | undefined): AvatarImages {
    const [store, storeUpdate] = useReducer(
        (current: Record<string, Entry>, entry: { fileId: string; value: Entry }) => ({
            ...current,
            [entry.fileId]: entry.value,
        }),
        {},
    );
    const [requested] = useReducer((value: Set<string>) => value, new Set<string>());
    const [urls] = useReducer((value: Set<string>) => value, new Set<string>());
    const disposed = useRef(false);
    async function load(fileId: string) {
        const model = state;
        if (!model) {
            requested.delete(fileId);
            return;
        }
        try {
            const contents = await model.fileDownload(fileId);
            if (disposed.current) return;
            const url = URL.createObjectURL(new Blob([contents]));
            urls.add(url);
            storeUpdate({ fileId, value: { url } });
        } catch {
            if (!disposed.current) storeUpdate({ fileId, value: { failed: true } });
        }
    }
    useLayoutEffect(() => {
        disposed.current = false;
        return () => {
            disposed.current = true;
            for (const url of urls) URL.revokeObjectURL(url);
            urls.clear();
        };
    }, [urls]);
    return {
        imageUrl(fileId?: string): string | undefined {
            if (!fileId) return undefined;
            const entry = store[fileId];
            if (!entry && !requested.has(fileId)) {
                requested.add(fileId);
                queueMicrotask(() => void load(fileId));
            }
            return entry?.url;
        },
    };
}
