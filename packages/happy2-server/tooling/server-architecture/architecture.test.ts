import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanServerArchitecture } from "./architecture.js";

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(
        directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

describe("server action architecture", () => {
    it("accepts an entity-first action with an executor, comment, and durable mutation", async () => {
        const root = await fixture({
            "schema.ts": "export const users = {};",
            "user/userUpdateProfile.ts": `
                import { users } from "../schema.js";
                import type { DrizzleExecutor } from "../drizzle.js";
                /** Updates the durable users profile atomically. The transaction keeps its public sync projection consistent so callers cannot publish partial identity state. */
                export async function userUpdateProfile(executor: DrizzleExecutor) {
                    await executor.update(users);
                }
            `,
        });

        await expect(scanServerArchitecture(root)).resolves.toEqual([]);
    });

    it("rejects persistence facades, verb-first names, mismatched files, and mutation helpers", async () => {
        const root = await fixture({
            "schema.ts": "export const users = {};",
            "bad.ts": `export class UserRepository {}`,
            "user/createUser.ts": `
                import { users } from "../schema.js";
                import type { DrizzleExecutor } from "../drizzle.js";
                export async function createUser(executor: DrizzleExecutor) {
                    await executor.insert(users);
                }
            `,
            "user/helper.ts": `
                import { users } from "../schema.js";
                export function helper(executor: { delete(value: unknown): Promise<void> }) {
                    return executor.delete(users);
                }
            `,
            "user/wrong.ts": `
                import type { DrizzleExecutor } from "../drizzle.js";
                export async function userFind(executor: DrizzleExecutor) { void executor; }
            `,
        });

        const violations = await scanServerArchitecture(root);
        expect(violations.map(({ message }) => message)).toEqual(
            expect.arrayContaining([
                expect.stringContaining("persistence facade"),
                expect.stringContaining("must live in userFind.ts"),
                expect.stringContaining("direct durable mutation"),
            ]),
        );
    });

    it("rejects generic or missing comments and permits shared mutations only under impl", async () => {
        const root = await fixture({
            "schema.ts": "export const users = {};",
            "user/userCreate.ts": `
                import type { DrizzleExecutor } from "../drizzle.js";
                /** Atomically applies the durable user-create transition and says nothing specific about the invariant. */
                export async function userCreate(executor: DrizzleExecutor) { void executor; }
            `,
            "user/impl/write.ts": `
                import { users } from "../../schema.js";
                export function write(executor: { insert(value: unknown): Promise<void> }) {
                    return executor.insert(users);
                }
            `,
        });

        const violations = await scanServerArchitecture(root);
        expect(violations).toHaveLength(1);
        expect(violations[0]!.message).toContain("specific semantics");
    });

    it("rejects verb-first names beyond a finite list", async () => {
        const root = await fixture({
            "schema.ts": "export const users = {};",
            "user/saveUserProfile.ts": `
                import { users } from "../schema.js";
                import type { DrizzleExecutor } from "../drizzle.js";
                /** Saves the selected profile name to users in one transaction so identity reads cannot observe a partial update. */
                export async function saveUserProfile(executor: DrizzleExecutor) {
                    await executor.update(users);
                }
            `,
        });

        const violations = await scanServerArchitecture(root);
        expect(violations.map(({ message }) => message)).toContain(
            "action saveUserProfile must use entity-first naming",
        );
    });

    it("checks async arrow exports and namespace-qualified schema writes", async () => {
        const root = await fixture({
            "schema.ts": "export const users = {};",
            "user/userSave.ts": `
                import * as schema from "../schema.js";
                import type { DrizzleExecutor } from "../drizzle.js";
                export const userSave = async (userId: string, executor: DrizzleExecutor) => {
                    void userId;
                    await executor.update(schema.users);
                };
            `,
        });

        const violations = await scanServerArchitecture(root);
        expect(violations.map(({ message }) => message)).toEqual(
            expect.arrayContaining([
                expect.stringContaining("executor first"),
                expect.stringContaining("semantic doc comment"),
            ]),
        );
    });

    it("checks async functions exported by a separate export declaration", async () => {
        const root = await fixture({
            "schema.ts": "export const users = {};",
            "user/userSave.ts": `
                import { users } from "../schema.js";
                import type { DrizzleExecutor } from "../drizzle.js";
                /** Saves the selected users row after validating its identity. The boundary keeps the durable write discoverable for every caller. */
                async function userSave(userId: string, executor: DrizzleExecutor) {
                    void userId;
                    await executor.update(users);
                }
                export { userSave };
            `,
        });

        const violations = await scanServerArchitecture(root);
        expect(violations.map(({ message }) => message)).toContain(
            "durable action userSave must receive its Drizzle executor first",
        );
    });

    it("rejects atomicity claims that have no transaction boundary", async () => {
        const root = await fixture({
            "schema.ts": "export const users = {}; export const sessions = {};",
            "user/userTouch.ts": `
                import { sessions, users } from "../schema.js";
                import type { DrizzleExecutor } from "../drizzle.js";
                /** Touches users and sessions access timestamps for telemetry. Callers cannot commit only part of the user touch invariant. */
                export async function userTouch(executor: DrizzleExecutor) {
                    await executor.update(sessions);
                    await executor.update(users);
                }
            `,
        });

        const violations = await scanServerArchitecture(root);
        expect(violations.map(({ message }) => message)).toContain(
            "action userTouch claims atomicity without a transaction boundary",
        );
    });

    it("rejects atomicity claims when only some mutations are inside a transaction", async () => {
        const root = await fixture({
            "schema.ts": "export const users = {}; export const sessions = {};",
            "user/userTouch.ts": `
                import { sessions, users } from "../schema.js";
                import type { DrizzleExecutor } from "../drizzle.js";
                import { withTransaction } from "../drizzle.js";
                /** Touches users and sessions access timestamps for telemetry. Callers cannot commit only part of the user touch invariant. */
                export async function userTouch(executor: DrizzleExecutor) {
                    await executor.update(users);
                    await withTransaction(executor, async (tx) => {
                        await tx.update(sessions);
                    });
                }
            `,
        });

        const violations = await scanServerArchitecture(root);
        expect(violations.map(({ message }) => message)).toContain(
            "action userTouch claims atomicity without a transaction boundary",
        );
    });

    it("rejects mutation comments that do not name a changed durable table", async () => {
        const root = await fixture({
            "schema.ts": "export const users = {}; export const sessions = {};",
            "user/userUpdate.ts": `
                import { users } from "../schema.js";
                import type { DrizzleExecutor } from "../drizzle.js";
                /** Updates the selected identity after validating its durable state. Naming sessions here would not describe the profile record this boundary actually changes. */
                export async function userUpdate(executor: DrizzleExecutor) {
                    await executor.update(users);
                }
            `,
        });

        const violations = await scanServerArchitecture(root);
        expect(violations.map(({ message }) => message)).toContain(
            "action userUpdate doc comment must name a changed durable table",
        );
    });

    it("recognizes relational-query reads as durable access", async () => {
        const root = await fixture({
            "schema.ts": "export const users = {};",
            "user/userList.ts": `
                import type { DrizzleExecutor } from "../drizzle.js";
                /** Lists active user rows through the shared relational projection so every caller applies the same durable access rules. */
                export async function userList(limit: number, executor: DrizzleExecutor) {
                    return executor.query.users.findMany({ limit });
                }
            `,
        });

        const violations = await scanServerArchitecture(root);
        expect(violations.map(({ message }) => message)).toContain(
            "durable action userList must receive its Drizzle executor first",
        );
    });

    it("rejects imports from another module's private implementation", async () => {
        const root = await fixture({
            "schema.ts": "export const users = {};",
            "chat/impl/privateAccess.ts": "export const privateAccess = true;",
            "user/userFind.ts": `
                import { privateAccess } from "../chat/impl/privateAccess.js";
                import type { DrizzleExecutor } from "../drizzle.js";
                /** Finds an active user only when the durable identity row is visible, keeping the access predicate consistent for callers. */
                export async function userFind(executor: DrizzleExecutor) { return privateAccess && executor; }
            `,
        });

        const violations = await scanServerArchitecture(root);
        expect(violations.map(({ message }) => message)).toContain(
            "module user must not import private chat implementation",
        );
    });

    it("rejects a read-only contract on an action that writes durable state", async () => {
        const root = await fixture({
            "schema.ts": "export const users = {};",
            "user/userRead.ts": `
                import { users } from "../schema.js";
                import type { DrizzleExecutor } from "../drizzle.js";
                /** Returns the authorized user-read projection from durable state and does not mutate durable state. Keeping the access and mapping rules here gives every caller the same observable result. */
                export async function userRead(executor: DrizzleExecutor) {
                    await executor.update(users);
                }
            `,
        });

        const violations = await scanServerArchitecture(root);
        expect(violations).toHaveLength(1);
        expect(violations[0]!.message).toContain("contradicts its durable mutation");
    });

    it("requires the Drizzle executor to be the first dependency of durable actions", async () => {
        const root = await fixture({
            "schema.ts": "export const users = {};",
            "user/userFind.ts": `
                import { users } from "../schema.js";
                import type { DrizzleExecutor } from "../drizzle.js";
                /** Finds the visible user row through the shared active-account predicate. Centralizing that filter prevents callers from exposing disabled identities. */
                export async function userFind(userId: string, executor: DrizzleExecutor) {
                    return executor.select().from(users);
                }
            `,
        });

        const violations = await scanServerArchitecture(root);
        expect(violations).toHaveLength(1);
        expect(violations[0]!.message).toContain("executor first");
    });

    it("keeps every Drizzle table in the one authoritative schema file", async () => {
        const root = await fixture({
            "schema.ts": "export const users = {};",
            "user/schemaFragment.ts": `
                import { sqliteTable } from "drizzle-orm/sqlite-core";
                export const profiles = sqliteTable("profiles", {});
            `,
        });

        const violations = await scanServerArchitecture(root);
        expect(violations).toHaveLength(1);
        expect(violations[0]!.message).toContain("modules/schema.ts");
    });
});

async function fixture(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "happy2-server-architecture-"));
    directories.push(root);
    for (const [relative, source] of Object.entries(files)) {
        const filename = join(root, relative);
        await mkdir(join(filename, ".."), { recursive: true });
        await writeFile(filename, source);
    }
    return root;
}
