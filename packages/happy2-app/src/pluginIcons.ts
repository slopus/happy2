import { useLayoutEffect, useReducer, useRef } from "react";
import type { HappyState } from "happy2-state";
type Entry = {
    url?: string;
    failed?: boolean;
};
export type PluginIcons = {
    /**
     * Reactive object URL for a catalog package icon. Returns `undefined` until
     * the PNG has been downloaded (and permanently for an icon that fails to
     * load). Keyed by catalog short name, so previously seen icons stay cached
     * for the session.
     */
    iconUrl: (shortName?: string) => string | undefined;
};
/**
 * Resolves plugin catalog short names to displayable icon URLs by downloading
 * each PNG once through the authenticated state transport and memoizing the
 * object URL. Owns the object URLs and revokes them when its owning component
 * unmounts, so icons stay live across catalog reconciliation without leaking
 * blobs.
 */
export function usePluginIcons(state: HappyState | undefined): PluginIcons {
    const [store, storeUpdate] = useReducer(
        (current: Record<string, Entry>, entry: { shortName: string; value: Entry }) => ({
            ...current,
            [entry.shortName]: entry.value,
        }),
        {},
    );
    const [requested] = useReducer((value: Set<string>) => value, new Set<string>());
    const [urls] = useReducer((value: Set<string>) => value, new Set<string>());
    const disposed = useRef(false);
    async function load(shortName: string) {
        const model = state;
        if (!model) {
            requested.delete(shortName);
            return;
        }
        try {
            const contents = await model.pluginIconDownload(shortName);
            if (disposed.current) return;
            const url = URL.createObjectURL(new Blob([contents], { type: "image/png" }));
            urls.add(url);
            storeUpdate({ shortName, value: { url } });
        } catch {
            if (!disposed.current) storeUpdate({ shortName, value: { failed: true } });
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
        iconUrl(shortName?: string): string | undefined {
            if (!shortName) return undefined;
            const entry = store[shortName];
            if (!entry && !requested.has(shortName)) {
                requested.add(shortName);
                queueMicrotask(() => void load(shortName));
            }
            return entry?.url;
        },
    };
}
