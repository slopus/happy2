import { createStore as zustandStoreCreate } from "zustand/vanilla";
import type { DeepReadonly, ReadonlyStore } from "./readonlyStore.js";

export interface StoreWriter<Snapshot> {
    update(reducer: (snapshot: Snapshot) => Snapshot): void;
    dispose(): void;
}

export interface StoreBinding<Snapshot> {
    readonly store: ReadonlyStore<Snapshot>;
    readonly writer: StoreWriter<Snapshot>;
}

const viteEnvironment = (import.meta as ImportMeta & { env?: { PROD?: boolean } }).env;
const shouldFreeze =
    viteEnvironment?.PROD !== true &&
    !(typeof process !== "undefined" && process.env.NODE_ENV === "production");

function freezeChanged(previous: unknown, next: unknown, seen: Set<object>): void {
    if (Object.is(previous, next) || next === null || typeof next !== "object") {
        return;
    }
    if (seen.has(next)) return;
    seen.add(next);

    if (Array.isArray(next)) {
        const previousArray = Array.isArray(previous) ? previous : [];
        for (let index = 0; index < next.length; index++) {
            freezeChanged(previousArray[index], next[index], seen);
        }
    } else {
        const previousRecord =
            previous !== null && typeof previous === "object"
                ? (previous as Readonly<Record<string, unknown>>)
                : undefined;
        for (const [key, value] of Object.entries(next)) {
            freezeChanged(previousRecord?.[key], value, seen);
        }
    }
    Object.freeze(next);
}

/** Creates the package-private mutable half and public read-only half of one surface store. */
export function storeCreate<Snapshot>(initial: Snapshot): StoreBinding<Snapshot> {
    if (shouldFreeze) freezeChanged(undefined, initial, new Set());
    const source = zustandStoreCreate<Snapshot>(() => initial);
    const subscriptions = new Set<() => void>();
    let disposed = false;

    const store: ReadonlyStore<Snapshot> = {
        get: () => source.getState() as DeepReadonly<Snapshot>,
        subscribe(listener) {
            if (disposed) return () => undefined;
            const unsubscribe = source.subscribe(listener);
            subscriptions.add(unsubscribe);
            return () => {
                if (!subscriptions.delete(unsubscribe)) return;
                unsubscribe();
            };
        },
    };

    const writer: StoreWriter<Snapshot> = {
        update(reducer): void {
            if (disposed) return;
            const previous = source.getState();
            const next = reducer(previous);
            if (Object.is(previous, next)) return;
            if (shouldFreeze) freezeChanged(previous, next, new Set());
            source.setState(next, true);
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            for (const unsubscribe of subscriptions) unsubscribe();
            subscriptions.clear();
        },
    };

    return { store, writer };
}
