import { createStore, type StoreApi } from "zustand/vanilla";
import {
    type AgentTurnTraceDetails,
    type AgentTurnTraceSummary,
    type UserError,
} from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface AgentTraceActionContext {
    readonly runtime: StateRuntime;
    agentTraceGet(messageId: string): AgentTraceStore | undefined;
}

interface AgentTraceLoadState {
    running: boolean;
    queued: boolean;
}

const loadStates = new WeakMap<AgentTraceStore, AgentTraceLoadState>();

/**
 * Fetches the durable trace for a retained surface with single-flight
 * coalescing: a load requested while one is in flight queues exactly one
 * trailing refetch instead of racing parallel GETs, so a burst of delivery
 * hints costs at most one extra request and the final response always reflects
 * state at least as new as the last hint. Previous ready details stay visible
 * during a refresh, and completion after the lease closes is discarded.
 */
export async function agentTraceLoad(
    context: AgentTraceActionContext,
    messageId: string,
): Promise<void> {
    const binding = context.agentTraceGet(messageId);
    if (!binding) return;
    const state = loadStates.get(binding) ?? { running: false, queued: false };
    loadStates.set(binding, state);
    if (state.running) {
        state.queued = true;
        return;
    }
    state.running = true;
    try {
        if (binding.getState().trace.type !== "ready")
            binding.getState().agentTraceInput({ type: "agentTraceLoading" });
        do {
            state.queued = false;
            try {
                const result = await context.runtime.operation("getMessageAgentTrace", {
                    messageId,
                });
                if (context.agentTraceGet(messageId) !== binding) return;
                binding.getState().agentTraceInput({
                    type: "agentTraceLoaded",
                    trace: result.trace,
                });
            } catch (error) {
                if (context.agentTraceGet(messageId) !== binding) return;
                if (!state.queued)
                    binding.getState().agentTraceInput({
                        type: "agentTraceFailed",
                        error: userError(error),
                    });
            }
        } while (state.queued);
    } finally {
        state.running = false;
    }
}

/**
 * Reloads a materialized trace surface when its assistant message hints at
 * newer durable trace state, so an open panel reconciles through the GET
 * endpoint instead of trusting the delivery hint payload. A message that lost
 * its trace summary (deleted or tombstoned) also revalidates so revoked
 * content cannot keep rendering from cache; hints during an in-flight load
 * queue a trailing refetch inside agentTraceLoad rather than being dropped.
 */
export function agentTraceReconcile(
    context: AgentTraceActionContext & { agentTraceLoad(messageId: string): void },
    messageId: string,
    summary: AgentTurnTraceSummary | undefined,
): void {
    const binding = context.agentTraceGet(messageId);
    if (!binding) return;
    const current = binding.getState().trace;
    if (summary && current.type === "ready" && agentTraceSummaryEquals(current.value, summary))
        return;
    context.agentTraceLoad(messageId);
}

export interface AgentTraceOpenContext {
    agentTraceAcquire(messageId: string): AgentTraceStore;
    agentTraceRelease(messageId: string): void;
    agentTraceLoad(messageId: string): void;
}

/** Acquires one deduplicated trace surface and detaches it without discarding its cached projection. */
export function agentTraceOpen(
    context: AgentTraceOpenContext,
    messageId: string,
): AgentTraceHandle {
    const binding = context.agentTraceAcquire(messageId);
    if (binding.getState().trace.type === "unloaded") context.agentTraceLoad(messageId);
    let disposed = false;
    return {
        ...binding,
        [Symbol.dispose](): void {
            if (disposed) return;
            disposed = true;
            context.agentTraceRelease(messageId);
        },
    };
}

/** Creates one retained agent-trace surface holding the ordered turn history. */
export function agentTraceStoreCreate(messageId: string): AgentTraceStore {
    return createStore<AgentTraceState>()((set) => ({
        messageId,
        trace: { type: "unloaded" },
        agentTraceInput(event): void {
            set((snapshot) => {
                if (event.type === "agentTraceLoading")
                    return { ...snapshot, trace: { type: "loading" } };
                if (event.type === "agentTraceFailed")
                    return { ...snapshot, trace: { type: "error", error: event.error } };
                return { ...snapshot, trace: { type: "ready", value: event.trace } };
            });
        },
    }));
}

/**
 * Compares the durable details already shown with an incoming message summary
 * to decide whether the panel must refetch; text-only stream ticks keep the
 * same summary and must not trigger a GET per token.
 */
export function agentTraceSummaryEquals(
    details: AgentTurnTraceDetails,
    summary: AgentTurnTraceSummary,
): boolean {
    return (
        details.status === summary.status &&
        details.entryCount === summary.entryCount &&
        details.latest?.kind === summary.latest?.kind &&
        details.latest?.title === summary.latest?.title &&
        details.latest?.detail === summary.latest?.detail &&
        details.latest?.occurredAt === summary.latest?.occurredAt &&
        subagentsEqual(details.subagents, summary.subagents) &&
        terminalsEqual(details.backgroundTerminals, summary.backgroundTerminals)
    );
}

function subagentsEqual(
    left: AgentTurnTraceSummary["subagents"],
    right: AgentTurnTraceSummary["subagents"],
): boolean {
    return (
        left.length === right.length &&
        left.every((subagent, index) => {
            const other = right[index]!;
            return (
                subagent.id === other.id &&
                subagent.status === other.status &&
                subagent.description === other.description &&
                subagent.latestText === other.latestText &&
                subagent.totalTokens === other.totalTokens
            );
        })
    );
}

function terminalsEqual(
    left: AgentTurnTraceSummary["backgroundTerminals"],
    right: AgentTurnTraceSummary["backgroundTerminals"],
): boolean {
    return (
        left.length === right.length &&
        left.every((terminal, index) => {
            const other = right[index]!;
            return (
                terminal.id === other.id &&
                terminal.command === other.command &&
                terminal.cwd === other.cwd
            );
        })
    );
}

export interface AgentTraceSnapshot {
    readonly messageId: string;
    readonly trace: Loadable<AgentTurnTraceDetails>;
}

export type AgentTraceInput =
    | { readonly type: "agentTraceLoading" }
    | { readonly type: "agentTraceLoaded"; readonly trace: AgentTurnTraceDetails }
    | { readonly type: "agentTraceFailed"; readonly error: UserError };

export interface AgentTraceState extends AgentTraceSnapshot {
    agentTraceInput(event: AgentTraceInput): void;
}

export type AgentTraceStore = StoreApi<AgentTraceState>;

export interface AgentTraceHandle extends AgentTraceStore, Disposable {}
