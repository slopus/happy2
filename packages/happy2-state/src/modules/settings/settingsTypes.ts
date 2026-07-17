import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type { ClientUser, NotificationPreferences } from "../../resources.js";
import type { PresenceSettingsSummary, UserError } from "../../types.js";
import type { Loadable } from "../chat/chatTypes.js";

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
    readonly threadReplies: {
        readonly saved: NotificationPreferences["threadReplies"];
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
    | { readonly type: "threadRepliesUpdated" }
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

export interface SettingsStore extends ReadonlyStore<SettingsSnapshot> {
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
    threadRepliesUpdate(value: NotificationPreferences["threadReplies"]): void;
    reactionsUpdate(value: NotificationPreferences["reactions"]): void;
    callsUpdate(value: NotificationPreferences["calls"]): void;
    emailNotificationsUpdate(value: boolean): void;
    desktopNotificationsUpdate(value: boolean): void;
    dndScheduleUpdate(startMinutes?: number, endMinutes?: number): void;
    timezoneUpdate(timezone?: string): void;
}

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
