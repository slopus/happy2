import { describe, expect, it, vi } from "vitest";
import type {
    AgentImageDetails,
    AgentImageSummary,
    NotificationPreferences,
} from "../src/resources.js";
import type { CallSummary, NotificationSummary, PresenceSettingsSummary } from "../src/types.js";
import { callsLoad } from "../src/modules/calls/callsState.js";
import { callsStoreCreate } from "../src/modules/calls/callsState.js";
import { agentImagesOutputRoute } from "../src/modules/agent-images/agentImagesState.js";
import { agentImagesStoreCreate } from "../src/modules/agent-images/agentImagesState.js";
import { notificationsLoad } from "../src/modules/notifications/notificationsState.js";
import { notificationsStoreCreate } from "../src/modules/notifications/notificationsState.js";
import { StateRuntime } from "../src/modules/runtime/runtimeState.js";
import { settingsStoreCreate } from "../src/modules/settings/settingsState.js";
import { IdentityCatalog } from "../src/modules/identity/identityState.js";
import { createFakeServer, jsonResponse } from "../src/testing/index.js";

describe("retained surface races and failures", () => {
    it("rejects invalid retry policies and does not issue another request after stop", async () => {
        expect(() => new StateRuntime({ retry: { attempts: 0 } })).toThrow(RangeError);
        const server = createFakeServer();
        server.failNext("GET", "/v0/chats");
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [] }));
        let releaseSleep!: () => void;
        const runtime = new StateRuntime({
            transport: server.transport,
            sleep: () => new Promise<void>((resolve) => (releaseSleep = resolve)),
        });
        const request = runtime.operation("getChats");
        await vi.waitFor(() => expect(releaseSleep).toBeTypeOf("function"));
        runtime.stop();
        releaseSleep();
        await expect(request).rejects.toThrow("stopped");
        expect(server.requests).toHaveLength(1);
    });

    it("merges a loaded settings document field by field around a newer local edit", () => {
        const binding = settingsStoreCreate({
            profile: {
                id: "user-1",
                firstName: "Ada",
                username: "ada",
                photoFileId: "avatar-old",
            },
        });
        binding.getState().displayNameUpdate("Grace", "Hopper");
        binding.getState().settingsInput({
            type: "settingsLoaded",
            profile: {
                id: "user-1",
                firstName: "Augusta",
                username: "lovelace",
                photoFileId: "avatar-remote",
            },
            presence: presence(),
            notifications: notifications(),
            avatarRevision: 0,
        });
        expect(binding.getState().profile).toMatchObject({
            firstName: "Grace",
            lastName: "Hopper",
            username: "lovelace",
            photoFileId: "avatar-remote",
        });
        expect(binding.getState().fields.displayName).toMatchObject({
            saved: { firstName: "Augusta" },
            save: { type: "dirty" },
        });
        expect(binding.getState().fields.username).toEqual({
            saved: "lovelace",
            save: { type: "clean" },
        });
        binding.getState().settingsInput({ type: "avatarSaved", fileId: "avatar-local" });
        binding.getState().settingsInput({
            type: "settingsLoaded",
            profile: {
                id: "user-1",
                firstName: "Augusta",
                username: "lovelace",
                photoFileId: "avatar-stale",
            },
            presence: presence(),
            notifications: notifications(),
            avatarRevision: 0,
        });
        expect(binding.getState().profile.photoFileId).toBe("avatar-local");
    });

    it("discards an older calls load after a newer load completes", async () => {
        const server = createFakeServer();
        let releaseFirst!: () => void;
        let firstStarted!: () => void;
        const started = new Promise<void>((resolve) => (firstStarted = resolve));
        server.route("GET", "/v0/calls?limit=100", async (_request, { requestNumber }) => {
            if (requestNumber === 1) {
                firstStarted();
                await new Promise<void>((resolve) => (releaseFirst = resolve));
                return jsonResponse(200, { calls: [call("old")] });
            }
            return jsonResponse(200, { calls: [call("new")] });
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const identities = new IdentityCatalog();
        const calls = callsStoreCreate();
        const context = { runtime, identities, calls };
        const first = callsLoad(context);
        await started;
        await callsLoad(context);
        releaseFirst();
        await first;
        expect(calls.getState().calls).toMatchObject({
            type: "ready",
            value: [{ id: "new" }],
        });
        runtime.stop();
    });

    it("keeps concurrent agent-image pending operations independent", () => {
        const images = agentImagesStoreCreate();
        images.getState().imageBuild("image-1");
        images.getState().defaultImageSet("image-2");
        images.getState().imageCreate("Custom", "FROM scratch");
        images.getState().agentImagesInput({
            type: "imageUpserted",
            image: image("image-1"),
            completed: "build",
        });
        expect(images.getState().pending).toEqual({
            buildImageIds: [],
            defaultImageId: "image-2",
            creating: true,
        });
        images.getState().agentImagesInput({
            type: "imageUpserted",
            image: image("image-2"),
            defaultImageId: "image-2",
            completed: "default",
        });
        expect(images.getState().pending).toEqual({ buildImageIds: [], creating: true });
    });

    it("ignores details returned for an image that is no longer selected", async () => {
        const server = createFakeServer();
        let releaseFirst!: () => void;
        server.route(
            "GET",
            (path) => path.startsWith("/v0/admin/agentImages/"),
            async (request) => {
                const id = request.path.split("/").at(-1)!;
                if (id === "image-1")
                    await new Promise<void>((resolve) => (releaseFirst = resolve));
                return jsonResponse(200, { image: imageDetails(id) });
            },
        );
        const runtime = new StateRuntime({ transport: server.transport });
        let binding: ReturnType<typeof agentImagesStoreCreate>;
        const tasks: Promise<void>[] = [];
        binding = agentImagesStoreCreate((event) =>
            tasks.push(agentImagesOutputRoute({ runtime, images: binding }, event)),
        );
        binding.getState().imageSelect("image-1");
        await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
        binding.getState().imageSelect("image-2");
        await tasks[1];
        releaseFirst();
        await tasks[0];
        expect(binding.getState().selectedImageId).toBe("image-2");
        expect(binding.getState().details["image-2"]).toMatchObject({
            type: "ready",
            value: { id: "image-2" },
        });
        expect(binding.getState().details["image-1"]?.type).toBe("loading");
        runtime.stop();
    });

    it("keeps the newest notification page when append requests overlap", async () => {
        const server = createFakeServer();
        let releaseFirst!: () => void;
        let requests = 0;
        server.route(
            "GET",
            (path) => path.startsWith("/v0/notifications?"),
            async () => {
                requests += 1;
                if (requests === 1) {
                    await new Promise<void>((resolve) => (releaseFirst = resolve));
                    return jsonResponse(200, {
                        notifications: [notification("old")],
                        nextCursor: "old-cursor",
                    });
                }
                return jsonResponse(200, {
                    notifications: [notification("new")],
                    nextCursor: "new-cursor",
                });
            },
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const identities = new IdentityCatalog();
        const center = notificationsStoreCreate();
        center.getState().notificationsInput({
            type: "notificationsLoaded",
            notifications: [],
            nextCursor: "cursor",
        });
        const first = notificationsLoad({ runtime, identities, notifications: center }, true);
        await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
        await notificationsLoad({ runtime, identities, notifications: center }, true);
        releaseFirst();
        await first;
        expect(center.getState()).toMatchObject({
            nextCursor: "new-cursor",
            notifications: { type: "ready", value: [{ id: "new" }] },
        });
        runtime.stop();
    });

    it("shares one canonical identity across notification and call projections", async () => {
        const server = createFakeServer();
        const user = {
            id: "user-2",
            username: "ada",
            firstName: "Ada",
            role: "member",
            kind: "human",
            photoFileId: "avatar-2",
        } as const;
        server.respond(
            "GET",
            "/v0/notifications?limit=100",
            jsonResponse(200, {
                notifications: [{ ...notification("notification-1"), actorUserId: user.id }],
            }),
        );
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [user], presence: [], statuses: [] }),
        );
        server.respond(
            "GET",
            "/v0/calls?limit=100",
            jsonResponse(200, {
                calls: [
                    {
                        ...call("call-1"),
                        participants: [{ userId: user.id, status: "joined" }],
                    },
                ],
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport });
        const identities = new IdentityCatalog();
        const center = notificationsStoreCreate();
        const calls = callsStoreCreate();
        await notificationsLoad({ runtime, identities, notifications: center });
        await callsLoad({ runtime, identities, calls });
        const loadedNotifications = center.getState().notifications;
        const loadedCalls = calls.getState().calls;
        const notificationActor =
            loadedNotifications.type === "ready" ? loadedNotifications.value[0]?.actor : undefined;
        const callParticipant =
            loadedCalls.type === "ready"
                ? loadedCalls.value[0]?.participants[0]?.identity
                : undefined;
        expect(notificationActor).toMatchObject({
            id: "user-2",
            displayName: "Ada",
            photoFileId: "avatar-2",
        });
        expect(callParticipant).toBe(notificationActor);
        runtime.stop();
    });
});

function presence(): PresenceSettingsSummary {
    return { userId: "user-1", availability: "automatic", updatedAt: "now" };
}

function notifications(): NotificationPreferences {
    return {
        directMessages: "all",
        mentions: "all",
        reactions: "all",
        calls: "all",
        emailNotifications: false,
        desktopNotifications: true,
    };
}

function call(id: string): CallSummary {
    return {
        id,
        chatId: "chat-1",
        kind: "audio",
        status: "ringing",
        participants: [],
        createdAt: "now",
        updatedAt: "now",
    };
}

function image(id: string): AgentImageSummary {
    return {
        id,
        name: id,
        definitionHash: "hash",
        dockerTag: "tag",
        status: "ready",
        buildAttempt: 1,
        buildProgress: 100,
        createdAt: "now",
        updatedAt: "now",
    };
}

function imageDetails(id: string): AgentImageDetails {
    return { ...image(id), dockerfile: "FROM scratch", buildLog: "", buildLogTruncated: false };
}

function notification(id: string): NotificationSummary {
    return { id, kind: "system", createdAt: "now" };
}
