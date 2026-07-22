import { createStore, type StoreApi } from "zustand/vanilla";
import {
    type McpAppView,
    type McpResourceReadResult,
    type McpToolResult,
    type UserError,
} from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface McpAppActionContext {
    readonly runtime: StateRuntime;
    mcpAppGet(messageId: string, callId: string): McpAppStore | undefined;
}

interface McpAppLoadState {
    running: boolean;
    queued: boolean;
}

const loadStates = new WeakMap<McpAppStore, McpAppLoadState>();

/**
 * Fetches one snapshotted MCP App (its durable tool call plus the validated UI
 * resource) for a retained surface with single-flight coalescing: a load
 * requested while one is in flight queues exactly one trailing refetch instead
 * of racing parallel GETs, so a burst of status hints costs at most one extra
 * request and the final response always reflects state at least as new as the
 * last hint. A previously loaded view stays visible during a refresh, and a
 * completion that lands after the lease closed is discarded.
 */
export async function mcpAppLoad(
    context: McpAppActionContext,
    messageId: string,
    callId: string,
): Promise<void> {
    const binding = context.mcpAppGet(messageId, callId);
    if (!binding) return;
    const state = loadStates.get(binding) ?? { running: false, queued: false };
    loadStates.set(binding, state);
    if (state.running) {
        state.queued = true;
        return;
    }
    state.running = true;
    try {
        if (binding.getState().view.type !== "ready")
            binding.getState().mcpAppInput({ type: "mcpAppLoading" });
        do {
            state.queued = false;
            try {
                const view = await context.runtime.operation("getMcpApp", { messageId, callId });
                if (context.mcpAppGet(messageId, callId) !== binding) return;
                binding.getState().mcpAppInput({ type: "mcpAppLoaded", view });
            } catch (error) {
                if (context.mcpAppGet(messageId, callId) !== binding) return;
                if (!state.queued)
                    binding.getState().mcpAppInput({
                        type: "mcpAppFailed",
                        error: userError(error),
                    });
            }
        } while (state.queued);
    } finally {
        state.running = false;
    }
}

/**
 * Runs one app-initiated MCP `tools/call` through the host. The request is never
 * retried and carries no idempotency key: the plugin tool may be non-idempotent
 * (advancing a cursor, mutating remote state), so a transport failure surfaces
 * once as a displayable `UserError` rather than risking a double execution. The
 * result is returned to the caller (the sandboxed app bridge) and never written
 * into the store, because it is transient interaction data, not durable app
 * state.
 */
export async function mcpAppToolCall(
    runtime: StateRuntime,
    messageId: string,
    callId: string,
    name: string,
    args: Readonly<Record<string, unknown>>,
): Promise<McpToolResult> {
    const response = await runtime.operation("callMcpAppTool", {
        messageId,
        callId,
        name,
        arguments: args,
    });
    return response.result;
}

/**
 * Runs one app-initiated MCP `resources/read` through the host and returns the
 * fetched contents to the sandboxed app bridge. Like a tool call it is not
 * written into the store; it rejects with a displayable `UserError` on failure.
 */
export async function mcpAppResourceRead(
    runtime: StateRuntime,
    messageId: string,
    callId: string,
    uri: string,
): Promise<McpResourceReadResult> {
    const response = await runtime.operation("readMcpAppResource", { messageId, callId, uri });
    return response.result;
}

export interface McpAppOpenContext {
    mcpAppAcquire(messageId: string, callId: string): McpAppStore;
    mcpAppRelease(messageId: string, callId: string): void;
    mcpAppLoad(messageId: string, callId: string): void;
    mcpAppToolCall(
        messageId: string,
        callId: string,
        name: string,
        args: Readonly<Record<string, unknown>>,
    ): Promise<McpToolResult>;
    mcpAppResourceRead(
        messageId: string,
        callId: string,
        uri: string,
    ): Promise<McpResourceReadResult>;
}

/**
 * Acquires one deduplicated MCP App surface for an assistant message's tool call
 * and detaches it without discarding its cached view. The returned handle exposes the store snapshot
 * plus the two app-initiated bridge actions (tool call, resource read) and a
 * reload trigger, so the UI glue never touches transport directly.
 */
export function mcpAppOpen(
    context: McpAppOpenContext,
    messageId: string,
    callId: string,
): McpAppHandle {
    const binding = context.mcpAppAcquire(messageId, callId);
    if (binding.getState().view.type === "unloaded") context.mcpAppLoad(messageId, callId);
    let disposed = false;
    return {
        ...binding,
        mcpAppReload(): void {
            context.mcpAppLoad(messageId, callId);
        },
        mcpAppToolCall(name, args): Promise<McpToolResult> {
            return context.mcpAppToolCall(messageId, callId, name, args);
        },
        mcpAppResourceRead(uri): Promise<McpResourceReadResult> {
            return context.mcpAppResourceRead(messageId, callId, uri);
        },
        [Symbol.dispose](): void {
            if (disposed) return;
            disposed = true;
            context.mcpAppRelease(messageId, callId);
        },
    };
}

/** Creates one retained MCP App surface holding its snapshotted view. */
export function mcpAppStoreCreate(messageId: string, callId: string): McpAppStore {
    return createStore<McpAppState>()((set) => ({
        messageId,
        callId,
        view: { type: "unloaded" },
        mcpAppInput(event): void {
            set((snapshot) => {
                if (event.type === "mcpAppLoading")
                    return { ...snapshot, view: { type: "loading" } };
                if (event.type === "mcpAppFailed")
                    return { ...snapshot, view: { type: "error", error: event.error } };
                return { ...snapshot, view: { type: "ready", value: event.view } };
            });
        },
    }));
}

export interface McpAppSnapshot {
    readonly messageId: string;
    readonly callId: string;
    readonly view: Loadable<McpAppView>;
}

export type McpAppInput =
    | { readonly type: "mcpAppLoading" }
    | { readonly type: "mcpAppLoaded"; readonly view: McpAppView }
    | { readonly type: "mcpAppFailed"; readonly error: UserError };

export interface McpAppState extends McpAppSnapshot {
    mcpAppInput(event: McpAppInput): void;
}

export type McpAppStore = StoreApi<McpAppState>;

export interface McpAppHandle extends McpAppStore, Disposable {
    /** Forces a fresh authoritative refetch of the snapshotted view. */
    mcpAppReload(): void;
    /** Proxies one app-initiated MCP `tools/call` through the host. */
    mcpAppToolCall(name: string, args: Readonly<Record<string, unknown>>): Promise<McpToolResult>;
    /** Proxies one app-initiated MCP `resources/read` through the host. */
    mcpAppResourceRead(uri: string): Promise<McpResourceReadResult>;
}
