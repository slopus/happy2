import { userError } from "../runtime/stateRuntime.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import type { SettingsOutput } from "./settingsTypes.js";
import type { SettingsStoreBinding } from "./settingsStore.js";

type SettingsSection = "profile" | "presence" | "notifications";

/** Owns debounced single-flight autosave while the settings store remains transport-free. */
export class SettingsCoordinator implements Disposable {
    private readonly timers = new Map<SettingsSection, ReturnType<typeof setTimeout>>();
    private readonly saving = new Set<SettingsSection>();
    private readonly trailing = new Set<SettingsSection>();
    private loadTask?: Promise<void>;
    private loadGeneration = 0;
    private loaded = false;
    private disposed = false;

    constructor(
        private readonly runtime: StateRuntime,
        private readonly binding: SettingsStoreBinding,
        private readonly delayMs = 400,
    ) {}

    output(event: SettingsOutput): void {
        if (!this.runtime.connected) return;
        const section = sectionFor(event);
        const timer = this.timers.get(section);
        if (timer) clearTimeout(timer);
        this.timers.set(
            section,
            setTimeout(() => {
                this.timers.delete(section);
                this.runtime.background(this.save(section));
            }, this.delayMs),
        );
    }

    load(): Promise<void> {
        if (this.loadTask) return this.loadTask;
        const generation = ++this.loadGeneration;
        const task = this.loadOnce(generation).finally(() => {
            if (!this.loaded && this.loadGeneration === generation && this.loadTask === task)
                this.loadTask = undefined;
        });
        this.loadTask = task;
        return task;
    }

    reload(): Promise<void> {
        this.loaded = false;
        this.loadTask = undefined;
        return this.load();
    }

    private async loadOnce(generation: number): Promise<void> {
        if (!this.runtime.connected) return;
        const avatarRevision = this.binding.avatarRevisionGet();
        try {
            const [me, contacts, presence, preferences] = await Promise.all([
                this.runtime.operation("getMe"),
                this.runtime.operation("getContacts").catch(() => undefined),
                this.runtime.operation("getPresence"),
                this.runtime.operation("getNotificationPreferences"),
            ]);
            if (this.disposed || this.loadGeneration !== generation) return;
            this.binding.settingsInput({
                type: "settingsLoaded",
                profile: me.user,
                title: contacts?.users.find((user) => user.id === me.user.id)?.title,
                presence: presence.statuses.find((status) => status.userId === me.user.id) ?? {
                    userId: me.user.id,
                    availability: "automatic",
                    updatedAt: "",
                },
                notifications: preferences.preferences,
                avatarRevision,
            });
            this.loaded = true;
        } catch (error) {
            if (!this.disposed && this.loadGeneration === generation)
                this.binding.settingsInput({ type: "settingsLoadFailed", error: userError(error) });
        }
    }

    /** Forces pending debounce work to start and waits until every trailing save is settled. */
    async whenIdle(): Promise<void> {
        do {
            const sections = [...this.timers.keys()];
            for (const section of sections) {
                const timer = this.timers.get(section);
                if (timer) clearTimeout(timer);
                this.timers.delete(section);
            }
            await Promise.all(sections.map((section) => this.save(section)));
            await this.runtime.whenIdle();
        } while (!this.disposed && (this.timers.size > 0 || this.saving.size > 0));
    }

    [Symbol.dispose](): void {
        this.disposed = true;
        for (const timer of this.timers.values()) clearTimeout(timer);
        this.timers.clear();
    }

    private async save(section: SettingsSection): Promise<void> {
        if (this.disposed) return;
        await this.load();
        if (this.disposed || !this.loaded) return;
        if (this.saving.has(section)) {
            this.trailing.add(section);
            return;
        }
        this.saving.add(section);
        try {
            if (section === "profile") await this.profileSave();
            else if (section === "presence") await this.presenceSave();
            else await this.notificationsSave();
        } finally {
            this.saving.delete(section);
            if (this.trailing.delete(section)) await this.save(section);
        }
    }

    private async profileSave(): Promise<void> {
        const profile = this.binding.store.get().profile;
        this.binding.settingsInput({ type: "profileSaving" });
        try {
            const result = await this.runtime.operation("updateProfile", {
                firstName: profile.firstName,
                lastName: profile.lastName ?? null,
                username: profile.username,
                email: profile.email ?? null,
                phone: profile.phone ?? null,
            });
            if (!this.disposed)
                this.binding.settingsInput({
                    type: "profileSaved",
                    profile: result.user,
                    submitted: profile,
                });
        } catch (error) {
            if (!this.disposed)
                this.binding.settingsInput({ type: "profileSaveFailed", error: userError(error) });
        }
    }

    private async presenceSave(): Promise<void> {
        const value = this.binding.store.get().presence;
        this.binding.settingsInput({ type: "presenceSaving" });
        try {
            const result = await this.runtime.operation("updateStatus", {
                availability: value.availability,
                customStatusText: value.customStatusText ?? null,
                customStatusEmoji: value.customStatusEmoji ?? null,
                statusExpiresAt: value.statusExpiresAt ?? null,
                dndUntil: value.dndUntil ?? null,
            });
            if (!this.disposed)
                this.binding.settingsInput({
                    type: "presenceSaved",
                    presence: result.status,
                    submitted: value,
                });
        } catch (error) {
            if (!this.disposed)
                this.binding.settingsInput({ type: "presenceSaveFailed", error: userError(error) });
        }
    }

    private async notificationsSave(): Promise<void> {
        const value = this.binding.store.get().notifications;
        this.binding.settingsInput({ type: "notificationsSaving" });
        try {
            const result = await this.runtime.operation("updateNotificationPreferences", {
                ...value,
                dndStartMinutes: value.dndStartMinutes ?? null,
                dndEndMinutes: value.dndEndMinutes ?? null,
                timezone: value.timezone ?? null,
            });
            if (!this.disposed)
                this.binding.settingsInput({
                    type: "notificationsSaved",
                    notifications: result.preferences,
                    submitted: value,
                });
        } catch (error) {
            if (!this.disposed)
                this.binding.settingsInput({
                    type: "notificationsSaveFailed",
                    error: userError(error),
                });
        }
    }
}

function sectionFor(event: SettingsOutput): SettingsSection {
    if (
        event.type === "displayNameUpdated" ||
        event.type === "usernameUpdated" ||
        event.type === "emailUpdated" ||
        event.type === "phoneUpdated"
    )
        return "profile";
    if (
        event.type === "availabilityUpdated" ||
        event.type === "statusTextUpdated" ||
        event.type === "statusEmojiUpdated" ||
        event.type === "statusExpiryUpdated" ||
        event.type === "dndUntilUpdated"
    )
        return "presence";
    return "notifications";
}
