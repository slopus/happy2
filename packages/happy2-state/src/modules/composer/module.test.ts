import { describe, expect, it, vi } from "vitest";
import { UserError } from "../../types.js";
import { composerStoreCreate } from "./composerState.js";

describe("composer module", () => {
    it("applies local actions synchronously, emits typed output, and ignores stale outcomes", () => {
        const output = vi.fn();
        const binding = composerStoreCreate("chat-1", { output });
        binding.getState().textUpdate("hello");
        binding.getState().attachmentAdd({ id: "file-1", name: "a.txt", size: 3 });
        binding.getState().attachmentAdd({ id: "file-1", name: "duplicate", size: 9 });
        binding.getState().attachmentRemove("missing");
        binding.getState().textSubmit();
        const revision = binding.getState().revision;
        expect(binding.getState()).toMatchObject({
            text: "hello",
            attachments: [{ id: "file-1" }],
            submission: { status: "pending", revision },
        });
        expect(output.mock.calls.map(([event]) => event.type)).toEqual([
            "textUpdated",
            "attachmentAdded",
            "textSubmitted",
        ]);
        binding.getState().composerInput({
            type: "submissionFailed",
            revision: revision - 1,
            error: new UserError("stale"),
        });
        expect(binding.getState().submission.status).toBe("pending");
        binding.getState().composerInput({ type: "submissionConfirmed", revision });
        expect(binding.getState()).toMatchObject({
            text: "",
            attachments: [],
            submission: { status: "idle" },
        });
    });

    it("keeps audience routing off and unsent for surfaces created without an audience", () => {
        const output = vi.fn();
        const binding = composerStoreCreate("dm-1", { output });
        expect(binding.getState().audience).toBeUndefined();
        binding.getState().textUpdate("hello agent");
        binding.getState().textSubmit();
        const submitted = output.mock.calls
            .map(([event]) => event)
            .find((event) => event.type === "textSubmitted");
        expect(submitted).toMatchObject({ agentUserIds: [] });
        expect(submitted.audience).toBeUndefined();
    });

    it("toggles audience, selects agents, submits them, and keeps the mode after confirmation", () => {
        const output = vi.fn();
        const binding = composerStoreCreate("chat-1", { audience: "people", output });
        binding.getState().audienceToggle();
        expect(binding.getState().audience).toBe("agents");
        binding.getState().agentUserAdd("agent-1");
        binding.getState().agentUserAdd("agent-1");
        binding.getState().agentUserRemove("missing");
        expect(binding.getState().agentUserIds).toEqual(["agent-1"]);
        binding.getState().textUpdate("run the build");
        binding.getState().textSubmit();
        const revision = binding.getState().revision;
        const submitted = output.mock.calls
            .map(([event]) => event)
            .filter((event) => event.type === "textSubmitted");
        expect(submitted.at(-1)).toMatchObject({
            audience: "agents",
            agentUserIds: ["agent-1"],
        });
        binding.getState().composerInput({ type: "submissionConfirmed", revision });
        expect(binding.getState()).toMatchObject({
            text: "",
            audience: "agents",
            agentUserIds: ["agent-1"],
            submission: { status: "idle" },
        });
        binding.getState().audienceUpdate("people");
        binding.getState().textUpdate("hello people");
        binding.getState().textSubmit();
        const last = output.mock.calls
            .map(([event]) => event)
            .filter((event) => event.type === "textSubmitted")
            .at(-1);
        expect(last).toMatchObject({ audience: "people", agentUserIds: [] });
        expect(
            output.mock.calls
                .map(([event]) => event.type)
                .filter(
                    (type) =>
                        type === "audienceUpdated" ||
                        type === "agentUserAdded" ||
                        type === "agentUserRemoved",
                ),
        ).toEqual(["audienceUpdated", "agentUserAdded", "audienceUpdated"]);
    });

    it("keeps the agents mode through a failed submission so a retry resubmits the same audience", () => {
        const output = vi.fn();
        const binding = composerStoreCreate("chat-1", { audience: "agents", output });
        binding.getState().agentUserAdd("agent-2");
        binding.getState().textUpdate("try me");
        binding.getState().textSubmit();
        const revision = binding.getState().revision;
        binding.getState().composerInput({
            type: "submissionFailed",
            revision,
            error: new UserError("offline"),
        });
        expect(binding.getState()).toMatchObject({
            text: "try me",
            audience: "agents",
            agentUserIds: ["agent-2"],
            submission: { status: "failed", revision },
        });
        binding.getState().textSubmit();
        const submitted = output.mock.calls
            .map(([event]) => event)
            .filter((event) => event.type === "textSubmitted");
        expect(submitted).toHaveLength(2);
        expect(submitted.at(-1)).toMatchObject({
            audience: "agents",
            agentUserIds: ["agent-2"],
            revision,
        });
    });

    it("privately removes selected agents that are no longer eligible chat members", () => {
        const output = vi.fn();
        const binding = composerStoreCreate("chat-1", {
            audience: "agents",
            agentUserIds: ["agent-1", "agent-2"],
            output,
        });
        binding.getState().composerInput({
            type: "agentUsersReconciled",
            agentUserIds: ["agent-2", "agent-3"],
        });
        expect(binding.getState()).toMatchObject({
            audience: "agents",
            agentUserIds: ["agent-2"],
            revision: 1,
        });
        expect(output).not.toHaveBeenCalled();
    });

    it("keeps an in-flight submission pending while selected agents are reconciled", () => {
        const binding = composerStoreCreate("chat-1", {
            audience: "agents",
            agentUserIds: ["agent-1", "agent-2"],
        });
        binding.getState().textUpdate("run this");
        binding.getState().textSubmit();
        const revision = binding.getState().revision;
        binding.getState().composerInput({
            type: "agentUsersReconciled",
            agentUserIds: ["agent-2"],
        });
        expect(binding.getState()).toMatchObject({
            agentUserIds: ["agent-2"],
            revision,
            submission: { status: "pending", revision },
        });
        binding.getState().composerInput({ type: "submissionConfirmed", revision });
        expect(binding.getState()).toMatchObject({
            text: "",
            agentUserIds: ["agent-2"],
            submission: { status: "idle" },
        });
    });
});
