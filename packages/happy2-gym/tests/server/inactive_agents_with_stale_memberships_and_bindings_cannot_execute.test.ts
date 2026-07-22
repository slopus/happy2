import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { createMockRigDaemon, MockAgentSandboxRuntime } from "happy2-gym/rig";
import { createGymServer } from "../../sources/index.js";

describe("inactive agent execution authority", () => {
    it("rejects new turns and bindings and does not resume queued work after restart", async () => {
        await using rig = await createMockRigDaemon();
        await using server = await createGymServer({
            agentSandbox: new MockAgentSandboxRuntime(),
            databaseMode: "file",
            configure(config) {
                config.agents.enabled = true;
                config.agents.socketPath = rig.socketPath;
                config.agents.tokenPath = rig.tokenPath;
                config.agents.defaultCwd = rig.workspaceRoot;
            },
        });
        const owner = await server.createUser({ username: "inactive_agent_owner" });
        const client = server.as(owner);
        const created = await client.post("/v0/chats/createAgent", {
            name: "Dormant Agent",
            username: "dormant_agent",
        });
        expect(created.statusCode).toBe(201);
        const boundChatId = created.json().chat.id as string;
        const contacts = (await client.get("/v0/contacts")).json().users as Array<{
            id: string;
            kind: string;
            username: string;
        }>;
        const agent = contacts.find(
            ({ kind, username }) => kind === "agent" && username === "dormant_agent",
        );
        if (!agent) throw new Error("The dormant agent identity was not created");
        const unbound = await client.post("/v0/chats/createAgentConversation", {
            agentUserId: agent.id,
        });
        expect(unbound.statusCode).toBe(201);
        const unboundChatId = unbound.json().chat.id as string;

        rig.pauseSubmissions();
        const queued = await client.post(`/v0/chats/${boundChatId}/sendMessage`, {
            text: "Do not execute after deactivation",
            clientMutationId: "inactive-agent-queued-turn",
        });
        expect(queued.statusCode).toBe(201);
        await waitFor(
            () => rig.submissionAttemptCount > 0,
            "the queued turn to reach the paused Rig boundary",
        );
        const attemptsBeforeRestart = rig.submissionAttemptCount;

        await server.restart({
            beforeStart: async () => {
                const database = createClient({ url: server.config.database.url });
                try {
                    await database.execute({
                        sql: "UPDATE users SET active = 0 WHERE id = ?",
                        args: [agent.id],
                    });
                } finally {
                    database.close();
                }
            },
        });
        rig.resumeSubmissions();
        await new Promise((resolve) => setTimeout(resolve, 250));

        expect(rig.submittedTexts).toEqual([]);
        expect(rig.submissionAttemptCount).toBe(attemptsBeforeRestart);
        const rejectedTurn = await client.post(`/v0/chats/${boundChatId}/sendMessage`, {
            audience: "agents",
            text: "This must not queue",
            clientMutationId: "inactive-agent-rejected-turn",
        });
        expect(rejectedTurn.statusCode).toBe(400);
        expect(rejectedTurn.json().message).toContain("no executable agent");
        const rejectedBind = await client.post(
            `/v0/chats/${unboundChatId}/agents/${agent.id}/terminals/createTerminal`,
            { cols: 80, rows: 24 },
        );
        expect(rejectedBind.statusCode).toBe(404);

        const probe = createClient({ url: server.config.database.url });
        try {
            const memberships = await probe.execute({
                sql: "SELECT chat_id FROM chat_members WHERE user_id = ? AND left_at IS NULL ORDER BY chat_id",
                args: [agent.id],
            });
            expect(memberships.rows.map(({ chat_id }) => chat_id)).toEqual(
                [boundChatId, unboundChatId].sort(),
            );
            const bindings = await probe.execute({
                sql: "SELECT chat_id, session_id FROM agent_rig_bindings WHERE user_id = ?",
                args: [agent.id],
            });
            expect(bindings.rows).toHaveLength(1);
            expect(bindings.rows[0]).toMatchObject({ chat_id: boundChatId });
            const turns = await probe.execute({
                sql: "SELECT status, worker_id, run_id FROM agent_turns WHERE agent_user_id = ?",
                args: [agent.id],
            });
            expect(turns.rows).toEqual([
                expect.objectContaining({ status: "running", worker_id: null, run_id: null }),
            ]);
            const output = await probe.execute({
                sql: "SELECT text, published_at FROM messages WHERE sender_user_id = ?",
                args: [agent.id],
            });
            expect(output.rows).toEqual([{ published_at: null, text: "" }]);
        } finally {
            probe.close();
        }
    });
});

async function waitFor(check: () => boolean, description: string, timeoutMs = 2_000) {
    const deadline = Date.now() + timeoutMs;
    while (!check()) {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}
