import { describe, expect, it } from "vitest";
import { createClientState, TransportError } from "../src/index";
import { createFakeServer, jsonResponse } from "../src/testing";

const secret = (overrides: Record<string, unknown> = {}) => ({
    id: "service-api",
    description: "Service API credentials",
    environmentVariables: ["SERVICE_API_TOKEN"],
    agentUserIds: [],
    channelIds: [],
    ...overrides,
});

describe("agent secret state", () => {
    it("retries typed mutations with one key and reconciles a loaded masked list from sync", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, {
                state: { protocolVersion: 1, generation: "g", sequence: "0" },
                serverTime: "now",
            }),
        );
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [] }));
        server.respond(
            "GET",
            "/v0/admin/agentSecrets",
            jsonResponse(200, { secrets: [] }),
            jsonResponse(200, { secrets: [secret({ channelIds: ["channel-1"] })] }),
        );

        let createAttempt = 0;
        server.route("POST", "/v0/admin/agentSecrets/createSecret", () => {
            createAttempt += 1;
            if (createAttempt === 1) throw new TransportError("response dropped");
            return jsonResponse(201, { secret: secret(), sync: { sequence: "1" } });
        });
        server.respond(
            "POST",
            "/v0/admin/agentSecrets/service-api/attachToAgent",
            jsonResponse(200, {
                secret: secret({ agentUserIds: ["agent-1"] }),
                sync: { sequence: "2" },
            }),
        );

        const state = createClientState(server.transport, {
            createId: () => "stable-agent-secret-key",
            sleep: async () => undefined,
        });
        const events: unknown[] = [];
        state.subscribe((event) => events.push(event));
        await state.start();
        await expect(state.execute("getAgentSecrets")).resolves.toEqual({ secrets: [] });

        const created = await state.execute("createAgentSecret", {
            id: "service-api",
            description: "Service API credentials",
            environment: { SERVICE_API_TOKEN: "only-sent-to-the-server" },
        });
        expect(created.secret).toEqual(secret());
        expect(JSON.stringify(created)).not.toContain("only-sent-to-the-server");
        expect(JSON.stringify(events)).not.toContain("only-sent-to-the-server");
        await expect(
            state.execute("attachAgentSecretToAgent", {
                secretId: "service-api",
                agentUserId: "agent-1",
            }),
        ).resolves.toMatchObject({ secret: { agentUserIds: ["agent-1"] } });

        const mutationRequests = server.requests.filter(
            ({ path }) =>
                path === "/v0/admin/agentSecrets/createSecret" ||
                path === "/v0/admin/agentSecrets/service-api/attachToAgent",
        );
        expect(mutationRequests).toHaveLength(3);
        expect(mutationRequests.map(({ headers }) => headers?.["idempotency-key"])).toEqual([
            "stable-agent-secret-key",
            "stable-agent-secret-key",
            "stable-agent-secret-key",
        ]);
        expect(mutationRequests[0]?.body).toEqual({
            id: "service-api",
            description: "Service API credentials",
            environment: { SERVICE_API_TOKEN: "only-sent-to-the-server" },
        });
        expect(mutationRequests[2]?.body).toEqual({ agentUserId: "agent-1" });

        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "difference",
                changedChats: [],
                removedChatIds: [],
                areas: ["agent-secrets"],
                state: { protocolVersion: 1, generation: "g", sequence: "3" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "3" },
            }),
        );
        server.events.sync({ sequence: "3", areas: ["agent-secrets"] });
        await state.whenIdle();

        expect(state.result("getAgentSecrets")).toEqual({
            secrets: [secret({ channelIds: ["channel-1"] })],
        });
        expect(Object.isFrozen(state.result("getAgentSecrets"))).toBe(true);
    });
});
