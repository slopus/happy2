import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { IdentityCatalog } from "../identity/identityCatalog.js";
import { StateRuntime } from "../runtime/stateRuntime.js";
import { agentSecretsLoad, agentSecretsOutputRoute } from "./agentSecretsRoute.js";
import { agentSecretsStoreCreateBinding } from "./agentSecretsStore.js";

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
        let binding: ReturnType<typeof agentSecretsStoreCreateBinding>;
        const routed: Promise<void>[] = [];
        binding = agentSecretsStoreCreateBinding((event) =>
            routed.push(agentSecretsOutputRoute({ runtime, identities, secrets: binding }, event)),
        );
        await agentSecretsLoad({ runtime, identities, secrets: binding });
        expect(binding.store.get().agents[0]).toMatchObject({ displayName: "Agent" });
        binding.store.secretCreate("API_KEY", "Provider key", { API_KEY: "plaintext" });
        await Promise.all(routed);
        expect(binding.store.get().secrets).toMatchObject({
            type: "ready",
            value: [{ id: "API_KEY" }],
        });
        expect(JSON.stringify(binding.store.get())).not.toContain("plaintext");
        expect(server.requests.at(-1)?.body).toEqual({
            id: "API_KEY",
            description: "Provider key",
            environment: { API_KEY: "plaintext" },
        });
        runtime.stop();
        binding.dispose();
    });

    it("clears a previous action error before the next typed intent", () => {
        const output = vi.fn();
        const binding = agentSecretsStoreCreateBinding(output);
        binding.agentSecretsInput({ type: "secretActionFailed", error: new Error("bad") as never });
        binding.store.secretDelete("secret-1");
        expect(binding.store.get().actionError).toBeUndefined();
        expect(output).toHaveBeenCalledWith({
            type: "secretDeleteSubmitted",
            secretId: "secret-1",
        });
        binding.dispose();
        binding.store.secretDelete("ignored");
        expect(output).toHaveBeenCalledTimes(1);
    });
});
