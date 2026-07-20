import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TodoDataError, TodosDatabase } from "./database.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0))
        rmSync(directory, { force: true, recursive: true });
});

describe("TodosDatabase", () => {
    it("shares two lists between viewers and records atomic collaborative activity", () => {
        const database = testDatabase();
        const first = database.createList("Launch", "viewer-a");
        const second = database.createList("Docs", "viewer-b");
        const index = database.indexSnapshot();
        expect(index.revision).toBe(2);
        expect(index.lists).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: first.value.id,
                    title: "Launch",
                    createdByUserId: "viewer-a",
                }),
                expect.objectContaining({
                    id: second.value.id,
                    title: "Docs",
                    createdByUserId: "viewer-b",
                }),
            ]),
        );

        const added = database.addItem(first.value.id, "Ship desktop build", "viewer-b");
        database.toggleItem(first.value.id, added.value.id, true, "viewer-a");
        database.updateItem(
            first.value.id,
            added.value.id,
            "Ship signed desktop build",
            "viewer-b",
        );
        const snapshot = database.listSnapshot(first.value.id);

        expect(snapshot).toMatchObject({
            revision: 4,
            list: { completedCount: 1, itemCount: 1 },
            items: [{ title: "Ship signed desktop build", completed: true }],
        });
        expect(snapshot.activity.map(({ actorUserId }) => actorUserId)).toEqual([
            "viewer-b",
            "viewer-a",
            "viewer-b",
            "viewer-a",
        ]);
        expect(database.indexSnapshot().revision).toBe(5);
        database.close();
    });

    it("rolls back revision increments when a mutation fails", () => {
        const database = testDatabase();
        const list = database.createList("Launch", "viewer-a").value;

        expect(() => database.updateItem(list.id, "missing", "Nope", "viewer-a")).toThrow(
            new TodoDataError(`TODO item missing was not found in list ${list.id}.`),
        );
        expect(database.listSnapshot(list.id).revision).toBe(1);
        expect(database.indexSnapshot().revision).toBe(1);
        database.close();
    });

    it("persists lists, items, revisions, and activity across a restart", () => {
        const directory = temporaryDirectory();
        const path = join(directory, "todos.db");
        const ids = idFactory();
        const first = new TodosDatabase(path, { idFactory: ids });
        const list = first.createList("Persistent", "viewer-a").value;
        const item = first.addItem(list.id, "Survive restart", "viewer-a").value;
        first.close();

        const reopened = new TodosDatabase(path, { idFactory: ids });
        expect(reopened.indexSnapshot()).toMatchObject({ revision: 2, lists: [{ id: list.id }] });
        expect(reopened.listSnapshot(list.id)).toMatchObject({
            revision: 2,
            items: [{ id: item.id, title: "Survive restart" }],
            activity: [{ kind: "item_added" }, { kind: "list_created" }],
        });
        reopened.close();
    });
});

function testDatabase(): TodosDatabase {
    return new TodosDatabase(":memory:", { idFactory: idFactory() });
}

function idFactory(): () => string {
    let next = 0;
    return () => `id-${++next}`;
}

function temporaryDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), "happy2-todos-"));
    temporaryDirectories.push(directory);
    return directory;
}
