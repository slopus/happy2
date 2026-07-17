import type { EngineName } from "./surface-store-engines.js";

export const selectedEngine: EngineName = "zustand-vanilla";

/**
 * The Happy-owned reference and Zustand were the finalists because both implement the required
 * coarse external-store contract directly, release their graphs completely, and produced identical
 * React, Solid, and Svelte observations. Alien Signals was competitive in the core loop, but its
 * effect graph adds lifecycle machinery that this snapshot topology does not use; Preact Signals and
 * Nano Stores were slower on common paths.
 *
 * The finalist timings are within measurement noise, so they are intentionally not the tiebreaker.
 * Zustand wins on production simplicity: `zustand/vanilla` is a tiny, maintained, battle-tested
 * implementation of the exact synchronous get/set/subscribe semantics we need. Owning the reference
 * implementation would make Happy responsible for listener iteration, reentrancy, and future edge
 * cases forever merely to avoid one small dependency. The engine remains private behind Happy's
 * `ReadonlyStore<T>` contract; no Zustand hook, selector, `useShallow`, or setter becomes public API.
 */
export const selectionRationale = {
    finalists: ["happy-owned", "zustand-vanilla"],
    decisionBasis: "maintained synchronous external-store semantics within measured parity",
} as const;

export const benchmarkFixtureContract = {
    messages: 4_096,
    avatarOccurrences: 4_096,
    surfaceSubscriptions: 4,
} as const;

export const selectedEngineThresholds = {
    semanticNoopNotifications: 0,
    ignoredPresenceNotifications: 0,
    messageReplaceP99Microseconds: 50,
    outputFanoutP99Microseconds: 50,
    rareAvatarP99Microseconds: 250,
    retainedHeapBytes: 8 * 1_024 * 1_024,
} as const;

/**
 * Median of seven Apple Silicon/Node 25 runs on 2026-07-17. These figures are evidence for engine
 * selection, not hard CI timing assertions; the deliberately wider limits above are the regression
 * gate. All durations are microseconds per operation and compare identical immutable reducers/data
 * shapes. Each sample batches operations before dividing the elapsed duration to stay above timer
 * resolution.
 */
export const selectionEvidence = {
    "happy-owned": {
        coldCreateP50: 0.186,
        chatOpenCloseP50: 0.688,
        messageReplaceP50: 0.642,
        outputFanoutP50: 0.11,
        rareAvatarP50: 26.5,
    },
    "alien-signals": {
        coldCreateP50: 0.064,
        chatOpenCloseP50: 0.683,
        messageReplaceP50: 0.696,
        outputFanoutP50: 0.221,
        rareAvatarP50: 27.917,
    },
    "preact-signals-core": {
        coldCreateP50: 0.207,
        chatOpenCloseP50: 1.017,
        messageReplaceP50: 0.771,
        outputFanoutP50: 0.275,
        rareAvatarP50: 27.209,
    },
    nanostores: {
        coldCreateP50: 0.372,
        chatOpenCloseP50: 3.529,
        messageReplaceP50: 2.858,
        outputFanoutP50: 0.256,
        rareAvatarP50: 26.375,
    },
    "zustand-vanilla": {
        coldCreateP50: 0.083,
        chatOpenCloseP50: 0.775,
        messageReplaceP50: 0.771,
        outputFanoutP50: 0.165,
        rareAvatarP50: 26.542,
    },
} as const satisfies Readonly<Record<EngineName, Readonly<Record<string, number>>>>;
