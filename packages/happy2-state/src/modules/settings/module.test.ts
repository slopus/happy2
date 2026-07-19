import { describe, expect, it, vi } from "vitest";
import { UserError } from "../../types.js";
import type { ClientTransport, HttpRequest, HttpResponse } from "../../transport.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { avatarUpload, developmentTokenCreate } from "./settingsState.js";
import { settingsStoreCreate } from "./settingsState.js";

describe("settings module", () => {
    it("creates a session-bound development token once without idempotency or retry", async () => {
        const credential = {
            token: "happy2_dev_secret",
            sessionId: "session-1",
            expiresAt: "2026-07-20T01:00:00.000Z",
        };
        const requests: HttpRequest[] = [];
        let fail = false;
        const transport: ClientTransport = {
            async request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>> {
                requests.push(request);
                return fail
                    ? ({
                          status: 503,
                          body: { error: "unavailable" } as T,
                      } satisfies HttpResponse<T>)
                    : ({ status: 201, body: credential as T } satisfies HttpResponse<T>);
            },
            subscribe: () => () => undefined,
        };
        const runtime = new StateRuntime({ transport });

        await expect(developmentTokenCreate({ runtime })).resolves.toEqual(credential);
        expect(requests).toEqual([
            {
                method: "POST",
                path: "/v0/me/createDevToken",
                body: {},
            },
        ]);

        fail = true;
        await expect(developmentTokenCreate({ runtime })).rejects.toEqual(
            expect.objectContaining({ name: "UserError" }),
        );
        expect(requests).toHaveLength(2);
        expect(requests[1]?.headers?.["idempotency-key"]).toBeUndefined();
        runtime.stop();
    });

    it("uploads an avatar candidate through the typed settings action", async () => {
        const uploaded = {
            id: "avatar-1",
            originalName: "avatar.png",
            contentType: "image/png",
            kind: "image" as const,
            size: 4,
            uploadedByUserId: "user-1",
            createdAt: "now",
        };
        const body = new FormData();
        body.append("file", new Blob(["face"], { type: "image/png" }), "avatar.png");
        const requests: HttpRequest[] = [];
        const transport: ClientTransport = {
            async request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>> {
                requests.push(request);
                return { status: 200, body: { file: uploaded } as T };
            },
            subscribe: () => () => undefined,
        };
        const runtime = new StateRuntime({ transport });

        await expect(avatarUpload({ runtime }, body)).resolves.toEqual(uploaded);
        expect(requests).toEqual([
            {
                method: "POST",
                path: "/v0/me/uploadAvatarFile",
                body,
            },
        ]);
        runtime.stop();
    });

    it("provides one explicit typed action and save state for every editable field", () => {
        const output = vi.fn();
        const binding = settingsStoreCreate(
            { profile: { id: "user-1", firstName: "Ada", username: "ada" } },
            output,
        );
        binding.getState().displayNameUpdate("Grace", "Hopper");
        binding.getState().usernameUpdate("grace");
        binding.getState().emailUpdate("grace@example.com");
        binding.getState().phoneUpdate("123");
        binding.getState().availabilityUpdate("away");
        binding.getState().statusTextUpdate("Working");
        binding.getState().statusEmojiUpdate("🛠️");
        binding.getState().statusExpiryUpdate("later");
        binding.getState().dndUntilUpdate("tomorrow");
        binding.getState().directMessagesUpdate("none");
        binding.getState().mentionsUpdate("none");
        binding.getState().threadRepliesUpdate("mentions");
        binding.getState().reactionsUpdate("none");
        binding.getState().callsUpdate("none");
        binding.getState().emailNotificationsUpdate(true);
        binding.getState().desktopNotificationsUpdate(false);
        binding.getState().dndScheduleUpdate(60, 120);
        binding.getState().timezoneUpdate("UTC");
        expect(output).toHaveBeenCalledTimes(18);
        expect(
            Object.values(binding.getState().fields).every((field) => field.save.type === "dirty"),
        ).toBe(true);

        binding.getState().settingsInput({ type: "profileSaving" });
        binding
            .getState()
            .settingsInput({ type: "profileSaveFailed", error: new UserError("profile") });
        expect(binding.getState().fields.username.save.type).toBe("error");
        binding.getState().settingsInput({ type: "presenceSaving" });
        binding
            .getState()
            .settingsInput({ type: "presenceSaveFailed", error: new UserError("presence") });
        expect(binding.getState().fields.availability.save.type).toBe("error");
        binding.getState().settingsInput({ type: "notificationsSaving" });
        binding.getState().settingsInput({
            type: "notificationsSaveFailed",
            error: new UserError("notifications"),
        });
        expect(binding.getState().fields.calls.save.type).toBe("error");
    });

    it("merges save responses per field while preserving newer edits and avatar state", () => {
        const binding = settingsStoreCreate({
            profile: {
                id: "user-1",
                firstName: "Ada",
                username: "ada",
                photoFileId: "avatar-old",
            },
        });

        binding.getState().displayNameUpdate("Grace");
        binding.getState().usernameUpdate("grace");
        const submittedProfile = binding.getState().profile;
        binding.getState().settingsInput({ type: "profileSaving" });
        binding.getState().usernameUpdate("hopper");
        binding.getState().settingsInput({ type: "avatarSaved", fileId: "avatar-new" });
        binding.getState().settingsInput({
            type: "profileSaved",
            submitted: submittedProfile,
            profile: {
                ...submittedProfile,
                firstName: "Grace (saved)",
                photoFileId: "avatar-stale",
            },
        });
        expect(binding.getState().profile).toMatchObject({
            firstName: "Grace (saved)",
            username: "hopper",
            photoFileId: "avatar-new",
        });
        expect(binding.getState().fields.displayName.save.type).toBe("clean");
        expect(binding.getState().fields.username.save.type).toBe("dirty");
        expect(binding.getState().profileSave.type).toBe("dirty");

        binding.getState().availabilityUpdate("away");
        binding.getState().statusTextUpdate("submitted");
        const submittedPresence = binding.getState().presence;
        binding.getState().settingsInput({ type: "presenceSaving" });
        binding.getState().statusTextUpdate("newer");
        binding.getState().settingsInput({
            type: "presenceSaved",
            submitted: submittedPresence,
            presence: {
                ...submittedPresence,
                availability: "away",
                customStatusText: "server-normalized",
                updatedAt: "saved",
            },
        });
        expect(binding.getState().presence).toMatchObject({
            availability: "away",
            customStatusText: "newer",
            updatedAt: "saved",
        });
        expect(binding.getState().fields.availability.save.type).toBe("clean");
        expect(binding.getState().fields.statusText.save.type).toBe("dirty");
        expect(binding.getState().presenceSave.type).toBe("dirty");

        binding.getState().directMessagesUpdate("none");
        binding.getState().mentionsUpdate("none");
        const submittedNotifications = binding.getState().notifications;
        binding.getState().settingsInput({ type: "notificationsSaving" });
        binding.getState().mentionsUpdate("all");
        binding.getState().settingsInput({
            type: "notificationsSaved",
            submitted: submittedNotifications,
            notifications: {
                ...submittedNotifications,
                directMessages: "none",
                mentions: "none",
            },
        });
        expect(binding.getState().notifications).toMatchObject({
            directMessages: "none",
            mentions: "all",
        });
        expect(binding.getState().fields.directMessages.save.type).toBe("clean");
        expect(binding.getState().fields.mentions.save.type).toBe("dirty");
        expect(binding.getState().notificationsSave.type).toBe("dirty");
    });
});
