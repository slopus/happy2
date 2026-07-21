import { describe, expect, it } from "vitest";
import { happyStateCreate } from "../src/index.js";
import { createFakeServer, jsonResponse } from "../src/testing/index.js";

describe("HappyState coarse product surface stores", () => {
    it("updates settings synchronously without notifying unrelated surface stores", () => {
        using state = happyStateCreate();
        const settings = state.settings({
            profile: { id: "user-1", firstName: "Ada", username: "ada" },
        });
        const files = state.files();
        let settingsUpdates = 0;
        let fileUpdates = 0;
        settings.subscribe(() => (settingsUpdates += 1));
        files.subscribe(() => (fileUpdates += 1));
        expect(settings.getState().displayNameUpdate("Grace", "Hopper")).toBeUndefined();
        expect(settings.getState().profile).toMatchObject({
            firstName: "Grace",
            lastName: "Hopper",
        });
        expect(settings.getState().profileSave.type).toBe("dirty");
        expect(settings.getState().fields.displayName).toMatchObject({
            saved: { firstName: "Ada" },
            save: { type: "dirty" },
        });
        settings.getState().displayNameUpdate("Ada");
        expect(settings.getState().fields.displayName.save.type).toBe("clean");
        expect(settingsUpdates).toBe(2);
        expect(fileUpdates).toBe(0);
    });

    it("keeps admin resources independently usable when one request fails", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/users", jsonResponse(403, { error: "forbidden" }));
        server.respond("GET", "/v0/admin/reports?limit=100", jsonResponse(200, { reports: [] }));
        server.respond("GET", "/v0/admin/automations", jsonResponse(200, { automations: [] }));
        server.respond("GET", "/v0/admin/integrations", jsonResponse(200, { integrations: [] }));
        using state = happyStateCreate({ transport: server.transport });
        const admin = state.admin();
        await state.whenIdle();
        expect(admin.getState().users.type).toBe("error");
        expect(admin.getState().reports).toEqual({ type: "ready", value: [] });
        expect(admin.getState().automations).toEqual({ type: "ready", value: [] });
        expect(admin.getState().integrations).toEqual({ type: "ready", value: [] });
    });

    it("flushes debounced settings work through whenIdle and confirms each submitted field", async () => {
        const server = createFakeServer();
        const user = {
            id: "user-1",
            firstName: "Ada",
            username: "ada",
            role: "member",
            kind: "human",
        } as const;
        const preferences = {
            directMessages: "all",
            mentions: "all",
            reactions: "all",
            calls: "all",
            emailNotifications: false,
            desktopNotifications: true,
        } as const;
        server.respond("GET", "/v0/me", jsonResponse(200, { user }));
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [user], presence: [], statuses: [] }),
        );
        server.respond("GET", "/v0/presence", jsonResponse(200, { presence: [], statuses: [] }));
        server.respond("GET", "/v0/me/notificationPreferences", jsonResponse(200, { preferences }));
        server.respond(
            "POST",
            "/v0/me/updateProfile",
            jsonResponse(200, { user: { ...user, firstName: "Grace" } }),
        );
        using state = happyStateCreate({ transport: server.transport });
        const settings = state.settings({ profile: user });
        settings.getState().displayNameUpdate("Grace");
        await state.whenIdle();
        expect(settings.getState().fields.displayName).toEqual({
            saved: { firstName: "Grace" },
            save: { type: "clean" },
        });
        expect(
            server.requests.some(
                ({ method, path }) => method === "POST" && path === "/v0/me/updateProfile",
            ),
        ).toBe(true);
    });

    it("discards stale search completion after a newer typed query", async () => {
        const server = createFakeServer();
        let releaseFirst!: () => void;
        let firstRequestStartedResolve!: () => void;
        const firstRequestStarted = new Promise<void>((resolve) => {
            firstRequestStartedResolve = resolve;
        });
        server.route(
            "GET",
            (path) => path.startsWith("/v0/search?"),
            async (request) => {
                if (request.path.includes("q=first")) {
                    firstRequestStartedResolve();
                    await new Promise<void>((resolve) => (releaseFirst = resolve));
                }
                return jsonResponse(200, { results: [], nextCursor: request.path });
            },
        );
        server.respond("GET", "/v0/files?limit=100", jsonResponse(200, { files: [] }));
        using state = happyStateCreate({ transport: server.transport });
        const search = state.search();
        search.getState().queryUpdate("first");
        await firstRequestStarted;
        search.getState().queryUpdate("second");
        releaseFirst();
        await state.whenIdle();
        expect(search.getState().query).toBe("second");
        expect(search.getState().nextCursor).toContain("q=second");
    });
});
