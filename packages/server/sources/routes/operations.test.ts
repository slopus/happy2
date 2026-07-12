import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthService, Authenticated } from "../modules/auth/service.js";
import { Database, type Account, type User } from "../modules/database.js";
import { OperationsRepository } from "../modules/operations/repository.js";
import { registerOperationsRoutes } from "./operations.js";

interface Identity {
    account: Account;
    user: User;
}

describe("operations routes", () => {
    let directory: string;
    let database: Database;
    let repository: OperationsRepository;
    let app: FastifyInstance;
    let admin: Identity;
    let member: Identity;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "rigged-operations-routes-"));
        const url = `file:${join(directory, "rigged.db")}`;
        database = new Database(url);
        await database.migrate();
        repository = new OperationsRepository(url);
        admin = await createUser(database, "admin@example.com", "admin", "Ada");
        member = await createUser(database, "member@example.com", "member", "Grace");
        app = Fastify({ trustProxy: false });
        registerOperationsRoutes(
            app,
            fakeAuth(() => ({ admin, member })),
            repository,
        );
    });

    afterEach(async () => {
        await app.close();
        repository.close();
        database.close();
        await rm(directory, { recursive: true, force: true });
    });

    it("maps authentication, role, and validation failures to stable HTTP errors", async () => {
        const unauthorized = await app.inject({ method: "GET", url: "/v0/admin/auditLogs" });
        expect(unauthorized.statusCode).toBe(401);

        const forbidden = await app.inject({
            method: "GET",
            url: "/v0/admin/auditLogs",
            headers: { authorization: "Bearer member" },
        });
        expect(forbidden.statusCode).toBe(403);

        const invalid = await app.inject({
            method: "POST",
            url: `/v0/admin/users/${member.user.id}/applyBan`,
            headers: { authorization: "Bearer admin" },
            payload: { unexpected: true },
        });
        expect(invalid.statusCode).toBe(400);
        expect(invalid.json()).toMatchObject({ error: "invalid_request" });
    });

    it("creates a member report and lets an administrator review it", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/v0/reports/createReport",
            headers: {
                authorization: "Bearer member",
                "x-rigged-device": "Rigged Desktop",
            },
            payload: {
                targetUserId: admin.user.id,
                reason: "Profile needs review",
            },
        });
        expect(created.statusCode).toBe(201);
        expect(created.json().report).toMatchObject({
            reportedByUserId: member.user.id,
            status: "open",
        });

        const listed = await app.inject({
            method: "GET",
            url: "/v0/admin/reports?status=open&limit=10",
            headers: { authorization: "Bearer admin" },
        });
        expect(listed.statusCode).toBe(200);
        expect(listed.json().reports).toHaveLength(1);
    });
});

function fakeAuth(identities: () => { admin: Identity; member: Identity }): AuthService {
    return {
        async authenticate(request: FastifyRequest): Promise<Authenticated | undefined> {
            const token = request.headers.authorization?.replace(/^Bearer /, "");
            const selected =
                token === "admin"
                    ? identities().admin
                    : token === "member"
                      ? identities().member
                      : undefined;
            if (!selected) return undefined;
            return {
                session: {
                    id: `session-${token}`,
                    accountId: selected.account.id,
                    expiresAt: new Date(Date.now() + 60_000),
                },
                accountId: selected.account.id,
                user: selected.user,
            };
        },
    } as AuthService;
}

async function createUser(
    database: Database,
    email: string,
    username: string,
    firstName: string,
): Promise<Identity> {
    const account = await database.createPasswordAccount(email, "not-used-in-this-test");
    const user = await database.createProfile(account.id, { firstName, username, email });
    return { account, user };
}
