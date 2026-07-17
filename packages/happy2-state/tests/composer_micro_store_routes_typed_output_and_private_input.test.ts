import { describe, expect, it, vi } from "vitest";
import * as publicState from "../src/index.js";
import { happyStateCreate, composerStoreCreate, UserError } from "../src/index.js";
import { composerStoreCreateBinding } from "../src/modules/composer/composerStore.js";
import { composerStoreFixtureCreate } from "../src/testing/index.js";

describe("composer micro-store boundaries", () => {
    it("works standalone, mutates synchronously, and emits typed output after notification", () => {
        const order: string[] = [];
        const output = vi.fn((event) => order.push(`output:${event.type}`));
        const composer = composerStoreCreate("chat-1", { output });
        composer.subscribe(() => order.push(`state:${composer.get().text}`));

        const result = composer.textUpdate("hello");
        expect(result).toBeUndefined();
        expect(composer.get()).toMatchObject({ text: "hello", revision: 1 });
        expect(order).toEqual(["state:hello", "output:textUpdated"]);

        composer.textUpdate("hello");
        expect(order).toHaveLength(2);
        expect(output).toHaveBeenCalledTimes(1);
        composer[Symbol.dispose]();
    });

    it("provides explicit attachment and submit actions with no generic field mutation", () => {
        const output = vi.fn();
        const composer = composerStoreCreate("chat-1", { output });
        const attachment = { id: "file-1", name: "notes.txt", size: 12 } as const;

        composer.attachmentAdd(attachment);
        composer.attachmentAdd(attachment);
        composer.attachmentRemove("missing");
        composer.textSubmit();

        expect(composer.get().attachments).toEqual([attachment]);
        expect(composer.get().submission).toEqual({ status: "pending", revision: 1 });
        expect(output.mock.calls.map(([event]) => event.type)).toEqual([
            "attachmentAdded",
            "textSubmitted",
        ]);
        expect("setField" in composer).toBe(false);
        expect("updateField" in composer).toBe(false);
        composer[Symbol.dispose]();
    });

    it("applies authoritative input without re-emitting output", () => {
        const output = vi.fn();
        const binding = composerStoreCreateBinding("chat-1", { output });
        binding.store.textUpdate("send me");
        binding.store.textSubmit();
        const revision = binding.store.get().revision;
        output.mockClear();

        binding.composerInput({ type: "submissionConfirmed", revision });
        expect(binding.store.get()).toMatchObject({
            text: "",
            attachments: [],
            submission: { status: "idle" },
        });
        expect(output).not.toHaveBeenCalled();

        binding.store.textUpdate("retry me");
        binding.store.textSubmit();
        const failedRevision = binding.store.get().revision;
        output.mockClear();
        const error = new UserError("Could not send");
        binding.composerInput({ type: "submissionFailed", revision: failedRevision, error });
        expect(binding.store.get().submission).toEqual({
            status: "failed",
            revision: failedRevision,
            error,
        });
        expect(output).not.toHaveBeenCalled();
        binding.dispose();
    });

    it("rejects stale submission results after authoritative text reconciliation", () => {
        const binding = composerStoreCreateBinding("chat-1");
        binding.store.textUpdate("send me");
        binding.store.textSubmit();
        const submittedRevision = binding.store.get().revision;

        binding.composerInput({ type: "textReconciled", text: "new authoritative text" });
        const reconciled = binding.store.get();
        expect(reconciled).toMatchObject({
            text: "new authoritative text",
            revision: submittedRevision + 1,
            submission: { status: "idle" },
        });

        binding.composerInput({ type: "submissionConfirmed", revision: submittedRevision });
        binding.composerInput({
            type: "submissionFailed",
            revision: submittedRevision,
            error: new UserError("Stale failure"),
        });
        expect(binding.store.get()).toBe(reconciled);
        binding.dispose();
    });

    it("does not export the authoritative writer or input capability", () => {
        expect("composerStoreCreateBinding" in publicState).toBe(false);
        expect("storeCreate" in publicState).toBe(false);
    });

    it("exposes authoritative input only through the explicit testing fixture", () => {
        const output = vi.fn();
        const fixture = composerStoreFixtureCreate("blueprint-chat", { output });
        fixture.textUpdate("send me");
        fixture.textSubmit();
        const revision = fixture.get().revision;
        output.mockClear();

        fixture.input({ type: "submissionConfirmed", revision });

        expect(fixture.get()).toMatchObject({ text: "", submission: { status: "idle" } });
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
        const result = first.textUpdate("draft");
        expect(result).toBeUndefined();
        expect(observed).toEqual(["chat-1:draft"]);
        expect(first.get().text).toBe("draft");

        expect(state.draftUpdate("chat-1", "restored")).toBeUndefined();
        expect(first.get().text).toBe("restored");
        expect(observed).toEqual(["chat-1:draft", "chat-1:restored"]);

        state.composerRelease("chat-1");
        first.textUpdate("still acquired");
        expect(first.get().text).toBe("still acquired");
        state.composerRelease("chat-1");
        first.textUpdate("disposed store");
        expect(first.get().text).toBe("still acquired");
        expect(state.composer("chat-1")).not.toBe(first);
        state[Symbol.dispose]();
    });
});
