import { createStore, type StoreApi } from "zustand/vanilla";
import { type AgentModelSummary } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface AgentModelsActionContext {
    readonly runtime: StateRuntime;
    readonly agentModels: AgentModelsStore;
}

/**
 * Loads the server agent-model catalog into the surface. The catalog has no realtime
 * channel and rarely changes, so it is fetched once on demand (when a model picker is
 * about to render) rather than reconciled from the difference stream.
 */
export async function agentModelsLoad(context: AgentModelsActionContext): Promise<void> {
    context.agentModels.getState().agentModelsInput({ type: "agentModelsLoading" });
    try {
        const catalog = await context.runtime.operation("getAgentModels");
        context.agentModels.getState().agentModelsInput({
            type: "agentModelsLoaded",
            defaultModelId: catalog.defaultModelId,
            models: catalog.models,
        });
    } catch (error) {
        context.agentModels
            .getState()
            .agentModelsInput({ type: "agentModelsFailed", error: userError(error) });
    }
}

/** Creates one agent-model catalog surface; the constructor opens no transport. */
export function agentModelsStoreCreate(): AgentModelsStore {
    return createStore<AgentModelsState>()((set) => ({
        status: { type: "unloaded" },
        models: [],
        agentModelsInput(event): void {
            set((snapshot) => {
                if (event.type === "agentModelsLoading")
                    return { ...snapshot, status: { type: "loading" } };
                if (event.type === "agentModelsFailed")
                    return { ...snapshot, status: { type: "error", error: event.error } };
                return {
                    status: { type: "ready", value: true },
                    defaultModelId: event.defaultModelId,
                    models: event.models,
                };
            });
        },
    }));
}

export interface AgentModelsSnapshot {
    readonly status: Loadable<true>;
    readonly defaultModelId?: string;
    readonly models: readonly AgentModelSummary[];
}

export type AgentModelsInput =
    | { readonly type: "agentModelsLoading" }
    | {
          readonly type: "agentModelsLoaded";
          readonly defaultModelId: string;
          readonly models: readonly AgentModelSummary[];
      }
    | { readonly type: "agentModelsFailed"; readonly error: import("../../types.js").UserError };

export interface AgentModelsState extends AgentModelsSnapshot {
    agentModelsInput(event: AgentModelsInput): void;
}

export type AgentModelsStore = StoreApi<AgentModelsState>;
