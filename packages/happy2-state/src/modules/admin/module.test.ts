import { describe, expect, it } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { adminLoad, adminOutputRoute, adminStoreCreate } from "./adminState.js";

describe("admin module", () => {
    it("loads one requested section without probing unrelated privileged endpoints", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/users", jsonResponse(200, { users: [] }));
        const runtime = new StateRuntime({ transport: server.transport });
        const admin = adminStoreCreate();
        await adminLoad({ runtime, admin }, ["users"]);
        expect(admin.getState()).toMatchObject({
            users: { type: "ready", value: [] },
            reports: { type: "unloaded" },
            automations: { type: "unloaded" },
            integrations: { type: "unloaded" },
        });
        expect(server.requests.map(({ path }) => path)).toEqual(["/v0/admin/users"]);
        runtime.stop();
    });

    it("settles every resource independently and ignores an older overlapping load", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/admin/users", jsonResponse(403, { error: "forbidden" }));
        server.respond("GET", "/v0/admin/reports?limit=100", jsonResponse(200, { reports: [] }));
        server.respond("GET", "/v0/admin/automations", jsonResponse(200, { automations: [] }));
        server.respond("GET", "/v0/admin/integrations", jsonResponse(200, { integrations: [] }));
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const admin = adminStoreCreate();
        await adminLoad({ runtime, admin });
        expect(admin.getState()).toMatchObject({
            users: { type: "error" },
            reports: { type: "ready", value: [] },
            automations: { type: "ready", value: [] },
            integrations: { type: "ready", value: [] },
        });
        runtime.stop();
    });

    it("generates a strong client password and submits that exact secret through the sensitive operation", async () => {
        const server = createFakeServer();
        server.respond(
            "POST",
            "/v0/admin/users/user-2/resetPassword",
            jsonResponse(200, { revokedSessionCount: 3 }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const routed: Promise<void>[] = [];
        const admin = adminStoreCreate((event) =>
            routed.push(adminOutputRoute({ runtime, admin }, event)),
        );

        admin.getState().userPasswordResetOpen("user-2");
        const opened = admin.getState().userPasswordReset;
        expect(opened).toMatchObject({ type: "open", status: "ready", userId: "user-2" });
        if (opened.type !== "open") throw new Error("Expected an open password reset.");
        expect(opened.password).toHaveLength(20);
        expect(opened.password).toMatch(/[A-Z]/);
        expect(opened.password).toMatch(/[a-z]/);
        expect(opened.password).toMatch(/[0-9]/);
        expect(opened.password).toMatch(/[!@#$%*\-_+]/);

        admin.getState().userPasswordResetSubmit();
        expect(admin.getState().userPasswordReset).toMatchObject({ status: "submitting" });
        await Promise.all(routed);
        expect(admin.getState().userPasswordReset).toMatchObject({
            type: "open",
            status: "succeeded",
            userId: "user-2",
            password: opened.password,
            revokedSessionCount: 3,
        });
        expect(server.requests).toEqual([
            expect.objectContaining({
                method: "POST",
                path: "/v0/admin/users/user-2/resetPassword",
                body: { password: opened.password },
            }),
        ]);

        admin.getState().userPasswordResetClose();
        expect(admin.getState().userPasswordReset).toEqual({ type: "closed" });
        runtime.stop();
    });

    it("retains the generated password after a displayable reset failure", async () => {
        const server = createFakeServer();
        server.respond(
            "POST",
            "/v0/admin/users/owner/resetPassword",
            jsonResponse(403, {
                error: "forbidden",
                message: "Only the owner can reset the owner's password",
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const routed: Promise<void>[] = [];
        const admin = adminStoreCreate((event) =>
            routed.push(adminOutputRoute({ runtime, admin }, event)),
        );
        admin.getState().userPasswordResetOpen("owner");
        const opened = admin.getState().userPasswordReset;
        if (opened.type !== "open") throw new Error("Expected an open password reset.");
        admin.getState().userPasswordResetSubmit();
        await Promise.all(routed);
        expect(admin.getState().userPasswordReset).toMatchObject({
            type: "open",
            status: "failed",
            password: opened.password,
            error: { message: "Only the owner can reset the owner's password" },
        });
        runtime.stop();
    });

    it("ignores a stale completion after the same user's handoff is reopened", () => {
        const outputs: import("./adminState.js").AdminOutput[] = [];
        const admin = adminStoreCreate((event) => outputs.push(event));
        admin.getState().adminInput({
            type: "usersLoaded",
            users: [
                {
                    id: "user-2",
                    username: "member",
                    firstName: "Workspace",
                    lastName: "Member",
                    role: "member",
                    kind: "human",
                },
            ],
        });

        admin.getState().userPasswordResetOpen("user-2");
        admin.getState().userPasswordResetSubmit();
        const submitted = outputs[0]!;
        admin.getState().userPasswordResetOpen("user-2");
        const reopened = admin.getState().userPasswordReset;
        admin.getState().adminInput({
            type: "userPasswordResetSucceeded",
            userId: submitted.userId,
            submissionId: submitted.submissionId,
            revokedSessionCount: 4,
        });

        expect(admin.getState().userPasswordReset).toEqual(reopened);
        expect(reopened).toMatchObject({
            type: "open",
            status: "ready",
            displayName: "Workspace Member",
            username: "member",
        });
    });
});
