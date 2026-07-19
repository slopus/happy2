import { describe, expect, it, vi } from "vitest";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentSkillHomeGet } from "./agentSkillHomeGet.js";

function executorWithBinding(binding: { cwd: string } | undefined): DrizzleExecutor {
    const limit = vi.fn().mockResolvedValue(binding ? [binding] : []);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    return { select: vi.fn(() => ({ from })) } as unknown as DrizzleExecutor;
}

describe("agentSkillHomeGet", () => {
    it("derives the isolated home beside the durable Rig working directory", async () => {
        await expect(
            agentSkillHomeGet(executorWithBinding({ cwd: "/sessions/run/worktree" }), "session-1"),
        ).resolves.toBe("/sessions/run/home");
    });

    it("rejects sessions without a durable Rig binding", async () => {
        await expect(agentSkillHomeGet(executorWithBinding(undefined), "missing")).rejects.toThrow(
            "Agent Rig binding was not found for skill reconciliation",
        );
    });
});
