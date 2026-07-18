import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { agentSecretsLoad, agentSecretsOutputRoute } from "./agentSecretsState.js";
import { agentSecretsStoreCreate } from "./agentSecretsState.js";

describe("agent secrets module", () => {
    it("keeps values out of snapshots and routes closed mutations into metadata", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/agentSecrets", jsonResponse(200, { secrets: [] }));
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, {
                users: [
                    {
                        id: "agent-1",
                        username: "agent",
                        firstName: "Agent",
                        role: "member",
                        kind: "agent",
                    },
                ],
                presence: [],
                statuses: [],
            }),
        );
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [] }));
        const secret = {
            id: "API_KEY",
            description: "Provider key",
            environmentVariables: ["API_KEY"],
            agentUserIds: [],
            channelIds: [],
        };
        server.respond(
            "POST",
            "/v0/admin/agentSecrets/createSecret",
            jsonResponse(200, { secret, sync: {} }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const identities = new IdentityCatalog();
        let binding: ReturnType<typeof agentSecretsStoreCreate>;
        const routed: Promise<void>[] = [];
        binding = agentSecretsStoreCreate((event) =>
            routed.push(agentSecretsOutputRoute({ runtime, identities, secrets: binding }, event)),
        );
        await agentSecretsLoad({ runtime, identities, secrets: binding });
        expect(binding.getState().agents[0]).toMatchObject({ displayName: "Agent" });
        binding.getState().secretCreate("API_KEY", "Provider key", { API_KEY: "plaintext" });
        await Promise.all(routed);
        expect(binding.getState().secrets).toMatchObject({
            type: "ready",
            value: [{ id: "API_KEY" }],
        });
        expect(JSON.stringify(binding.getState())).not.toContain("plaintext");
        expect(server.requests.at(-1)?.body).toEqual({
            id: "API_KEY",
            description: "Provider key",
            environment: { API_KEY: "plaintext" },
        });
        runtime.stop();
    });

    it("clears a previous action error before the next typed intent", () => {
        const output = vi.fn();
        const binding = agentSecretsStoreCreate(output);
        binding
            .getState()
            .agentSecretsInput({ type: "secretActionFailed", error: new Error("bad") as never });
        binding.getState().secretDelete("secret-1");
        expect(binding.getState().actionError).toBeUndefined();
        expect(output).toHaveBeenCalledWith({
            type: "secretDeleteSubmitted",
            secretId: "secret-1",
        });
    });
});
