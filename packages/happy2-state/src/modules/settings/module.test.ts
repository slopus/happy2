import { describe, expect, it, vi } from "vitest";
import { UserError } from "../../types.js";
import type { ClientTransport, HttpRequest, HttpResponse } from "../../transport.js";
import { StateRuntime } from "../runtime/stateRuntime.js";
import { avatarUpload } from "./avatarUpload.js";
import { settingsStoreCreateBinding } from "./settingsStore.js";

describe("settings module", () => {
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
        const binding = settingsStoreCreateBinding(
            { profile: { id: "user-1", firstName: "Ada", username: "ada" } },
            output,
        );
        binding.store.displayNameUpdate("Grace", "Hopper");
        binding.store.usernameUpdate("grace");
        binding.store.emailUpdate("grace@example.com");
        binding.store.phoneUpdate("123");
        binding.store.availabilityUpdate("away");
        binding.store.statusTextUpdate("Working");
        binding.store.statusEmojiUpdate("🛠️");
        binding.store.statusExpiryUpdate("later");
        binding.store.dndUntilUpdate("tomorrow");
        binding.store.directMessagesUpdate("none");
        binding.store.mentionsUpdate("none");
        binding.store.threadRepliesUpdate("mentions");
        binding.store.reactionsUpdate("none");
        binding.store.callsUpdate("none");
        binding.store.emailNotificationsUpdate(true);
        binding.store.desktopNotificationsUpdate(false);
        binding.store.dndScheduleUpdate(60, 120);
        binding.store.timezoneUpdate("UTC");
        expect(output).toHaveBeenCalledTimes(18);
        expect(
            Object.values(binding.store.get().fields).every((field) => field.save.type === "dirty"),
        ).toBe(true);

        binding.settingsInput({ type: "profileSaving" });
        binding.settingsInput({ type: "profileSaveFailed", error: new UserError("profile") });
        expect(binding.store.get().fields.username.save.type).toBe("error");
        binding.settingsInput({ type: "presenceSaving" });
        binding.settingsInput({ type: "presenceSaveFailed", error: new UserError("presence") });
        expect(binding.store.get().fields.availability.save.type).toBe("error");
        binding.settingsInput({ type: "notificationsSaving" });
        binding.settingsInput({
            type: "notificationsSaveFailed",
            error: new UserError("notifications"),
        });
        expect(binding.store.get().fields.calls.save.type).toBe("error");
        binding.dispose();
    });

    it("merges save responses per field while preserving newer edits and avatar state", () => {
        const binding = settingsStoreCreateBinding({
            profile: {
                id: "user-1",
                firstName: "Ada",
                username: "ada",
                photoFileId: "avatar-old",
            },
        });

        binding.store.displayNameUpdate("Grace");
        binding.store.usernameUpdate("grace");
        const submittedProfile = binding.store.get().profile;
        binding.settingsInput({ type: "profileSaving" });
        binding.store.usernameUpdate("hopper");
        binding.settingsInput({ type: "avatarSaved", fileId: "avatar-new" });
        binding.settingsInput({
            type: "profileSaved",
            submitted: submittedProfile,
            profile: {
                ...submittedProfile,
                firstName: "Grace (saved)",
                photoFileId: "avatar-stale",
            },
        });
        expect(binding.store.get().profile).toMatchObject({
            firstName: "Grace (saved)",
            username: "hopper",
            photoFileId: "avatar-new",
        });
        expect(binding.store.get().fields.displayName.save.type).toBe("clean");
        expect(binding.store.get().fields.username.save.type).toBe("dirty");
        expect(binding.store.get().profileSave.type).toBe("dirty");

        binding.store.availabilityUpdate("away");
        binding.store.statusTextUpdate("submitted");
        const submittedPresence = binding.store.get().presence;
        binding.settingsInput({ type: "presenceSaving" });
        binding.store.statusTextUpdate("newer");
        binding.settingsInput({
            type: "presenceSaved",
            submitted: submittedPresence,
            presence: {
                ...submittedPresence,
                availability: "away",
                customStatusText: "server-normalized",
                updatedAt: "saved",
            },
        });
        expect(binding.store.get().presence).toMatchObject({
            availability: "away",
            customStatusText: "newer",
            updatedAt: "saved",
        });
        expect(binding.store.get().fields.availability.save.type).toBe("clean");
        expect(binding.store.get().fields.statusText.save.type).toBe("dirty");
        expect(binding.store.get().presenceSave.type).toBe("dirty");

        binding.store.directMessagesUpdate("none");
        binding.store.mentionsUpdate("none");
        const submittedNotifications = binding.store.get().notifications;
        binding.settingsInput({ type: "notificationsSaving" });
        binding.store.mentionsUpdate("all");
        binding.settingsInput({
            type: "notificationsSaved",
            submitted: submittedNotifications,
            notifications: {
                ...submittedNotifications,
                directMessages: "none",
                mentions: "none",
            },
        });
        expect(binding.store.get().notifications).toMatchObject({
            directMessages: "none",
            mentions: "all",
        });
        expect(binding.store.get().fields.directMessages.save.type).toBe("clean");
        expect(binding.store.get().fields.mentions.save.type).toBe("dirty");
        expect(binding.store.get().notificationsSave.type).toBe("dirty");
        binding.dispose();
    });
});
