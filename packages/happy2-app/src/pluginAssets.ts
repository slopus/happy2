import { useLayoutEffect, useReducer, useRef } from "react";
import type { HappyState } from "happy2-state";

type Entry = {
    url?: string;
    failed?: boolean;
};

export interface PluginAssetMasks {
    /**
     * Reactive same-origin blob URL for an installation's authenticated
     * monochrome PNG asset, keyed by `(installationId, assetId)`. Returns
     * `undefined` until the bytes are downloaded and permanently for an asset
     * that fails to load. The URL is meant to be painted as a `currentColor`
     * mask by `PluginAssetGlyph`.
     */
    maskUrl(installationId?: string, assetId?: string): string | undefined;
}

/**
 * Resolves plugin UI asset ids to displayable mask URLs by downloading each PNG
 * once through the authenticated state transport and memoizing the object URL.
 * Owns the object URLs and revokes them when the owning component unmounts, so
 * masks stay live across plugin navigation reconciliation without leaking blobs.
 * Mirrors `usePluginIcons`; the state package never exposes URLs or tokens.
 */
export function usePluginAssetMasks(state: HappyState | undefined): PluginAssetMasks {
    const [store, storeUpdate] = useReducer(
        (current: Record<string, Entry>, entry: { key: string; value: Entry }) => ({
            ...current,
            [entry.key]: entry.value,
        }),
        {},
    );
    const [requested] = useReducer((value: Set<string>) => value, new Set<string>());
    const [urls] = useReducer((value: Set<string>) => value, new Set<string>());
    const disposed = useRef(false);
    async function load(key: string, installationId: string, assetId: string) {
        const model = state;
        if (!model) {
            requested.delete(key);
            return;
        }
        try {
            const contents = await model.pluginUiAssetRead(installationId, assetId);
            if (disposed.current) return;
            const url = URL.createObjectURL(new Blob([contents], { type: "image/png" }));
            urls.add(url);
            storeUpdate({ key, value: { url } });
        } catch {
            if (!disposed.current) storeUpdate({ key, value: { failed: true } });
        }
    }
    function resolve(key: string, installationId: string, assetId: string): string | undefined {
        const entry = store[key];
        if (!entry && !requested.has(key)) {
            requested.add(key);
            queueMicrotask(() => void load(key, installationId, assetId));
        }
        return entry?.url;
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
        maskUrl(installationId?: string, assetId?: string): string | undefined {
            if (!installationId || !assetId) return undefined;
            return resolve(`${installationId}\u0000${assetId}`, installationId, assetId);
        },
    };
}
