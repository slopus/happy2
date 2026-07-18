import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { identitiesReconcile } from "./identityState.js";
import { IdentityCatalog } from "./identityState.js";

describe("identity module", () => {
    it("canonicalizes equal presentations and fans authoritative changes into retained owners", async () => {
        const identities = new IdentityCatalog();
        const user = {
            id: "user-1",
            username: "ada",
            firstName: "Ada",
            role: "member",
            kind: "human",
        } as const;
        expect(identities.project(user)).toBe(identities.project({ ...user }));
        expect(identities.project({ ...user, firstName: "Grace" })).not.toBe(
            identities.project(user),
        );

        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [user], presence: [], statuses: [] }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const chatInput = vi.fn();
        const sidebarIdentityReconcile = vi.fn();
        const directoryReconcile = vi.fn();
        const agentSecretsReconcile = vi.fn();
        await identitiesReconcile({
            runtime,
            identities,
            chatsGet: () => [["chat-1", { getState: () => ({ chatInput }) } as never]],
            sidebarIdentityReconcile,
            directoryReconcile,
            agentSecretsReconcile,
        });
        expect(chatInput).toHaveBeenCalledWith(
            expect.objectContaining({ type: "identityReconciled" }),
        );
        expect(sidebarIdentityReconcile).toHaveBeenCalledOnce();
        expect(directoryReconcile).toHaveBeenCalledOnce();
        expect(agentSecretsReconcile).toHaveBeenCalledOnce();
        runtime.stop();
        identities.clear();
        expect(identities.get("user-1")).toBeUndefined();
    });
});
