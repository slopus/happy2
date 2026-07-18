import type { ReadonlyStore } from "happy2-state";
import { createSignal, onCleanup, Show, type Accessor, type JSX } from "solid-js";

export interface StoreSurfaceProps<Store extends ReadonlyStore<object>> {
    /** One independently materialized product-surface store. */
    store: Store;
    /**
     * Maps the immutable render-ready snapshot into props-only visual components. The store is the
     * same safe public contract supplied by the owner, so local actions never need callback shims.
     */
    children: (snapshot: Accessor<ReturnType<Store["get"]>>, store: Store) => JSX.Element;
}

/**
 * Makes any concrete HappyState surface store directly renderable by Solid while keeping visual
 * primitives props-only. The boundary owns exactly one subscription. It observes `props.store` so
 * keyed UI can reuse the mounted boundary safely: changing the store identity synchronously reads
 * the replacement snapshot, disposes the previous subscription, and installs one replacement.
 * It performs no fetching, persistence, authentication, or transport work.
 */
export function StoreSurface<Store extends ReadonlyStore<object>>(props: StoreSurfaceProps<Store>) {
    return (
        <Show keyed when={props.store}>
            {(store) => <BoundStoreSurface children={props.children} store={store} />}
        </Show>
    );
}

function BoundStoreSurface<Store extends ReadonlyStore<object>>(props: StoreSurfaceProps<Store>) {
    type Snapshot = ReturnType<Store["get"]>;
    // TypeScript widens a generic method call to the ReadonlyStore constraint; the public child
    // contract still retains the concrete store's exact get() return type through ReturnType above.
    const read = (store: Store) => store.get() as Snapshot;
    const initial = read(props.store);
    const [snapshot, setSnapshot] = createSignal<Snapshot>(initial, { equals: false });
    const unsubscribe = props.store.subscribe(() => setSnapshot(() => read(props.store)));
    onCleanup(unsubscribe);
    const latest = read(props.store);
    if (latest !== initial) setSnapshot(() => latest);

    // Invoke the render child exactly once for this store identity. Snapshot changes now update
    // only the Solid expressions that read the accessor, preserving DOM nodes, focus, selection,
    // scroll state, and component-local state across synchronous store notifications.
    return <>{props.children(snapshot, props.store)}</>;
}
