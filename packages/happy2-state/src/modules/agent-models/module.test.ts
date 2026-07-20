import { describe, expect, it, vi } from "vitest";
import type { StateRuntime } from "../runtime/runtimeState.js";
import { agentModelsLoad, agentModelsStoreCreate } from "./agentModelsState.js";

describe("agent models module", () => {
    it("loads the catalog on demand and exposes a ready snapshot", async () => {
        const operation = vi.fn(async () => ({
            defaultModelId: "gym/mock-agent",
            models: [
                {
                    id: "gym/mock-agent",
                    name: "Gym mock agent",
                    thinkingLevels: ["low", "high"],
                    defaultThinkingLevel: "high",
                },
                {
                    id: "gym/alternate-agent",
                    name: "Gym alternate agent",
                    thinkingLevels: ["low", "high"],
                    defaultThinkingLevel: "high",
                },
            ],
        }));
        const agentModels = agentModelsStoreCreate();
        expect(agentModels.getState().status.type).toBe("unloaded");
        await agentModelsLoad({
            runtime: { operation } as unknown as StateRuntime,
            agentModels,
        });
        expect(operation).toHaveBeenCalledWith("getAgentModels");
        const snapshot = agentModels.getState();
        expect(snapshot.status).toEqual({ type: "ready", value: true });
        expect(snapshot.defaultModelId).toBe("gym/mock-agent");
        expect(snapshot.models.map((model) => model.id)).toEqual([
            "gym/mock-agent",
            "gym/alternate-agent",
        ]);
    });

    it("surfaces a load failure as an error status without models", async () => {
        const agentModels = agentModelsStoreCreate();
        await agentModelsLoad({
            runtime: {
                operation: vi.fn().mockRejectedValue(new Error("catalog unavailable")),
            } as unknown as StateRuntime,
            agentModels,
        });
        expect(agentModels.getState().status.type).toBe("error");
        expect(agentModels.getState().models).toEqual([]);
    });
});
