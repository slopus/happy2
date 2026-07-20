import { happyStateCreate } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("client-generated password resets across happy2-state and the real server", () => {
    it("submits the generated secret, revokes existing sessions, and retains the handoff result", async () => {
        await withPasswordPepper(async () => {
            await using server = await createGymServer({
                configure(config) {
                    config.auth.password.enabled = true;
                },
            });
            const owner = await server.createUser({
                username: "state_password_owner",
                email: "state-password-owner@gym.invalid",
            });
            const member = await server.createUser({
                username: "state_password_member",
                email: "state-password-member@gym.invalid",
            });
            const transport = await createGymStateTransport(server, owner);
            await using state = happyStateCreate({
                initialPermissions: { allowed: [], owner: true },
                transport,
            });
            await state.syncStart();
            await transport.whenConnected();

            const admin = state.admin("users");
            await state.whenIdle();
            expect(admin.getState().users).toMatchObject({ type: "ready" });

            admin.getState().userPasswordResetOpen(member.id);
            const opened = admin.getState().userPasswordReset;
            if (opened.type !== "open") throw new Error("Expected an open password reset.");
            expect(opened.password).toHaveLength(20);

            admin.getState().userPasswordResetSubmit();
            await state.whenIdle();
            expect(admin.getState().userPasswordReset).toMatchObject({
                type: "open",
                status: "succeeded",
                userId: member.id,
                password: opened.password,
                revokedSessionCount: 1,
            });
            expect((await server.as(member).get("/v0/me")).statusCode).toBe(401);
            expect(
                (
                    await server.post("/v0/auth/password/login", {
                        email: member.email,
                        password: opened.password,
                    })
                ).statusCode,
            ).toBe(200);
        });
    });
});

async function withPasswordPepper(run: () => Promise<void>): Promise<void> {
    const previous = process.env.HAPPY2_PASSWORD_PEPPER;
    process.env.HAPPY2_PASSWORD_PEPPER = "gym-state-password-reset-pepper";
    try {
        await run();
    } finally {
        if (previous === undefined) delete process.env.HAPPY2_PASSWORD_PEPPER;
        else process.env.HAPPY2_PASSWORD_PEPPER = previous;
    }
}
