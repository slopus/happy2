import { describe, expect, it, vi } from "vitest";
import * as publicState from "../src/index.js";
import { happyStateCreate, composerStoreCreate, UserError } from "../src/index.js";
import { composerStoreFixtureCreate } from "../src/testing/index.js";

describe("composer micro-store boundaries", () => {
    it("works standalone, mutates synchronously, and emits typed output after notification", () => {
        const order: string[] = [];
        const output = vi.fn((event) => order.push(`output:${event.type}`));
        const composer = composerStoreCreate("chat-1", { output });
        composer.subscribe(() => order.push(`state:${composer.getState().text}`));

        const result = composer.getState().textUpdate("hello");
        expect(result).toBeUndefined();
        expect(composer.getState()).toMatchObject({ text: "hello", revision: 1 });
        expect(order).toEqual(["state:hello", "output:textUpdated"]);

        composer.getState().textUpdate("hello");
        expect(order).toHaveLength(2);
        expect(output).toHaveBeenCalledTimes(1);
    });

    it("provides explicit attachment and submit actions with no generic field mutation", () => {
        const output = vi.fn();
        const composer = composerStoreCreate("chat-1", { output });
        const attachment = { id: "file-1", name: "notes.txt", size: 12 } as const;

        composer.getState().attachmentAdd(attachment);
        composer.getState().attachmentAdd(attachment);
        composer.getState().attachmentRemove("missing");
        composer.getState().textSubmit();

        expect(composer.getState().attachments).toEqual([attachment]);
        expect(composer.getState().submission).toEqual({ status: "pending", revision: 1 });
        expect(output.mock.calls.map(([event]) => event.type)).toEqual([
            "attachmentAdded",
            "textSubmitted",
        ]);
        expect("setField" in composer).toBe(false);
        expect("updateField" in composer).toBe(false);
    });

    it("applies authoritative input without re-emitting output", () => {
        const output = vi.fn();
        const binding = composerStoreCreate("chat-1", { output });
        binding.getState().textUpdate("send me");
        binding.getState().textSubmit();
        const revision = binding.getState().revision;
        output.mockClear();

        binding.getState().composerInput({ type: "submissionConfirmed", revision });
        expect(binding.getState()).toMatchObject({
            text: "",
            attachments: [],
            submission: { status: "idle" },
        });
        expect(output).not.toHaveBeenCalled();

        binding.getState().textUpdate("retry me");
        binding.getState().textSubmit();
        const failedRevision = binding.getState().revision;
        output.mockClear();
        const error = new UserError("Could not send");
        binding
            .getState()
            .composerInput({ type: "submissionFailed", revision: failedRevision, error });
        expect(binding.getState().submission).toEqual({
            status: "failed",
            revision: failedRevision,
            error,
        });
        expect(output).not.toHaveBeenCalled();
    });

    it("rejects stale submission results after authoritative text reconciliation", () => {
        const binding = composerStoreCreate("chat-1");
        binding.getState().textUpdate("send me");
        binding.getState().textSubmit();
        const submittedRevision = binding.getState().revision;

        binding
            .getState()
            .composerInput({ type: "textReconciled", text: "new authoritative text" });
        const reconciled = binding.getState();
        expect(reconciled).toMatchObject({
            text: "new authoritative text",
            revision: submittedRevision + 1,
            submission: { status: "idle" },
        });

        binding
            .getState()
            .composerInput({ type: "submissionConfirmed", revision: submittedRevision });
        binding.getState().composerInput({
            type: "submissionFailed",
            revision: submittedRevision,
            error: new UserError("Stale failure"),
        });
        expect(binding.getState()).toBe(reconciled);
    });

    it("does not export the authoritative writer or input capability", () => {
        expect("composerStoreCreate" in publicState).toBe(true);
        expect("storeCreate" in publicState).toBe(false);
    });

    it("exposes authoritative input only through the explicit testing fixture", () => {
        const output = vi.fn();
        const fixture = composerStoreFixtureCreate("blueprint-chat", { output });
        fixture.getState().textUpdate("send me");
        fixture.getState().textSubmit();
        const revision = fixture.getState().revision;
        output.mockClear();

        fixture.input({ type: "submissionConfirmed", revision });

        expect(fixture.getState()).toMatchObject({ text: "", submission: { status: "idle" } });
        expect(output).not.toHaveBeenCalled();
        fixture[Symbol.dispose]();
    });
});

describe("HappyState registry shell", () => {
    it("deduplicates keyed stores, routes output in the same call stack, and runs unconnected", () => {
        const observed: string[] = [];
        const state = happyStateCreate({
            draftUpdated: ({ scopeId, text }) => observed.push(`${scopeId}:${text}`),
        });
        const first = state.composer("chat-1");
        const second = state.composer("chat-1", { text: "ignored after materialization" });

        expect(second).toBe(first);
        const result = first.getState().textUpdate("draft");
        expect(result).toBeUndefined();
        expect(observed).toEqual(["chat-1:draft"]);
        expect(first.getState().text).toBe("draft");

        expect(state.draftUpdate("chat-1", "restored")).toBeUndefined();
        expect(first.getState().text).toBe("restored");
        expect(observed).toEqual(["chat-1:draft", "chat-1:restored"]);

        state.composerRelease("chat-1");
        first.getState().textUpdate("still acquired");
        expect(first.getState().text).toBe("still acquired");
        state.composerRelease("chat-1");
        first.getState().textUpdate("detached store");
        expect(first.getState().text).toBe("detached store");
        expect(state.composer("chat-1")).not.toBe(first);
        state[Symbol.dispose]();
    });
});
