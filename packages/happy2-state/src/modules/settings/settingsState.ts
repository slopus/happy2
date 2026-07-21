import { createStore, type StoreApi } from "zustand/vanilla";
import {
    type ClientUser,
    type DevelopmentTokenCredential,
    type NotificationPreferences,
    type UploadedFile,
} from "../../resources.js";
import { type PresenceSettingsSummary, type UserError } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface AvatarUploadContext {
    readonly runtime: StateRuntime;
}

export interface DevelopmentTokenCreateContext {
    readonly runtime: StateRuntime;
}

/** Creates a one-time development credential without retaining or broadcasting its secret. */
export async function developmentTokenCreate(
    context: DevelopmentTokenCreateContext,
): Promise<DevelopmentTokenCredential> {
    return context.runtime.operation("createDevelopmentToken");
}

/** Uploads an avatar candidate without applying it, keeping upload and profile mutation explicit. */
export async function avatarUpload(
    context: AvatarUploadContext,
    body: FormData,
): Promise<UploadedFile> {
    const result = await context.runtime.operation("uploadAvatarFile", { body });
    return result.file;
}

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
        private readonly store: SettingsStore,
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
        const avatarRevision = settingsAvatarRevisionGet(this.store);
        try {
            const [me, contacts, presence, preferences] = await Promise.all([
                this.runtime.operation("getMe"),
                this.runtime.operation("getContacts").catch(() => undefined),
                this.runtime.operation("getPresence"),
                this.runtime.operation("getNotificationPreferences"),
            ]);
            if (this.disposed || this.loadGeneration !== generation) return;
            this.store.getState().settingsInput({
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
                this.store
                    .getState()
                    .settingsInput({ type: "settingsLoadFailed", error: userError(error) });
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
        const profile = this.store.getState().profile;
        this.store.getState().settingsInput({ type: "profileSaving" });
        try {
            const result = await this.runtime.operation("updateProfile", {
                firstName: profile.firstName,
                lastName: profile.lastName ?? null,
                username: profile.username,
                email: profile.email ?? null,
                phone: profile.phone ?? null,
            });
            if (!this.disposed)
                this.store.getState().settingsInput({
                    type: "profileSaved",
                    profile: result.user,
                    submitted: profile,
                });
        } catch (error) {
            if (!this.disposed)
                this.store
                    .getState()
                    .settingsInput({ type: "profileSaveFailed", error: userError(error) });
        }
    }

    private async presenceSave(): Promise<void> {
        const value = this.store.getState().presence;
        this.store.getState().settingsInput({ type: "presenceSaving" });
        try {
            const result = await this.runtime.operation("updateStatus", {
                availability: value.availability,
                customStatusText: value.customStatusText ?? null,
                customStatusEmoji: value.customStatusEmoji ?? null,
                statusExpiresAt: value.statusExpiresAt ?? null,
                dndUntil: value.dndUntil ?? null,
            });
            if (!this.disposed)
                this.store.getState().settingsInput({
                    type: "presenceSaved",
                    presence: result.status,
                    submitted: value,
                });
        } catch (error) {
            if (!this.disposed)
                this.store
                    .getState()
                    .settingsInput({ type: "presenceSaveFailed", error: userError(error) });
        }
    }

    private async notificationsSave(): Promise<void> {
        const value = this.store.getState().notifications;
        this.store.getState().settingsInput({ type: "notificationsSaving" });
        try {
            const result = await this.runtime.operation("updateNotificationPreferences", {
                ...value,
                dndStartMinutes: value.dndStartMinutes ?? null,
                dndEndMinutes: value.dndEndMinutes ?? null,
                timezone: value.timezone ?? null,
            });
            if (!this.disposed)
                this.store.getState().settingsInput({
                    type: "notificationsSaved",
                    notifications: result.preferences,
                    submitted: value,
                });
        } catch (error) {
            if (!this.disposed)
                this.store.getState().settingsInput({
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

interface SettingsFieldState<Value> {
    readonly saved: Value;
    readonly save: SettingsSaveState;
}

const avatarRevisions = new WeakMap<SettingsStore, number>();

function settingsAvatarRevisionGet(store: SettingsStore): number {
    return avatarRevisions.get(store) ?? 0;
}

const emptyNotifications: NotificationPreferences = {
    directMessages: "all",
    mentions: "all",
    reactions: "all",
    calls: "all",
    emailNotifications: false,
    desktopNotifications: true,
};

/** Creates one settings-screen store with explicit field actions and section save states. */
export function settingsStoreCreate(
    options: SettingsStoreOptions = {},
    output: (event: SettingsOutput) => void = () => undefined,
): SettingsStore {
    const profile: ClientUser = {
        id: options.profile?.id ?? "",
        firstName: options.profile?.firstName ?? "",
        username: options.profile?.username ?? "",
        ...(options.profile?.lastName ? { lastName: options.profile.lastName } : {}),
        ...(options.profile?.email ? { email: options.profile.email } : {}),
        ...(options.profile?.phone ? { phone: options.profile.phone } : {}),
        ...(options.profile?.photoFileId ? { photoFileId: options.profile.photoFileId } : {}),
    };
    let store!: SettingsStore;
    store = createStore<SettingsState>()((set) => {
        const local = <Event extends SettingsOutput>(
            event: Event,
            update: (snapshot: SettingsSnapshot) => SettingsSnapshot,
        ): void => {
            let changed = false;
            set((snapshot) => {
                const next = update(snapshot);
                changed = next !== snapshot;
                return next;
            });
            if (changed) output(event);
        };
        return {
            status: { type: "unloaded" },
            profile,
            presence: { userId: profile.id, availability: "automatic", updatedAt: "" },
            notifications: emptyNotifications,
            fields: fieldsCreate(profile, emptyNotifications),
            profileSave: { type: "clean" },
            presenceSave: { type: "clean" },
            notificationsSave: { type: "clean" },
            displayNameUpdate(firstName, lastName): void {
                local({ type: "displayNameUpdated" }, (snapshot) =>
                    snapshot.profile.firstName === firstName &&
                    snapshot.profile.lastName === lastName
                        ? snapshot
                        : {
                              ...snapshot,
                              profile: { ...snapshot.profile, firstName, lastName },
                              fields: {
                                  ...snapshot.fields,
                                  displayName: fieldChanged(
                                      snapshot.fields.displayName,
                                      { firstName, lastName },
                                      (left, right) =>
                                          left.firstName === right.firstName &&
                                          left.lastName === right.lastName,
                                  ),
                              },
                              profileSave: { type: "dirty" },
                          },
                );
            },
            usernameUpdate(username): void {
                local({ type: "usernameUpdated" }, (snapshot) =>
                    snapshot.profile.username === username
                        ? snapshot
                        : {
                              ...snapshot,
                              profile: { ...snapshot.profile, username },
                              fields: {
                                  ...snapshot.fields,
                                  username: fieldChanged(snapshot.fields.username, username),
                              },
                              profileSave: { type: "dirty" },
                          },
                );
            },
            emailUpdate(email): void {
                local({ type: "emailUpdated" }, (snapshot) =>
                    snapshot.profile.email === email
                        ? snapshot
                        : {
                              ...snapshot,
                              profile: { ...snapshot.profile, email },
                              fields: {
                                  ...snapshot.fields,
                                  email: fieldChanged(snapshot.fields.email, email),
                              },
                              profileSave: { type: "dirty" },
                          },
                );
            },
            phoneUpdate(phone): void {
                local({ type: "phoneUpdated" }, (snapshot) =>
                    snapshot.profile.phone === phone
                        ? snapshot
                        : {
                              ...snapshot,
                              profile: { ...snapshot.profile, phone },
                              fields: {
                                  ...snapshot.fields,
                                  phone: fieldChanged(snapshot.fields.phone, phone),
                              },
                              profileSave: { type: "dirty" },
                          },
                );
            },
            availabilityUpdate(availability): void {
                local({ type: "availabilityUpdated" }, (snapshot) =>
                    snapshot.presence.availability === availability
                        ? snapshot
                        : {
                              ...snapshot,
                              presence: { ...snapshot.presence, availability },
                              fields: {
                                  ...snapshot.fields,
                                  availability: fieldChanged(
                                      snapshot.fields.availability,
                                      availability,
                                  ),
                              },
                              presenceSave: { type: "dirty" },
                          },
                );
            },
            statusTextUpdate(customStatusText): void {
                local({ type: "statusTextUpdated" }, (snapshot) =>
                    snapshot.presence.customStatusText === customStatusText
                        ? snapshot
                        : {
                              ...snapshot,
                              presence: { ...snapshot.presence, customStatusText },
                              fields: {
                                  ...snapshot.fields,
                                  statusText: fieldChanged(
                                      snapshot.fields.statusText,
                                      customStatusText,
                                  ),
                              },
                              presenceSave: { type: "dirty" },
                          },
                );
            },
            statusEmojiUpdate(customStatusEmoji): void {
                local({ type: "statusEmojiUpdated" }, (snapshot) =>
                    snapshot.presence.customStatusEmoji === customStatusEmoji
                        ? snapshot
                        : {
                              ...snapshot,
                              presence: { ...snapshot.presence, customStatusEmoji },
                              fields: {
                                  ...snapshot.fields,
                                  statusEmoji: fieldChanged(
                                      snapshot.fields.statusEmoji,
                                      customStatusEmoji,
                                  ),
                              },
                              presenceSave: { type: "dirty" },
                          },
                );
            },
            statusExpiryUpdate(statusExpiresAt): void {
                local({ type: "statusExpiryUpdated" }, (snapshot) =>
                    snapshot.presence.statusExpiresAt === statusExpiresAt
                        ? snapshot
                        : {
                              ...snapshot,
                              presence: { ...snapshot.presence, statusExpiresAt },
                              fields: {
                                  ...snapshot.fields,
                                  statusExpiry: fieldChanged(
                                      snapshot.fields.statusExpiry,
                                      statusExpiresAt,
                                  ),
                              },
                              presenceSave: { type: "dirty" },
                          },
                );
            },
            dndUntilUpdate(dndUntil): void {
                local({ type: "dndUntilUpdated" }, (snapshot) =>
                    snapshot.presence.dndUntil === dndUntil
                        ? snapshot
                        : {
                              ...snapshot,
                              presence: { ...snapshot.presence, dndUntil },
                              fields: {
                                  ...snapshot.fields,
                                  dndUntil: fieldChanged(snapshot.fields.dndUntil, dndUntil),
                              },
                              presenceSave: { type: "dirty" },
                          },
                );
            },
            directMessagesUpdate(directMessages): void {
                local({ type: "directMessagesUpdated" }, (snapshot) =>
                    snapshot.notifications.directMessages === directMessages
                        ? snapshot
                        : notificationUpdate(snapshot, {
                              notifications: { ...snapshot.notifications, directMessages },
                              fields: {
                                  ...snapshot.fields,
                                  directMessages: fieldChanged(
                                      snapshot.fields.directMessages,
                                      directMessages,
                                  ),
                              },
                          }),
                );
            },
            mentionsUpdate(mentions): void {
                local({ type: "mentionsUpdated" }, (snapshot) =>
                    snapshot.notifications.mentions === mentions
                        ? snapshot
                        : notificationUpdate(snapshot, {
                              notifications: { ...snapshot.notifications, mentions },
                              fields: {
                                  ...snapshot.fields,
                                  mentions: fieldChanged(snapshot.fields.mentions, mentions),
                              },
                          }),
                );
            },
            reactionsUpdate(reactions): void {
                local({ type: "reactionsUpdated" }, (snapshot) =>
                    snapshot.notifications.reactions === reactions
                        ? snapshot
                        : notificationUpdate(snapshot, {
                              notifications: { ...snapshot.notifications, reactions },
                              fields: {
                                  ...snapshot.fields,
                                  reactions: fieldChanged(snapshot.fields.reactions, reactions),
                              },
                          }),
                );
            },
            callsUpdate(calls): void {
                local({ type: "callsUpdated" }, (snapshot) =>
                    snapshot.notifications.calls === calls
                        ? snapshot
                        : notificationUpdate(snapshot, {
                              notifications: { ...snapshot.notifications, calls },
                              fields: {
                                  ...snapshot.fields,
                                  calls: fieldChanged(snapshot.fields.calls, calls),
                              },
                          }),
                );
            },
            emailNotificationsUpdate(emailNotifications): void {
                local({ type: "emailNotificationsUpdated" }, (snapshot) =>
                    snapshot.notifications.emailNotifications === emailNotifications
                        ? snapshot
                        : notificationUpdate(snapshot, {
                              notifications: { ...snapshot.notifications, emailNotifications },
                              fields: {
                                  ...snapshot.fields,
                                  emailNotifications: fieldChanged(
                                      snapshot.fields.emailNotifications,
                                      emailNotifications,
                                  ),
                              },
                          }),
                );
            },
            desktopNotificationsUpdate(desktopNotifications): void {
                local({ type: "desktopNotificationsUpdated" }, (snapshot) =>
                    snapshot.notifications.desktopNotifications === desktopNotifications
                        ? snapshot
                        : notificationUpdate(snapshot, {
                              notifications: { ...snapshot.notifications, desktopNotifications },
                              fields: {
                                  ...snapshot.fields,
                                  desktopNotifications: fieldChanged(
                                      snapshot.fields.desktopNotifications,
                                      desktopNotifications,
                                  ),
                              },
                          }),
                );
            },
            dndScheduleUpdate(dndStartMinutes, dndEndMinutes): void {
                local({ type: "dndScheduleUpdated" }, (snapshot) =>
                    snapshot.notifications.dndStartMinutes === dndStartMinutes &&
                    snapshot.notifications.dndEndMinutes === dndEndMinutes
                        ? snapshot
                        : {
                              ...snapshot,
                              notifications: {
                                  ...snapshot.notifications,
                                  dndStartMinutes,
                                  dndEndMinutes,
                              },
                              fields: {
                                  ...snapshot.fields,
                                  dndSchedule: fieldChanged(
                                      snapshot.fields.dndSchedule,
                                      { startMinutes: dndStartMinutes, endMinutes: dndEndMinutes },
                                      (left, right) =>
                                          left.startMinutes === right.startMinutes &&
                                          left.endMinutes === right.endMinutes,
                                  ),
                              },
                              notificationsSave: { type: "dirty" },
                          },
                );
            },
            timezoneUpdate(timezone): void {
                local({ type: "timezoneUpdated" }, (snapshot) =>
                    snapshot.notifications.timezone === timezone
                        ? snapshot
                        : notificationUpdate(snapshot, {
                              notifications: { ...snapshot.notifications, timezone },
                              fields: {
                                  ...snapshot.fields,
                                  timezone: fieldChanged(snapshot.fields.timezone, timezone),
                              },
                          }),
                );
            },
            settingsInput(event): void {
                const avatarRevision =
                    event.type === "avatarSaved"
                        ? settingsAvatarRevisionGet(store) + 1
                        : settingsAvatarRevisionGet(store);
                if (event.type === "avatarSaved") avatarRevisions.set(store, avatarRevision);
                set((snapshot) => {
                    switch (event.type) {
                        case "settingsLoaded":
                            return settingsLoaded(snapshot, event, avatarRevision);
                        case "settingsLoadFailed":
                            return { ...snapshot, status: { type: "error", error: event.error } };
                        case "profileSaving":
                            return {
                                ...snapshot,
                                profileSave: { type: "saving" },
                                fields: {
                                    ...snapshot.fields,
                                    displayName: fieldSaving(snapshot.fields.displayName),
                                    username: fieldSaving(snapshot.fields.username),
                                    email: fieldSaving(snapshot.fields.email),
                                    phone: fieldSaving(snapshot.fields.phone),
                                },
                            };
                        case "profileSaved":
                            return profileSaved(snapshot, event.profile, event.submitted);
                        case "profileSaveFailed":
                            return {
                                ...snapshot,
                                profileSave: { type: "error", error: event.error },
                                fields: {
                                    ...snapshot.fields,
                                    displayName: fieldFailed(
                                        snapshot.fields.displayName,
                                        event.error,
                                    ),
                                    username: fieldFailed(snapshot.fields.username, event.error),
                                    email: fieldFailed(snapshot.fields.email, event.error),
                                    phone: fieldFailed(snapshot.fields.phone, event.error),
                                },
                            };
                        case "avatarSaved":
                            return {
                                ...snapshot,
                                profile: { ...snapshot.profile, photoFileId: event.fileId },
                            };
                        case "presenceSaving":
                            return {
                                ...snapshot,
                                presenceSave: { type: "saving" },
                                fields: {
                                    ...snapshot.fields,
                                    availability: fieldSaving(snapshot.fields.availability),
                                    statusText: fieldSaving(snapshot.fields.statusText),
                                    statusEmoji: fieldSaving(snapshot.fields.statusEmoji),
                                    statusExpiry: fieldSaving(snapshot.fields.statusExpiry),
                                    dndUntil: fieldSaving(snapshot.fields.dndUntil),
                                },
                            };
                        case "presenceSaved":
                            return presenceSaved(snapshot, event.presence, event.submitted);
                        case "presenceSaveFailed":
                            return {
                                ...snapshot,
                                presenceSave: { type: "error", error: event.error },
                                fields: {
                                    ...snapshot.fields,
                                    availability: fieldFailed(
                                        snapshot.fields.availability,
                                        event.error,
                                    ),
                                    statusText: fieldFailed(
                                        snapshot.fields.statusText,
                                        event.error,
                                    ),
                                    statusEmoji: fieldFailed(
                                        snapshot.fields.statusEmoji,
                                        event.error,
                                    ),
                                    statusExpiry: fieldFailed(
                                        snapshot.fields.statusExpiry,
                                        event.error,
                                    ),
                                    dndUntil: fieldFailed(snapshot.fields.dndUntil, event.error),
                                },
                            };
                        case "notificationsSaving":
                            return {
                                ...snapshot,
                                notificationsSave: { type: "saving" },
                                fields: notificationFieldsMap(snapshot.fields, fieldSaving),
                            };
                        case "notificationsSaved":
                            return notificationsSaved(
                                snapshot,
                                event.notifications,
                                event.submitted,
                            );
                        case "notificationsSaveFailed":
                            return {
                                ...snapshot,
                                notificationsSave: { type: "error", error: event.error },
                                fields: notificationFieldsMap(snapshot.fields, (field) =>
                                    fieldFailed(field, event.error),
                                ),
                            };
                    }
                });
            },
        };
    });
    avatarRevisions.set(store, 0);
    return store;
}

function notificationUpdate(
    snapshot: SettingsSnapshot,
    update: Pick<SettingsSnapshot, "notifications" | "fields">,
): SettingsSnapshot {
    return { ...snapshot, ...update, notificationsSave: { type: "dirty" } };
}

function settingsLoaded(
    snapshot: SettingsSnapshot,
    event: Extract<SettingsInput, { readonly type: "settingsLoaded" }>,
    avatarRevision: number,
): SettingsSnapshot {
    const remote = fieldsCreate(event.profile, event.notifications, event.presence);
    const displayName = fieldCurrent(
        snapshot.fields.displayName,
        { firstName: snapshot.profile.firstName, lastName: snapshot.profile.lastName },
        remote.displayName.saved,
    );
    const dndSchedule = fieldCurrent(
        snapshot.fields.dndSchedule,
        {
            startMinutes: snapshot.notifications.dndStartMinutes,
            endMinutes: snapshot.notifications.dndEndMinutes,
        },
        remote.dndSchedule.saved,
    );
    return {
        ...snapshot,
        status: { type: "ready", value: true },
        title: event.title,
        profile: {
            ...event.profile,
            firstName: displayName.firstName,
            lastName: displayName.lastName,
            username: fieldCurrent(
                snapshot.fields.username,
                snapshot.profile.username,
                event.profile.username,
            ),
            email: fieldCurrent(snapshot.fields.email, snapshot.profile.email, event.profile.email),
            phone: fieldCurrent(snapshot.fields.phone, snapshot.profile.phone, event.profile.phone),
            photoFileId:
                event.avatarRevision === avatarRevision
                    ? event.profile.photoFileId
                    : snapshot.profile.photoFileId,
        },
        presence: {
            ...event.presence,
            availability: fieldCurrent(
                snapshot.fields.availability,
                snapshot.presence.availability,
                event.presence.availability,
            ),
            customStatusText: fieldCurrent(
                snapshot.fields.statusText,
                snapshot.presence.customStatusText,
                event.presence.customStatusText,
            ),
            customStatusEmoji: fieldCurrent(
                snapshot.fields.statusEmoji,
                snapshot.presence.customStatusEmoji,
                event.presence.customStatusEmoji,
            ),
            statusExpiresAt: fieldCurrent(
                snapshot.fields.statusExpiry,
                snapshot.presence.statusExpiresAt,
                event.presence.statusExpiresAt,
            ),
            dndUntil: fieldCurrent(
                snapshot.fields.dndUntil,
                snapshot.presence.dndUntil,
                event.presence.dndUntil,
            ),
        },
        notifications: {
            ...event.notifications,
            directMessages: fieldCurrent(
                snapshot.fields.directMessages,
                snapshot.notifications.directMessages,
                event.notifications.directMessages,
            ),
            mentions: fieldCurrent(
                snapshot.fields.mentions,
                snapshot.notifications.mentions,
                event.notifications.mentions,
            ),
            reactions: fieldCurrent(
                snapshot.fields.reactions,
                snapshot.notifications.reactions,
                event.notifications.reactions,
            ),
            calls: fieldCurrent(
                snapshot.fields.calls,
                snapshot.notifications.calls,
                event.notifications.calls,
            ),
            emailNotifications: fieldCurrent(
                snapshot.fields.emailNotifications,
                snapshot.notifications.emailNotifications,
                event.notifications.emailNotifications,
            ),
            desktopNotifications: fieldCurrent(
                snapshot.fields.desktopNotifications,
                snapshot.notifications.desktopNotifications,
                event.notifications.desktopNotifications,
            ),
            dndStartMinutes: dndSchedule.startMinutes,
            dndEndMinutes: dndSchedule.endMinutes,
            timezone: fieldCurrent(
                snapshot.fields.timezone,
                snapshot.notifications.timezone,
                event.notifications.timezone,
            ),
        },
        fields: {
            displayName: fieldRemote(snapshot.fields.displayName, remote.displayName.saved),
            username: fieldRemote(snapshot.fields.username, remote.username.saved),
            email: fieldRemote(snapshot.fields.email, remote.email.saved),
            phone: fieldRemote(snapshot.fields.phone, remote.phone.saved),
            availability: fieldRemote(snapshot.fields.availability, remote.availability.saved),
            statusText: fieldRemote(snapshot.fields.statusText, remote.statusText.saved),
            statusEmoji: fieldRemote(snapshot.fields.statusEmoji, remote.statusEmoji.saved),
            statusExpiry: fieldRemote(snapshot.fields.statusExpiry, remote.statusExpiry.saved),
            dndUntil: fieldRemote(snapshot.fields.dndUntil, remote.dndUntil.saved),
            directMessages: fieldRemote(
                snapshot.fields.directMessages,
                remote.directMessages.saved,
            ),
            mentions: fieldRemote(snapshot.fields.mentions, remote.mentions.saved),
            reactions: fieldRemote(snapshot.fields.reactions, remote.reactions.saved),
            calls: fieldRemote(snapshot.fields.calls, remote.calls.saved),
            emailNotifications: fieldRemote(
                snapshot.fields.emailNotifications,
                remote.emailNotifications.saved,
            ),
            desktopNotifications: fieldRemote(
                snapshot.fields.desktopNotifications,
                remote.desktopNotifications.saved,
            ),
            dndSchedule: fieldRemote(snapshot.fields.dndSchedule, remote.dndSchedule.saved),
            timezone: fieldRemote(snapshot.fields.timezone, remote.timezone.saved),
        },
    };
}

function fieldCurrent<Value>(field: SettingsFieldState<Value>, local: Value, remote: Value): Value {
    return field.save.type === "clean" ? remote : local;
}

function fieldRemote<Value>(
    field: SettingsFieldState<Value>,
    saved: Value,
): SettingsFieldState<Value> {
    return field.save.type === "clean" ? { saved, save: { type: "clean" } } : { ...field, saved };
}

function fieldsCreate(
    profile: ClientUser,
    notifications: NotificationPreferences,
    presence: PresenceSettingsSummary = {
        userId: profile.id,
        availability: "automatic",
        updatedAt: "",
    },
): SettingsFieldStates {
    const clean = <Value>(saved: Value): SettingsFieldState<Value> => ({
        saved,
        save: { type: "clean" },
    });
    return {
        displayName: clean({ firstName: profile.firstName, lastName: profile.lastName }),
        username: clean(profile.username),
        email: clean(profile.email),
        phone: clean(profile.phone),
        availability: clean(presence.availability),
        statusText: clean(presence.customStatusText),
        statusEmoji: clean(presence.customStatusEmoji),
        statusExpiry: clean(presence.statusExpiresAt),
        dndUntil: clean(presence.dndUntil),
        directMessages: clean(notifications.directMessages),
        mentions: clean(notifications.mentions),
        reactions: clean(notifications.reactions),
        calls: clean(notifications.calls),
        emailNotifications: clean(notifications.emailNotifications),
        desktopNotifications: clean(notifications.desktopNotifications),
        dndSchedule: clean({
            startMinutes: notifications.dndStartMinutes,
            endMinutes: notifications.dndEndMinutes,
        }),
        timezone: clean(notifications.timezone),
    };
}

function fieldChanged<Value>(
    field: SettingsFieldState<Value>,
    value: Value,
    equal: (left: Value, right: Value) => boolean = Object.is,
): SettingsFieldState<Value> {
    const type = equal(value, field.saved) ? "clean" : "dirty";
    return field.save.type === type ? field : { ...field, save: { type } };
}

function fieldSaving<Value>(field: SettingsFieldState<Value>): SettingsFieldState<Value> {
    return field.save.type === "dirty" ? { ...field, save: { type: "saving" } } : field;
}

function fieldFailed<Value>(
    field: SettingsFieldState<Value>,
    error: UserError,
): SettingsFieldState<Value> {
    return field.save.type === "saving" ? { ...field, save: { type: "error", error } } : field;
}

function fieldSaved<Value>(
    field: SettingsFieldState<Value>,
    unchangedSinceSubmission: boolean,
    saved: Value,
): SettingsFieldState<Value> {
    return unchangedSinceSubmission
        ? { saved, save: { type: "clean" } }
        : { saved, save: { type: "dirty" } };
}

function notificationFieldsMap(
    fields: SettingsFieldStates,
    map: <Value>(field: SettingsFieldState<Value>) => SettingsFieldState<Value>,
): SettingsFieldStates {
    return {
        ...fields,
        directMessages: map(fields.directMessages),
        mentions: map(fields.mentions),
        reactions: map(fields.reactions),
        calls: map(fields.calls),
        emailNotifications: map(fields.emailNotifications),
        desktopNotifications: map(fields.desktopNotifications),
        dndSchedule: map(fields.dndSchedule),
        timezone: map(fields.timezone),
    };
}

function profileSaved(
    snapshot: SettingsSnapshot,
    saved: ClientUser,
    submitted: ClientUser,
): SettingsSnapshot {
    const displayNameUnchanged = sameDisplayName(snapshot.profile, submitted);
    const usernameUnchanged = snapshot.profile.username === submitted.username;
    const emailUnchanged = snapshot.profile.email === submitted.email;
    const phoneUnchanged = snapshot.profile.phone === submitted.phone;
    const allUnchanged =
        displayNameUnchanged && usernameUnchanged && emailUnchanged && phoneUnchanged;
    return {
        ...snapshot,
        profile: {
            ...saved,
            firstName: displayNameUnchanged ? saved.firstName : snapshot.profile.firstName,
            lastName: displayNameUnchanged ? saved.lastName : snapshot.profile.lastName,
            username: usernameUnchanged ? saved.username : snapshot.profile.username,
            email: emailUnchanged ? saved.email : snapshot.profile.email,
            phone: phoneUnchanged ? saved.phone : snapshot.profile.phone,
            photoFileId: snapshot.profile.photoFileId,
        },
        profileSave: allUnchanged ? { type: "clean" } : { type: "dirty" },
        fields: {
            ...snapshot.fields,
            displayName: fieldSaved(snapshot.fields.displayName, displayNameUnchanged, {
                firstName: saved.firstName,
                lastName: saved.lastName,
            }),
            username: fieldSaved(snapshot.fields.username, usernameUnchanged, saved.username),
            email: fieldSaved(snapshot.fields.email, emailUnchanged, saved.email),
            phone: fieldSaved(snapshot.fields.phone, phoneUnchanged, saved.phone),
        },
    };
}

function presenceSaved(
    snapshot: SettingsSnapshot,
    saved: PresenceSettingsSummary,
    submitted: PresenceSettingsSummary,
): SettingsSnapshot {
    const availabilityUnchanged = snapshot.presence.availability === submitted.availability;
    const statusTextUnchanged = snapshot.presence.customStatusText === submitted.customStatusText;
    const statusEmojiUnchanged =
        snapshot.presence.customStatusEmoji === submitted.customStatusEmoji;
    const statusExpiryUnchanged = snapshot.presence.statusExpiresAt === submitted.statusExpiresAt;
    const dndUntilUnchanged = snapshot.presence.dndUntil === submitted.dndUntil;
    const allUnchanged =
        availabilityUnchanged &&
        statusTextUnchanged &&
        statusEmojiUnchanged &&
        statusExpiryUnchanged &&
        dndUntilUnchanged;
    return {
        ...snapshot,
        presence: {
            ...saved,
            availability: availabilityUnchanged
                ? saved.availability
                : snapshot.presence.availability,
            customStatusText: statusTextUnchanged
                ? saved.customStatusText
                : snapshot.presence.customStatusText,
            customStatusEmoji: statusEmojiUnchanged
                ? saved.customStatusEmoji
                : snapshot.presence.customStatusEmoji,
            statusExpiresAt: statusExpiryUnchanged
                ? saved.statusExpiresAt
                : snapshot.presence.statusExpiresAt,
            dndUntil: dndUntilUnchanged ? saved.dndUntil : snapshot.presence.dndUntil,
        },
        presenceSave: allUnchanged ? { type: "clean" } : { type: "dirty" },
        fields: {
            ...snapshot.fields,
            availability: fieldSaved(
                snapshot.fields.availability,
                availabilityUnchanged,
                saved.availability,
            ),
            statusText: fieldSaved(
                snapshot.fields.statusText,
                statusTextUnchanged,
                saved.customStatusText,
            ),
            statusEmoji: fieldSaved(
                snapshot.fields.statusEmoji,
                statusEmojiUnchanged,
                saved.customStatusEmoji,
            ),
            statusExpiry: fieldSaved(
                snapshot.fields.statusExpiry,
                statusExpiryUnchanged,
                saved.statusExpiresAt,
            ),
            dndUntil: fieldSaved(snapshot.fields.dndUntil, dndUntilUnchanged, saved.dndUntil),
        },
    };
}

function notificationsSaved(
    snapshot: SettingsSnapshot,
    saved: NotificationPreferences,
    submitted: NotificationPreferences,
): SettingsSnapshot {
    const directMessagesUnchanged =
        snapshot.notifications.directMessages === submitted.directMessages;
    const mentionsUnchanged = snapshot.notifications.mentions === submitted.mentions;
    const reactionsUnchanged = snapshot.notifications.reactions === submitted.reactions;
    const callsUnchanged = snapshot.notifications.calls === submitted.calls;
    const emailNotificationsUnchanged =
        snapshot.notifications.emailNotifications === submitted.emailNotifications;
    const desktopNotificationsUnchanged =
        snapshot.notifications.desktopNotifications === submitted.desktopNotifications;
    const dndScheduleUnchanged =
        snapshot.notifications.dndStartMinutes === submitted.dndStartMinutes &&
        snapshot.notifications.dndEndMinutes === submitted.dndEndMinutes;
    const timezoneUnchanged = snapshot.notifications.timezone === submitted.timezone;
    const allUnchanged =
        directMessagesUnchanged &&
        mentionsUnchanged &&
        reactionsUnchanged &&
        callsUnchanged &&
        emailNotificationsUnchanged &&
        desktopNotificationsUnchanged &&
        dndScheduleUnchanged &&
        timezoneUnchanged;
    return {
        ...snapshot,
        notifications: {
            directMessages: directMessagesUnchanged
                ? saved.directMessages
                : snapshot.notifications.directMessages,
            mentions: mentionsUnchanged ? saved.mentions : snapshot.notifications.mentions,
            reactions: reactionsUnchanged ? saved.reactions : snapshot.notifications.reactions,
            calls: callsUnchanged ? saved.calls : snapshot.notifications.calls,
            emailNotifications: emailNotificationsUnchanged
                ? saved.emailNotifications
                : snapshot.notifications.emailNotifications,
            desktopNotifications: desktopNotificationsUnchanged
                ? saved.desktopNotifications
                : snapshot.notifications.desktopNotifications,
            dndStartMinutes: dndScheduleUnchanged
                ? saved.dndStartMinutes
                : snapshot.notifications.dndStartMinutes,
            dndEndMinutes: dndScheduleUnchanged
                ? saved.dndEndMinutes
                : snapshot.notifications.dndEndMinutes,
            timezone: timezoneUnchanged ? saved.timezone : snapshot.notifications.timezone,
        },
        notificationsSave: allUnchanged ? { type: "clean" } : { type: "dirty" },
        fields: {
            ...snapshot.fields,
            directMessages: fieldSaved(
                snapshot.fields.directMessages,
                directMessagesUnchanged,
                saved.directMessages,
            ),
            mentions: fieldSaved(snapshot.fields.mentions, mentionsUnchanged, saved.mentions),
            reactions: fieldSaved(snapshot.fields.reactions, reactionsUnchanged, saved.reactions),
            calls: fieldSaved(snapshot.fields.calls, callsUnchanged, saved.calls),
            emailNotifications: fieldSaved(
                snapshot.fields.emailNotifications,
                emailNotificationsUnchanged,
                saved.emailNotifications,
            ),
            desktopNotifications: fieldSaved(
                snapshot.fields.desktopNotifications,
                desktopNotificationsUnchanged,
                saved.desktopNotifications,
            ),
            dndSchedule: fieldSaved(snapshot.fields.dndSchedule, dndScheduleUnchanged, {
                startMinutes: saved.dndStartMinutes,
                endMinutes: saved.dndEndMinutes,
            }),
            timezone: fieldSaved(snapshot.fields.timezone, timezoneUnchanged, saved.timezone),
        },
    };
}

function sameDisplayName(left: ClientUser, right: ClientUser): boolean {
    return left.firstName === right.firstName && left.lastName === right.lastName;
}

export type SettingsSaveState =
    | { readonly type: "clean" }
    | { readonly type: "dirty" }
    | { readonly type: "saving" }
    | { readonly type: "error"; readonly error: UserError };

export interface SettingsFieldStates {
    readonly displayName: {
        readonly saved: { readonly firstName: string; readonly lastName?: string };
        readonly save: SettingsSaveState;
    };
    readonly username: { readonly saved: string; readonly save: SettingsSaveState };
    readonly email: { readonly saved: string | undefined; readonly save: SettingsSaveState };
    readonly phone: { readonly saved: string | undefined; readonly save: SettingsSaveState };
    readonly availability: {
        readonly saved: PresenceSettingsSummary["availability"];
        readonly save: SettingsSaveState;
    };
    readonly statusText: { readonly saved: string | undefined; readonly save: SettingsSaveState };
    readonly statusEmoji: { readonly saved: string | undefined; readonly save: SettingsSaveState };
    readonly statusExpiry: {
        readonly saved: string | undefined;
        readonly save: SettingsSaveState;
    };
    readonly dndUntil: { readonly saved: string | undefined; readonly save: SettingsSaveState };
    readonly directMessages: {
        readonly saved: NotificationPreferences["directMessages"];
        readonly save: SettingsSaveState;
    };
    readonly mentions: {
        readonly saved: NotificationPreferences["mentions"];
        readonly save: SettingsSaveState;
    };
    readonly reactions: {
        readonly saved: NotificationPreferences["reactions"];
        readonly save: SettingsSaveState;
    };
    readonly calls: {
        readonly saved: NotificationPreferences["calls"];
        readonly save: SettingsSaveState;
    };
    readonly emailNotifications: { readonly saved: boolean; readonly save: SettingsSaveState };
    readonly desktopNotifications: { readonly saved: boolean; readonly save: SettingsSaveState };
    readonly dndSchedule: {
        readonly saved: { readonly startMinutes?: number; readonly endMinutes?: number };
        readonly save: SettingsSaveState;
    };
    readonly timezone: { readonly saved: string | undefined; readonly save: SettingsSaveState };
}

export interface SettingsSnapshot {
    readonly status: Loadable<true>;
    readonly profile: ClientUser;
    readonly title?: string;
    readonly presence: PresenceSettingsSummary;
    readonly notifications: NotificationPreferences;
    readonly fields: SettingsFieldStates;
    readonly profileSave: SettingsSaveState;
    readonly presenceSave: SettingsSaveState;
    readonly notificationsSave: SettingsSaveState;
}

export type SettingsOutput =
    | { readonly type: "displayNameUpdated" }
    | { readonly type: "usernameUpdated" }
    | { readonly type: "emailUpdated" }
    | { readonly type: "phoneUpdated" }
    | { readonly type: "availabilityUpdated" }
    | { readonly type: "statusTextUpdated" }
    | { readonly type: "statusEmojiUpdated" }
    | { readonly type: "statusExpiryUpdated" }
    | { readonly type: "dndUntilUpdated" }
    | { readonly type: "directMessagesUpdated" }
    | { readonly type: "mentionsUpdated" }
    | { readonly type: "reactionsUpdated" }
    | { readonly type: "callsUpdated" }
    | { readonly type: "emailNotificationsUpdated" }
    | { readonly type: "desktopNotificationsUpdated" }
    | { readonly type: "dndScheduleUpdated" }
    | { readonly type: "timezoneUpdated" };

export type SettingsInput =
    | {
          readonly type: "settingsLoaded";
          readonly profile: ClientUser;
          readonly title?: string;
          readonly presence: PresenceSettingsSummary;
          readonly notifications: NotificationPreferences;
          readonly avatarRevision: number;
      }
    | { readonly type: "settingsLoadFailed"; readonly error: UserError }
    | { readonly type: "profileSaving" }
    | {
          readonly type: "profileSaved";
          readonly profile: ClientUser;
          readonly submitted: ClientUser;
      }
    | { readonly type: "profileSaveFailed"; readonly error: UserError }
    | { readonly type: "avatarSaved"; readonly fileId: string }
    | { readonly type: "presenceSaving" }
    | {
          readonly type: "presenceSaved";
          readonly presence: PresenceSettingsSummary;
          readonly submitted: PresenceSettingsSummary;
      }
    | { readonly type: "presenceSaveFailed"; readonly error: UserError }
    | { readonly type: "notificationsSaving" }
    | {
          readonly type: "notificationsSaved";
          readonly notifications: NotificationPreferences;
          readonly submitted: NotificationPreferences;
      }
    | { readonly type: "notificationsSaveFailed"; readonly error: UserError };

export interface SettingsState extends SettingsSnapshot {
    displayNameUpdate(firstName: string, lastName?: string): void;
    usernameUpdate(username: string): void;
    emailUpdate(email?: string): void;
    phoneUpdate(phone?: string): void;
    availabilityUpdate(availability: PresenceSettingsSummary["availability"]): void;
    statusTextUpdate(text?: string): void;
    statusEmojiUpdate(emoji?: string): void;
    statusExpiryUpdate(expiresAt?: string): void;
    dndUntilUpdate(until?: string): void;
    directMessagesUpdate(value: NotificationPreferences["directMessages"]): void;
    mentionsUpdate(value: NotificationPreferences["mentions"]): void;
    reactionsUpdate(value: NotificationPreferences["reactions"]): void;
    callsUpdate(value: NotificationPreferences["calls"]): void;
    emailNotificationsUpdate(value: boolean): void;
    desktopNotificationsUpdate(value: boolean): void;
    dndScheduleUpdate(startMinutes?: number, endMinutes?: number): void;
    timezoneUpdate(timezone?: string): void;
    settingsInput(event: SettingsInput): void;
}

export type SettingsStore = StoreApi<SettingsState>;

export interface SettingsStoreOptions {
    readonly profile?: {
        readonly id: string;
        readonly firstName: string;
        readonly username: string;
        readonly lastName?: string;
        readonly email?: string;
        readonly phone?: string;
        readonly photoFileId?: string;
    };
}
