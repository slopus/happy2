import { performance } from "node:perf_hooks";
import {
    benchmarkFixtureContract,
    selectedEngine,
    selectedEngineThresholds,
} from "./accepted-baseline.js";
import {
    benchmarkMessageCount,
    chatAvatarUpdate,
    chatDraftPreviewUpdate,
    chatMessageStreamReplace,
    chatMessageTextReplace,
    chatPresenceIgnored,
    chatReactionActorsLoad,
    chatReactionActorsRelease,
    chatReactionCounterUpdate,
    composerTextUpdate,
    happySurfaceFixtureCreate,
    sidebarDraftPreviewUpdate,
    sidebarUnreadUpdate,
    workspaceFolderReplace,
} from "./happy-surface-workload.js";
import {
    engineFactories,
    type BenchmarkStore,
    type EngineFactory,
} from "./surface-store-engines.js";

interface Distribution {
    readonly p50Microseconds: number;
    readonly p95Microseconds: number;
    readonly p99Microseconds: number;
}

interface ScenarioResult extends Distribution {
    readonly iterations: number;
    readonly samples: number;
    readonly operationsPerSample: number;
    readonly notifications: number;
    readonly selectorComputations: 0;
}

interface EngineResult {
    readonly engine: string;
    readonly scenarios: Readonly<Record<string, ScenarioResult>>;
    readonly stress: {
        readonly messages: number;
        readonly avatarOccurrences: number;
        readonly subscriptions: number;
        readonly projectionMicroseconds: number;
    };
    readonly lifecycle: {
        readonly retainedHeapBytes: number;
        readonly forcedGcMilliseconds: number;
    };
}

function percentile(sorted: readonly number[], ratio: number): number {
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]!;
}

function distribution(samples: number[]): Distribution {
    samples.sort((left, right) => left - right);
    return {
        p50Microseconds: percentile(samples, 0.5) * 1_000,
        p95Microseconds: percentile(samples, 0.95) * 1_000,
        p99Microseconds: percentile(samples, 0.99) * 1_000,
    };
}

function scenarioMeasure(
    iterations: number,
    notificationsRead: () => number,
    operation: (iteration: number) => void,
): ScenarioResult {
    for (let iteration = 0; iteration < Math.min(iterations, 500); iteration++) {
        operation(iteration);
    }
    const notificationsBefore = notificationsRead();
    const samples: number[] = [];
    const sampleCount = Math.min(iterations, 100);
    const operationsPerSample = Math.ceil(iterations / sampleCount);
    let iteration = 0;
    while (iteration < iterations) {
        const sampleOperations = Math.min(operationsPerSample, iterations - iteration);
        const started = performance.now();
        for (let sampleIteration = 0; sampleIteration < sampleOperations; sampleIteration++) {
            operation(iteration++);
        }
        samples.push((performance.now() - started) / sampleOperations);
    }
    return {
        iterations,
        samples: samples.length,
        operationsPerSample,
        notifications: notificationsRead() - notificationsBefore,
        // Coarse snapshot stores deliberately run no selector/computed graph in this harness.
        selectorComputations: 0,
        ...distribution(samples),
    };
}

function forcedGc(): number {
    if (!globalThis.gc) {
        throw new Error("Run this benchmark with --expose-gc");
    }
    const started = performance.now();
    globalThis.gc();
    return performance.now() - started;
}

function lifecycleMeasure(factory: EngineFactory): EngineResult["lifecycle"] {
    forcedGc();
    const heapBefore = process.memoryUsage().heapUsed;
    let stores: BenchmarkStore<{ readonly value: number }>[] | undefined = Array.from(
        { length: 2_000 },
        (_, index) => {
            const store = factory.create({ value: index });
            store.subscribe(() => undefined);
            store.update((snapshot) => ({ value: snapshot.value + 1 }));
            return store;
        },
    );
    for (const store of stores) {
        store.dispose();
    }
    stores = undefined;
    const forcedGcMilliseconds = forcedGc();
    return {
        retainedHeapBytes: process.memoryUsage().heapUsed - heapBefore,
        forcedGcMilliseconds,
    };
}

