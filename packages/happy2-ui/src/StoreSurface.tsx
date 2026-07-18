import { useSyncExternalStore, type ReactNode } from "react";
import type { StoreApi } from "zustand/vanilla";

type StoreState<Store> = Store extends StoreApi<infer State> ? State : never;

export interface StoreSurfaceProps<Store extends StoreApi<object>> {
    /** One independently materialized product-surface store. */
    store: Store;
    /**
     * Maps the immutable render-ready snapshot into props-only visual components. The store is the
     * same safe public contract supplied by the owner, so local actions never need callback shims.
     */
    children: (snapshot: StoreState<Store>, actions: StoreState<Store>) => ReactNode;
}
/**
 * Makes any concrete HappyState surface store directly renderable by React while keeping visual
 * primitives props-only. The boundary owns exactly one subscription. It observes `props.store` so
 * keyed UI can reuse the mounted boundary safely: changing the store identity synchronously reads
 * the replacement snapshot, disposes the previous subscription, and installs one replacement.
 * It performs no fetching, persistence, authentication, or transport work.
 */
export function StoreSurface<Store extends StoreApi<object>>(props: StoreSurfaceProps<Store>) {
    return <BoundStoreSurface key={storeKey(props.store)} {...props} />;
}

const storeKeys = new WeakMap<object, number>();
let nextStoreKey = 0;

function storeKey(store: object): number {
    const current = storeKeys.get(store);
    if (current !== undefined) return current;
    const created = nextStoreKey++;
    storeKeys.set(store, created);
    return created;
}

function BoundStoreSurface<Store extends StoreApi<object>>(props: StoreSurfaceProps<Store>) {
    type Snapshot = StoreState<Store>;
    const snapshot = useSyncExternalStore(
        props.store.subscribe,
        () => props.store.getState() as Snapshot,
        () => props.store.getInitialState() as Snapshot,
    );
    return <>{props.children(snapshot, snapshot)}</>;
}
