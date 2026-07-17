import { signal as preactSignal } from "@preact/signals-core";
import { effect as alienEffect, signal as alienSignal } from "alien-signals";
import { atom } from "nanostores";
import { createStore as zustandCreateStore } from "zustand/vanilla";

export const engineNames = [
    "happy-owned",
    "alien-signals",
    "preact-signals-core",
    "nanostores",
    "zustand-vanilla",
] as const;

export type EngineName = (typeof engineNames)[number];

export interface BenchmarkStore<Snapshot> {
    get(): Snapshot;
    update(reducer: (snapshot: Snapshot) => Snapshot): void;
    subscribe(listener: () => void): () => void;
    dispose(): void;
}

export interface EngineFactory {
    readonly name: EngineName;
    create<Snapshot>(initial: Snapshot): BenchmarkStore<Snapshot>;
}

function disposableSubscribe(
    disposals: Set<() => void>,
    subscribe: (listener: () => void) => () => void,
    listener: () => void,
): () => void {
    const unsubscribe = subscribe(listener);
    disposals.add(unsubscribe);

    return () => {
        if (disposals.delete(unsubscribe)) {
            unsubscribe();
        }
    };
}

const happyOwnedFactory: EngineFactory = {
    name: "happy-owned",
    create<Snapshot>(initial: Snapshot): BenchmarkStore<Snapshot> {
        let snapshot = initial;
        const listeners = new Set<() => void>();

        return {
            get: () => snapshot,
            update(reducer): void {
                const next = reducer(snapshot);
                if (Object.is(next, snapshot)) {
                    return;
                }
                snapshot = next;
                for (const listener of listeners) {
                    listener();
                }
            },
            subscribe(listener) {
                listeners.add(listener);
                return () => {
                    listeners.delete(listener);
                };
            },
            dispose(): void {
                listeners.clear();
            },
        };
    },
};

const alienSignalsFactory: EngineFactory = {
    name: "alien-signals",
    create<Snapshot>(initial: Snapshot): BenchmarkStore<Snapshot> {
        const source = alienSignal(initial);
        const disposals = new Set<() => void>();

        return {
            get: source,
            update(reducer): void {
                const previous = source();
                const next = reducer(previous);
                if (!Object.is(next, previous)) {
                    source(next);
                }
            },
            subscribe(listener) {
                return disposableSubscribe(
                    disposals,
                    (currentListener) => {
                        let initialized = false;
                        const stop = alienEffect(() => {
                            source();
                            if (initialized) {
                                currentListener();
                            } else {
                                initialized = true;
                            }
                        });
                        return stop;
                    },
                    listener,
                );
            },
            dispose(): void {
                for (const dispose of disposals) {
                    dispose();
                }
                disposals.clear();
            },
        };
    },
};

const preactSignalsFactory: EngineFactory = {
    name: "preact-signals-core",
    create<Snapshot>(initial: Snapshot): BenchmarkStore<Snapshot> {
        const source = preactSignal(initial);
        const disposals = new Set<() => void>();

        return {
            get: () => source.peek(),
            update(reducer): void {
                const previous = source.peek();
                const next = reducer(previous);
                if (!Object.is(next, previous)) {
                    source.value = next;
                }
            },
            subscribe(listener) {
                return disposableSubscribe(
                    disposals,
                    (currentListener) => {
                        let initialized = false;
                        return source.subscribe(() => {
                            if (initialized) {
                                currentListener();
                            } else {
                                initialized = true;
                            }
                        });
                    },
                    listener,
                );
            },
            dispose(): void {
                for (const dispose of disposals) {
                    dispose();
                }
                disposals.clear();
            },
        };
    },
};

const nanoStoresFactory: EngineFactory = {
    name: "nanostores",
    create<Snapshot>(initial: Snapshot): BenchmarkStore<Snapshot> {
        const source = atom(initial);
        const disposals = new Set<() => void>();

        return {
            get: () => source.get(),
            update(reducer): void {
                const previous = source.get();
                const next = reducer(previous);
                if (!Object.is(next, previous)) {
                    source.set(next);
                }
            },
            subscribe(listener) {
                return disposableSubscribe(
                    disposals,
                    (currentListener) => source.listen(currentListener),
                    listener,
                );
            },
            dispose(): void {
                for (const dispose of disposals) {
                    dispose();
                }
                disposals.clear();
                source.off();
            },
        };
    },
};

const zustandVanillaFactory: EngineFactory = {
    name: "zustand-vanilla",
    create<Snapshot>(initial: Snapshot): BenchmarkStore<Snapshot> {
        const source = zustandCreateStore<Snapshot>(() => initial);
        const disposals = new Set<() => void>();

        return {
            get: source.getState,
            update(reducer): void {
                source.setState(reducer, true);
            },
            subscribe(listener) {
                return disposableSubscribe(
                    disposals,
                    (currentListener) => source.subscribe(currentListener),
                    listener,
                );
            },
            dispose(): void {
                for (const dispose of disposals) {
                    dispose();
                }
                disposals.clear();
            },
        };
    },
};

export const engineFactories: readonly EngineFactory[] = [
    happyOwnedFactory,
    alienSignalsFactory,
    preactSignalsFactory,
    nanoStoresFactory,
    zustandVanillaFactory,
];
