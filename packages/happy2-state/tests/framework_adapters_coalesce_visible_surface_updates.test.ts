// @vitest-environment jsdom

import { createElement, useLayoutEffect, useSyncExternalStore } from "react";
import { act } from "react";
import { createRoot as reactRootCreate } from "react-dom/client";
import { createEffect, createRoot as solidRootCreate, createSignal, onCleanup } from "solid-js";
import { mount, tick, unmount } from "svelte";
import { describe, expect, test } from "vitest";
import SurfaceProbe from "../benchmarks/framework/SurfaceProbe.svelte";
import {
    engineFactories,
    type BenchmarkStore,
    type EngineFactory,
} from "../benchmarks/surface-store-engines.js";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

interface ValueSnapshot {
    readonly value: number;
}

interface MountedProbe {
    readonly observed: readonly string[];
    flush(): Promise<void>;
    dispose(): Promise<void>;
}

interface ProbeMount {
    readonly name: string;
    mount(
        target: HTMLElement,
        primary: BenchmarkStore<ValueSnapshot>,
        secondary: BenchmarkStore<ValueSnapshot>,
    ): Promise<MountedProbe>;
}

function snapshotIncrement(snapshot: ValueSnapshot): ValueSnapshot {
    return { value: snapshot.value + 1 };
}

function reactProbeMount(): ProbeMount {
    return {
        name: "react",
        async mount(target, primary, secondary) {
            const observed: string[] = [];
            const root = reactRootCreate(target);

            function Probe() {
                const primarySnapshot = useSyncExternalStore(primary.subscribe, primary.get);
                const secondarySnapshot = useSyncExternalStore(secondary.subscribe, secondary.get);
                const state = `${primarySnapshot.value}:${secondarySnapshot.value}`;
                useLayoutEffect(() => {
                    observed.push(state);
                }, [state]);
                return createElement("output", { "data-state": state }, state);
            }

            await act(async () => root.render(createElement(Probe)));
            return {
                observed,
                flush: async () => act(async () => undefined),
                dispose: async () => act(async () => root.unmount()),
            };
        },
    };
}

function solidProbeMount(): ProbeMount {
    return {
        name: "solid",
        async mount(target, primary, secondary) {
            const observed: string[] = [];
            const dispose = solidRootCreate((disposeRoot) => {
                const [primarySnapshot, primarySet] = createSignal(primary.get());
                const [secondarySnapshot, secondarySet] = createSignal(secondary.get());
                onCleanup(primary.subscribe(() => primarySet(primary.get())));
                onCleanup(secondary.subscribe(() => secondarySet(secondary.get())));
                const output = document.createElement("output");
                createEffect(() => {
                    const state = `${primarySnapshot().value}:${secondarySnapshot().value}`;
                    observed.push(state);
                    output.dataset.state = state;
                    output.textContent = state;
                });
                target.append(output);
                return disposeRoot;
            });
            return {
                observed,
                flush: async () => Promise.resolve(),
                dispose: async () => dispose(),
            };
        },
    };
}

function svelteProbeMount(): ProbeMount {
    return {
        name: "svelte",
        async mount(target, primary, secondary) {
            const observed: string[] = [];
            const component = mount(SurfaceProbe, {
                target,
                props: {
                    primary,
                    secondary,
                    observed: (state: string) => observed.push(state),
                },
            });
            await tick();
            return {
                observed,
                flush: tick,
                dispose: async () => unmount(component),
            };
        },
    };
}

const finalists = engineFactories.filter(
    (factory) => factory.name === "happy-owned" || factory.name === "zustand-vanilla",
);
const probeMounts = [reactProbeMount(), solidProbeMount(), svelteProbeMount()];

async function visibleStatesObserve(
    target: HTMLElement,
    operation: () => void,
    flush: () => Promise<void>,
): Promise<readonly string[]> {
    const visibleStates: string[] = [];
    // MutationObserver callbacks run after synchronous mutations and read the settled DOM. This is a
    // paint proxy, not a log of every transient attribute write; render attempts are captured by the
    // separate `observed` list above.
    const observer = new MutationObserver(() => {
        const state = target.querySelector("output")?.getAttribute("data-state");
        if (state) {
            visibleStates.push(state);
        }
    });
    observer.observe(target, { attributes: true, childList: true, subtree: true });
    operation();
    await flush();
    await Promise.resolve();
    observer.disconnect();
    return visibleStates;
}

describe.each(finalists)("$name framework adapter", (factory: EngineFactory) => {
    test.each(probeMounts)(
        "$name reaches one final visible state after sequential synchronous store updates",
        async (probeMount) => {
            const primary = factory.create<ValueSnapshot>({ value: 0 });
            const secondary = factory.create<ValueSnapshot>({ value: 0 });
            const target = document.createElement("div");
            document.body.append(target);
            const probe = await probeMount.mount(target, primary, secondary);
            const visibleStates = await visibleStatesObserve(
                target,
                () => {
                    primary.update(snapshotIncrement);
                    secondary.update(snapshotIncrement);
                },
                probe.flush,
            );

            expect(target.querySelector("output")?.getAttribute("data-state")).toBe("1:1");
            expect(probe.observed).toEqual(
                probeMount.name === "solid" ? ["0:0", "1:0", "1:1"] : ["0:0", "1:1"],
            );
            expect(visibleStates).toEqual(["1:1"]);

            await probe.dispose();
            primary.dispose();
            secondary.dispose();
            target.remove();
        },
    );

    test.each(probeMounts)(
        "$name reaches one final visible state after an external timer callback",
        async (probeMount) => {
            const primary = factory.create<ValueSnapshot>({ value: 0 });
            const secondary = factory.create<ValueSnapshot>({ value: 0 });
            const target = document.createElement("div");
            document.body.append(target);
            const probe = await probeMount.mount(target, primary, secondary);
            const visibleStates = await visibleStatesObserve(
                target,
                () => {
                    setTimeout(() => {
                        primary.update(snapshotIncrement);
                        secondary.update(snapshotIncrement);
                    }, 0);
                },
                async () => {
                    await new Promise((resolve) => setTimeout(resolve, 1));
                    await probe.flush();
                },
            );

            expect(target.querySelector("output")?.getAttribute("data-state")).toBe("1:1");
            expect(probe.observed).toEqual(
                probeMount.name === "solid" ? ["0:0", "1:0", "1:1"] : ["0:0", "1:1"],
            );
            expect(visibleStates).toEqual(["1:1"]);

            await probe.dispose();
            primary.dispose();
            secondary.dispose();
            target.remove();
        },
    );
});
