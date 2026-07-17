import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createGymServer, type GymServer, type GymServerOptions } from "../../sources/index.js";

describe("concurrent bootstrap registration allows exactly one account", () => {
    it("atomically reserves the bootstrap identity in file-backed SQLite", async () => {
        await withPasswordPepper(async () => {
            const directory = await mkdtemp(join(tmpdir(), "happy2-gym-shared-database-"));
            const databaseUrl = `file:${join(directory, "happy2.db")}`;
            let first: GymServer | undefined;
            let second: GymServer | undefined;
            try {
                const configure: NonNullable<GymServerOptions["configure"]> = (config) => {
                    config.auth.password.enabled = true;
                };
                const options = {
                    databaseUrl,
                    configure,
                };
                first = await createGymServer(options);
                second = await createGymServer(options);
                const servers = [first, second];
                const attempts = [
                    { email: "race-one@example.com", username: "race_one" },
                    { email: "race-two@example.com", username: "race_two" },
                ];
                const responses = await Promise.all(
                    attempts.map(({ email }, index) =>
                        servers[index]!.post("/v0/auth/password/register", {
                            email,
                            password: "correct horse battery staple",
                        }),
                    ),
                );
                expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 403]);
                const winnerIndex = responses.findIndex((response) => response.statusCode === 201);
                const winner = attempts[winnerIndex]!;
                const loser = attempts[1 - winnerIndex]!;
                const winnerServer = servers[winnerIndex]!;
                const token = responses[winnerIndex]!.json().token as string;

                expect(
                    (
                        await first.post("/v0/auth/password/login", {
                            email: loser.email,
                            password: "correct horse battery staple",
                        })
                    ).statusCode,
                ).toBe(401);
                const profile = await winnerServer.post(
                    "/v0/me/createProfile",
                    {
                        firstName: "Race Winner",
                        username: winner.username,
                        email: winner.email,
                    },
                    { headers: { authorization: `Bearer ${token}` } },
                );
                expect(profile.statusCode).toBe(201);
                expect(profile.json().user.role).toBe("admin");

                await winnerServer.restart();
                expect((await first.get("/v0/setup/status")).json()).toEqual({
                    schemaVersion: 1,
                    phase: "configuration_required",
                    registration: "closed",
                });
                expect(
                    (
                        await second.post("/v0/auth/password/register", {
                            email: "race-three@example.com",
                            password: "correct horse battery staple",
                        })
                    ).statusCode,
                ).toBe(403);
            } finally {
                await second?.close();
                await first?.close();
                await rm(directory, { force: true, recursive: true });
            }
        });
    });
});

async function withPasswordPepper(run: () => Promise<void>): Promise<void> {
    const previous = process.env.HAPPY2_PASSWORD_PEPPER;
    process.env.HAPPY2_PASSWORD_PEPPER = "gym-concurrent-bootstrap-pepper";
    try {
        await run();
    } finally {
        if (previous === undefined) delete process.env.HAPPY2_PASSWORD_PEPPER;
        else process.env.HAPPY2_PASSWORD_PEPPER = previous;
    }
}
