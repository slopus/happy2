import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

const OWNER_PASSWORD = "owner-generated-password-123";
const DELEGATED_PASSWORD = "delegated-generated-password-456";
const OWNER_SELF_PASSWORD = "owner-self-generated-password-789";

describe("owners reset user passwords and revoke existing sessions", () => {
    it("keeps reset owner-only by default, supports explicit delegation, and audits session cutoff", async () => {
        await withPasswordPepper(async () => {
            await using server = await createGymServer({
                configure(config) {
                    config.auth.password.enabled = true;
                },
            });
            const owner = await server.createUser({
                username: "password_owner",
                email: "password-owner@gym.invalid",
            });
            const member = await server.createUser({
                username: "password_member",
                email: "password-member@gym.invalid",
            });
            const administrator = await server.createUser({
                username: "password_administrator",
                email: "password-administrator@gym.invalid",
            });
            const delegatedTarget = await server.createUser({
                username: "delegated_password_target",
                email: "delegated-password-target@gym.invalid",
            });
            const asOwner = server.as(owner);
            const asMember = server.as(member);
            const asAdministrator = server.as(administrator);

            expect(
                (
                    await server.post(`/v0/admin/users/${member.id}/resetPassword`, {
                        password: OWNER_PASSWORD,
                    })
                ).statusCode,
            ).toBe(401);
            expect(
                (
                    await asMember.post(`/v0/admin/users/${member.id}/resetPassword`, {
                        password: OWNER_PASSWORD,
                    })
                ).statusCode,
            ).toBe(403);

            const promotion = await asOwner.post(`/v0/admin/users/${administrator.id}/updateUser`, {
                role: "admin",
            });
            expect(promotion.statusCode).toBe(200);
            expect((await asAdministrator.get("/v0/me")).json().permissions).toMatchObject({
                owner: false,
                allowed: expect.not.arrayContaining(["resetPasswords"]),
            });
            expect(
                (
                    await asAdministrator.post(
                        `/v0/admin/users/${delegatedTarget.id}/resetPassword`,
                        { password: DELEGATED_PASSWORD },
                    )
                ).statusCode,
            ).toBe(403);

            expect(
                (
                    await asOwner.post(`/v0/admin/users/${member.id}/resetPassword`, {
                        password: "too-short",
                    })
                ).statusCode,
            ).toBe(400);
            expect(
                (
                    await asOwner.post(`/v0/admin/users/${member.id}/resetPassword`, {
                        password: OWNER_PASSWORD,
                        unexpected: true,
                    })
                ).statusCode,
            ).toBe(400);
            expect(
                (
                    await asOwner.post("/v0/admin/users/missing-user/resetPassword", {
                        password: OWNER_PASSWORD,
                    })
                ).statusCode,
            ).toBe(404);

            const reset = await asOwner.post(
                `/v0/admin/users/${member.id}/resetPassword`,
                { password: OWNER_PASSWORD },
                {
                    headers: {
                        "x-happy2-device": "Happy (2) Desktop",
                        "x-happy2-app-version": "password-reset-gym",
                        "user-agent": "happy2-gym/password-reset",
                    },
                },
            );
            expect(reset.statusCode).toBe(200);
            expect(reset.json()).toEqual({ revokedSessionCount: 1 });
            expect((await asMember.get("/v0/me")).statusCode).toBe(401);

            const wrongPassword = await server.post("/v0/auth/password/login", {
                email: member.email,
                password: "a-different-password-123",
            });
            expect(wrongPassword.statusCode).toBe(401);
            const login = await server.post("/v0/auth/password/login", {
                email: member.email,
                password: OWNER_PASSWORD,
            });
            expect(login.statusCode).toBe(200);
            expect(login.json()).toMatchObject({
                token: expect.any(String),
                profileRequired: false,
            });
            expect(
                (
                    await server.get("/v0/me", {
                        headers: { authorization: `Bearer ${login.json().token as string}` },
                    })
                ).statusCode,
            ).toBe(200);

            const audit = await asOwner.get(
                `/v0/admin/auditLogs?action=account.password_reset&targetType=user&targetId=${member.id}&limit=20`,
            );
            expect(audit.statusCode).toBe(200);
            expect(audit.json().auditLogs).toEqual([
                expect.objectContaining({
                    actorUserId: owner.id,
                    action: "account.password_reset",
                    targetType: "user",
                    targetId: member.id,
                    before: { passwordConfigured: true },
                    after: { passwordConfigured: true },
                    metadata: { revokedSessionCount: 1 },
                    device: "Happy (2) Desktop",
                    appVersion: "password-reset-gym",
                    userAgent: "happy2-gym/password-reset",
                }),
            ]);

            const delegated = await asOwner.post(
                `/v0/admin/users/${administrator.id}/updatePermissions`,
                { permissions: ["resetPasswords"] },
            );
            expect(delegated.statusCode).toBe(200);
            expect((await asAdministrator.get("/v0/me")).json().permissions.allowed).toContain(
                "resetPasswords",
            );
            const ownerTakeover = await asAdministrator.post(
                `/v0/admin/users/${owner.id}/resetPassword`,
                { password: DELEGATED_PASSWORD },
            );
            expect(ownerTakeover.statusCode).toBe(403);
            expect(ownerTakeover.json()).toMatchObject({
                error: "forbidden",
                message: "Only the owner can reset the owner's password",
            });
            expect((await asOwner.get("/v0/me")).statusCode).toBe(200);
            const delegatedReset = await asAdministrator.post(
                `/v0/admin/users/${delegatedTarget.id}/resetPassword`,
                { password: DELEGATED_PASSWORD },
            );
            expect(delegatedReset.statusCode).toBe(200);
            expect((await server.as(delegatedTarget).get("/v0/me")).statusCode).toBe(401);
            expect(
                (
                    await server.post("/v0/auth/password/login", {
                        email: delegatedTarget.email,
                        password: DELEGATED_PASSWORD,
                    })
                ).statusCode,
            ).toBe(200);

            const selfReset = await asOwner.post(`/v0/admin/users/${owner.id}/resetPassword`, {
                password: OWNER_SELF_PASSWORD,
            });
            expect(selfReset.statusCode).toBe(200);
            expect((await asOwner.get("/v0/me")).statusCode).toBe(401);
            expect(
                (
                    await server.post("/v0/auth/password/login", {
                        email: owner.email,
                        password: OWNER_SELF_PASSWORD,
                    })
                ).statusCode,
            ).toBe(200);
        });
    });

    it("does not expose password reset when password authentication is disabled", async () => {
        await using server = await createGymServer();
        expect(
            (
                await server.post("/v0/admin/users/any-user/resetPassword", {
                    password: OWNER_PASSWORD,
                })
            ).statusCode,
        ).toBe(404);
    });
});

async function withPasswordPepper(run: () => Promise<void>): Promise<void> {
    const previous = process.env.HAPPY2_PASSWORD_PEPPER;
    process.env.HAPPY2_PASSWORD_PEPPER = "gym-password-reset-pepper";
    try {
        await run();
    } finally {
        if (previous === undefined) delete process.env.HAPPY2_PASSWORD_PEPPER;
        else process.env.HAPPY2_PASSWORD_PEPPER = previous;
    }
}
