import { describe, expect, it } from "vitest";
import { createClientState, TransportError } from "../src/index";
import { createFakeServer, jsonResponse } from "../src/testing";

const agent = (effort: string) => ({
    id: "agent-1",
    username: "deep_thinker",
    firstName: "Deep",
    lastName: "Thinker",
    role: "member" as const,
    kind: "agent" as const,
    agentEffort: effort,
    createdByUserId: "owner-1",
});

const contacts = (effort: string) => ({
    users: [agent(effort)],
    presence: [],
    statuses: [],
});

describe("agent effort state", () => {
    it("reads options, retries a change with one key, and reconciles the value from a users sync", async () => {
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
            "/v0/contacts",
            jsonResponse(200, contacts("high")),
            jsonResponse(200, contacts("xhigh")),
        );
        server.respond(
            "GET",
            "/v0/agents/agent-1/effort",
            jsonResponse(200, {
                agentUserId: "agent-1",
                effort: "high",
                options: ["low", "medium", "high", "xhigh"],
            }),
        );

        let changeAttempt = 0;
        server.route("POST", "/v0/agents/agent-1/changeEffort", () => {
            changeAttempt += 1;
            if (changeAttempt === 1) throw new TransportError("response dropped");
            return jsonResponse(200, {
                agent: agent("low"),
                agentUserId: "agent-1",
                effort: "low",
                options: ["low", "medium", "high", "xhigh"],
                sync: { areas: ["users"] },
            });
        });

        const state = createClientState(server.transport, {
            createId: () => "stable-agent-effort-key",
            sleep: async () => undefined,
        });
        await state.start();

        await expect(state.execute("getContacts")).resolves.toMatchObject({
            users: [{ agentEffort: "high" }],
        });
        await expect(state.execute("getAgentEffort", { agentUserId: "agent-1" })).resolves.toEqual({
            agentUserId: "agent-1",
            effort: "high",
            options: ["low", "medium", "high", "xhigh"],
        });

        const changed = await state.execute("changeAgentEffort", {
            agentUserId: "agent-1",
            effort: "low",
        });
        expect(changed).toMatchObject({ agentUserId: "agent-1", effort: "low" });

        const changeRequests = server.requests.filter(
            ({ path }) => path === "/v0/agents/agent-1/changeEffort",
        );
        expect(changeRequests).toHaveLength(2);
        expect(changeRequests.map(({ headers }) => headers?.["idempotency-key"])).toEqual([
            "stable-agent-effort-key",
            "stable-agent-effort-key",
        ]);
        expect(changeRequests[1]?.body).toEqual({ effort: "low" });

        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "difference",
                changedChats: [],
                removedChatIds: [],
                areas: ["users"],
                state: { protocolVersion: 1, generation: "g", sequence: "3" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "3" },
            }),
        );
        server.events.sync({ sequence: "3", areas: ["users"] });
        await state.whenIdle();

        expect(state.result("getContacts")).toMatchObject({
            users: [{ agentEffort: "xhigh" }],
        });
        expect(Object.isFrozen(state.result("getContacts"))).toBe(true);
    });
});
