import { describe, expect, it } from "vitest";
import { rigStateCreate, type RigSessionId } from "../src/index.js";
import { createFakeRigTransport, fakeRigSession } from "../src/testing/index.js";

describe("RigState directory", () => {
    it("groups canonical directories deterministically and preserves unchanged identities", async () => {
        const fake = createFakeRigTransport();
        const newest = fakeRigSession("session-b", {
            cwd: "/Users/ada/Project",
            displayCwd: "~/Project",
            title: "Newest",
        });
        const older = fakeRigSession("session-a", {
            cwd: "/Users/ada/Project",
            displayCwd: "~/Project",
            title: "Older",
        });
        const other = fakeRigSession("session-c", {
            cwd: "/opt/alpha",
            displayCwd: "/opt/alpha",
        });
        fake.sessionSet(older);
        fake.sessionSet(newest);
        fake.sessionSet(other);
        using state = rigStateCreate({ transport: fake.transport });
        const directory = state.directory();
        expect(state.directory()).toBe(directory);
        await state.whenIdle();

        expect(fake.globalSubscriberCount).toBe(1);
        expect(directory.get().groups.map(({ id }) => id)).toEqual([
            "/opt/alpha",
            "/Users/ada/Project",
        ]);
        const priorGroups = directory.get().groups;
        const priorOther = priorGroups[0];
        const priorOlder = priorGroups[1]!.sessions.find(({ id }) => id === older.id);

        fake.sessionSet({ ...newest, title: "Changed" });
        fake.globalEmit({
            cursor: 1,
            sessionId: newest.id,
            kind: "sessionChanged",
        });
        await state.whenIdle();

        expect(directory.get().groups[0]).toBe(priorOther);
        expect(directory.get().groups[1]!.sessions.find(({ id }) => id === older.id)).toBe(
            priorOlder,
        );
        expect(directory.get().groups[1]!.sessions.find(({ id }) => id === newest.id)?.title).toBe(
            "Changed",
        );

        fake.globalEnd();
        await state.whenIdle();
        expect(fake.globalSubscriberCount).toBe(1);
    });

    it("routes create, fork, and reset failures without fabricating durable state", async () => {
        const fake = createFakeRigTransport();
        const existing = fakeRigSession("session-existing");
        fake.sessionSet(existing);
        const outputs: string[] = [];
        using state = rigStateCreate({
            transport: fake.transport,
            event: ({ type }) => outputs.push(type),
        });
        const directory = state.directory();
        await state.whenIdle();

        directory.sessionCreate({ cwd: "/new" });
        await state.whenIdle();
        expect(outputs).toContain("sessionCreated");
        expect(directory.get().groups.some(({ id }) => id === "/new")).toBe(true);

        directory.sessionFork(existing.id);
        await state.whenIdle();
        expect(outputs).toContain("sessionForked");

        fake.failNext("sessionReset", new Error("reset rejected"));
        directory.sessionReset(existing.id);
        await state.whenIdle();
        expect(directory.get().mutationError?.message).toBe("reset rejected");
        expect(directory.get().groups.flatMap(({ sessions }) => sessions)).toContainEqual(
            expect.objectContaining({ id: existing.id as RigSessionId }),
        );
    });

    it("cancels the global subscription when the root is disposed", async () => {
        const fake = createFakeRigTransport();
        const state = rigStateCreate({ transport: fake.transport });
        state.directory();
        await state.whenIdle();
        expect(fake.globalSubscriberCount).toBe(1);
        state[Symbol.dispose]();
        expect(fake.globalSubscriberCount).toBe(0);
    });
});
