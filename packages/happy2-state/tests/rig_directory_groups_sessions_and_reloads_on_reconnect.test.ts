import { describe, expect, it } from "vitest";
import { rigStateCreate, type RigSessionId } from "../src/index.js";
import { createFakeRigTransport, fakeRigSession } from "../src/testing/index.js";

describe("RigState connection directory", () => {
    it("groups directories and reloads them authoritatively with a reconstructed state", async () => {
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

        expect(fake.globalSubscriberCount).toBe(0);
        expect(directory.get().groups.map(({ id }) => id)).toEqual([
            "/opt/alpha",
            "/Users/ada/Project",
        ]);
        const priorGroups = directory.get().groups;
        const priorOther = priorGroups[0];
        const priorOlder = priorGroups[1]!.sessions.find(({ id }) => id === older.id);

        directory.sessionCreate({ cwd: "/new" });
        await state.whenIdle();

        expect(directory.get().groups.find(({ id }) => id === "/opt/alpha")).toBe(priorOther);
        expect(
            directory
                .get()
                .groups.find(({ id }) => id === "/Users/ada/Project")
                ?.sessions.find(({ id }) => id === older.id),
        ).toBe(priorOlder);
        fake.sessionSet({ ...newest, title: "Changed after reconnect" });
        state[Symbol.dispose]();
        using reconnected = rigStateCreate({ transport: fake.transport });
        const refreshed = reconnected.directory();
        await reconnected.whenIdle();

        expect(
            refreshed
                .get()
                .groups.flatMap(({ sessions }) => sessions)
                .find(({ id }) => id === newest.id)?.title,
        ).toBe("Changed after reconnect");
        expect(fake.globalSubscriberCount).toBe(0);
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

    it("does not require Rig's optional durable global event queue", async () => {
        const fake = createFakeRigTransport();
        const state = rigStateCreate({ transport: fake.transport });
        state.directory();
        await state.whenIdle();
        expect(fake.globalSubscriberCount).toBe(0);
        state[Symbol.dispose]();
        expect(fake.globalSubscriberCount).toBe(0);
    });
});