function engineRun(factory: EngineFactory): EngineResult {
    const fixture = happySurfaceFixtureCreate();
    const chat = factory.create(fixture.chat);
    const sidebar = factory.create(fixture.sidebar);
    const composer = factory.create(fixture.composer);
    const workspace = factory.create(fixture.workspace);
    let notifications = 0;
    const unsubscribes = [chat, sidebar, composer, workspace].map((store) =>
        store.subscribe(() => notifications++),
    );
    const scenarios: Record<string, ScenarioResult> = {};
    const notificationRead = () => notifications;
    const messageIndex = Math.floor(benchmarkMessageCount / 2);

    scenarios.coldCreate = scenarioMeasure(5_000, notificationRead, () => {
        factory.create({ value: 0 }).dispose();
    });
    scenarios.chatOpenClose = scenarioMeasure(1_000, notificationRead, (iteration) => {
        const opened = factory.create(fixture.chat);
        const unsubscribe = opened.subscribe(() => undefined);
        opened.update((snapshot) =>
            chatMessageTextReplace(snapshot, messageIndex, `open-close-${iteration}`),
        );
        unsubscribe();
        opened.dispose();
    });
    scenarios.semanticNoop = scenarioMeasure(10_000, notificationRead, () => {
        chat.update((snapshot) =>
            chatMessageTextReplace(snapshot, messageIndex, snapshot.messages[messageIndex]!.text),
        );
    });
    scenarios.sidebarUnread = scenarioMeasure(5_000, notificationRead, (iteration) => {
        sidebar.update((snapshot) => sidebarUnreadUpdate(snapshot, iteration % 2));
    });
    scenarios.messageReplace = scenarioMeasure(2_000, notificationRead, (iteration) => {
        chat.update((snapshot) =>
            chatMessageTextReplace(snapshot, messageIndex, `replacement-${iteration % 2}`),
        );
    });
    scenarios.messageStream = scenarioMeasure(2_000, notificationRead, (iteration) => {
        chat.update((snapshot) =>
            chatMessageStreamReplace(snapshot, messageIndex, `stream-${iteration % 2}`),
        );
    });
    scenarios.reactionCounter = scenarioMeasure(5_000, notificationRead, (iteration) => {
        chat.update((snapshot) => chatReactionCounterUpdate(snapshot, messageIndex, iteration % 2));
    });
    scenarios.reactionActors = scenarioMeasure(2_000, notificationRead, (iteration) => {
        chat.update((snapshot) =>
            iteration % 2 === 0
                ? chatReactionActorsLoad(snapshot, messageIndex, ["user-1", "user-2", "user-3"])
                : chatReactionActorsRelease(snapshot, messageIndex),
        );
    });
    scenarios.workspaceFolder = scenarioMeasure(2_000, notificationRead, (iteration) => {
        workspace.update((snapshot) => workspaceFolderReplace(snapshot, 64, iteration % 2));
    });
    scenarios.outputFanout = scenarioMeasure(2_000, notificationRead, (iteration) => {
        const text = `draft-${iteration % 2}`;
        composer.update((snapshot) => composerTextUpdate(snapshot, text));
        chat.update((snapshot) => chatDraftPreviewUpdate(snapshot, text));
        sidebar.update((snapshot) => sidebarDraftPreviewUpdate(snapshot, text));
    });
    scenarios.rareAvatar = scenarioMeasure(100, notificationRead, (iteration) => {
        chat.update((snapshot) => chatAvatarUpdate(snapshot, "user-7", iteration % 2));
    });
    scenarios.ignoredPresence = scenarioMeasure(10_000, notificationRead, () => {
        chat.update(chatPresenceIgnored);
    });

    const projectionStarted = performance.now();
    let avatarOccurrences = 0;
    for (const message of chat.get().messages) {
        if (message.sender.avatarVersion >= 0) {
            avatarOccurrences++;
        }
    }
    const projectionMicroseconds = (performance.now() - projectionStarted) * 1_000;
    const messageCount = chat.get().messages.length;

    for (const unsubscribe of unsubscribes) {
        unsubscribe();
    }
    chat.dispose();
    sidebar.dispose();
    composer.dispose();
    workspace.dispose();

    return {
        engine: factory.name,
        scenarios,
        stress: {
            messages: messageCount,
            avatarOccurrences,
            subscriptions: 4,
            projectionMicroseconds,
        },
        lifecycle: lifecycleMeasure(factory),
    };
}

const result = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    engines: engineFactories.map(engineRun),
};

if (process.argv.includes("--check")) {
    const selected = result.engines.find((engine) => engine.engine === selectedEngine);
    if (!selected) {
        throw new Error(`Selected engine ${selectedEngine} was not benchmarked`);
    }
    const failures = [
        selected.scenarios.semanticNoop.notifications ===
        selectedEngineThresholds.semanticNoopNotifications
            ? undefined
            : "semantic no-op notified subscribers",
        selected.scenarios.ignoredPresence.notifications ===
        selectedEngineThresholds.ignoredPresenceNotifications
            ? undefined
            : "ignored presence changed the chat surface",
        selected.scenarios.messageReplace.p99Microseconds <=
        selectedEngineThresholds.messageReplaceP99Microseconds
            ? undefined
            : "message replacement exceeded its p99 limit",
        selected.scenarios.outputFanout.p99Microseconds <=
        selectedEngineThresholds.outputFanoutP99Microseconds
            ? undefined
            : "output fan-out exceeded its p99 limit",
        selected.scenarios.rareAvatar.p99Microseconds <=
        selectedEngineThresholds.rareAvatarP99Microseconds
            ? undefined
            : "rare avatar replacement exceeded its p99 limit",
        selected.lifecycle.retainedHeapBytes <= selectedEngineThresholds.retainedHeapBytes
            ? undefined
            : "disposed stores exceeded their retained heap limit",
        selected.stress.messages === benchmarkFixtureContract.messages
            ? undefined
            : "stress fixture message count changed",
        selected.stress.avatarOccurrences === benchmarkFixtureContract.avatarOccurrences
            ? undefined
            : "stress fixture avatar count changed",
        selected.stress.subscriptions === benchmarkFixtureContract.surfaceSubscriptions
            ? undefined
            : "surface subscription budget changed",
    ].filter((failure): failure is string => failure !== undefined);
    if (failures.length > 0) {
        throw new Error(`State-kernel benchmark failed:\n- ${failures.join("\n- ")}`);
    }
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
