import { createStore, type StoreApi } from "zustand/vanilla";
import {
    type ChatSummary,
    type PresenceSettingsSummary,
    type PresenceSnapshot,
} from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type IdentityCatalog } from "../identity/identityState.js";
import { type IdentityProjection } from "../identity/identityState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface DirectoryActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly directory: DirectoryStore;
}

/** Loads the complete directory projection with canonical identities and surface-owned presence. */
export async function directoryLoad(context: DirectoryActionContext): Promise<void> {
    context.directory.getState().directoryInput({ type: "directoryLoading" });
    try {
        const [people, live, channels] = await Promise.all([
            context.runtime.operation("getContacts"),
            context.runtime.operation("getPresence"),
            context.runtime.operation("getDirectoryChannels"),
        ]);
        const presence = new Map(live.presence.map((item) => [item.userId, item.status]));
        const statuses = new Map(live.statuses.map((item) => [item.userId, item]));
        context.directory.getState().directoryInput({
            type: "directoryLoaded",
            users: people.users.map((user) => {
                const identity = context.identities.project(user);
                const status = statuses.get(user.id);
                return {
                    ...identity,
                    ...(user.title ? { title: user.title } : {}),
                    role: user.role,
                    presence: presence.get(user.id) ?? "offline",
                    ...(status
                        ? {
                              availability: status.availability,
                              customStatusText: status.customStatusText,
                              customStatusEmoji: status.customStatusEmoji,
                          }
                        : {}),
                };
            }),
            channels: channels.channels,
        });
    } catch (error) {
        context.directory
            .getState()
            .directoryInput({ type: "directoryFailed", error: userError(error) });
    }
}

/** Creates one people/channel-directory surface with presence only where the surface renders it. */
export function directoryStoreCreate(): DirectoryStore {
    return createStore<DirectoryState>()((set) => ({
        status: { type: "unloaded" },
        users: [],
        channels: [],
        directoryInput(event): void {
            set((snapshot) => {
                if (event.type === "directoryLoading")
                    return { ...snapshot, status: { type: "loading" } };
                if (event.type === "directoryFailed")
                    return { ...snapshot, status: { type: "error", error: event.error } };
                if (event.type === "directoryLoaded")
                    return {
                        status: { type: "ready", value: true },
                        users: event.users,
                        channels: event.channels,
                    };
                const index = snapshot.users.findIndex((user) => user.id === event.userId);
                if (index < 0 || snapshot.users[index]?.presence === event.presence)
                    return snapshot;
                const users = [...snapshot.users];
                users[index] = { ...users[index]!, presence: event.presence };
                return { ...snapshot, users };
            });
        },
    }));
}

export interface DirectoryUserProjection extends IdentityProjection {
    readonly title?: string;
    readonly role: "member" | "admin";
    readonly presence: PresenceSnapshot["status"];
    readonly availability?: PresenceSettingsSummary["availability"];
    readonly customStatusText?: string;
    readonly customStatusEmoji?: string;
}

export interface DirectorySnapshot {
    readonly status: Loadable<true>;
    readonly users: readonly DirectoryUserProjection[];
    readonly channels: readonly ChatSummary[];
}

export type DirectoryInput =
    | { readonly type: "directoryLoading" }
    | {
          readonly type: "directoryLoaded";
          readonly users: readonly DirectoryUserProjection[];
          readonly channels: readonly ChatSummary[];
      }
    | { readonly type: "directoryFailed"; readonly error: import("../../types.js").UserError }
    | {
          readonly type: "presenceReconciled";
          readonly userId: string;
          readonly presence: PresenceSnapshot["status"];
      };

export interface DirectoryState extends DirectorySnapshot {
    directoryInput(event: DirectoryInput): void;
}

export type DirectoryStore = StoreApi<DirectoryState>;
