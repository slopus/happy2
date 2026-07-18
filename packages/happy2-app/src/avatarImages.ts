import { onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import type { HappyState } from "happy2-state";

type Entry = { url?: string; failed?: boolean };

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
export function createAvatarImages(state: () => HappyState | undefined): AvatarImages {
    const [store, setStore] = createStore<Record<string, Entry>>({});
    const requested = new Set<string>();
    const urls = new Set<string>();
    let disposed = false;

    async function load(fileId: string) {
        const model = state();
        if (!model) {
            requested.delete(fileId);
            return;
        }
        try {
            const contents = await model.fileDownload(fileId);
            if (disposed) return;
            const url = URL.createObjectURL(new Blob([contents]));
            urls.add(url);
            setStore(fileId, { url });
        } catch {
            if (!disposed) setStore(fileId, { failed: true });
        }
    }

    onCleanup(() => {
        disposed = true;
        for (const url of urls) URL.revokeObjectURL(url);
        urls.clear();
    });

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
