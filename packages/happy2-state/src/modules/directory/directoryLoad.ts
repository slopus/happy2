import type { IdentityCatalog } from "../identity/identityCatalog.js";
import { userError, type StateRuntime } from "../runtime/stateRuntime.js";
import type { DirectoryStoreBinding } from "./directoryStore.js";

export interface DirectoryActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly directory: DirectoryStoreBinding;
}

/** Loads the complete directory projection with canonical identities and surface-owned presence. */
export async function directoryLoad(context: DirectoryActionContext): Promise<void> {
    context.directory.directoryInput({ type: "directoryLoading" });
    try {
        const [people, live, channels] = await Promise.all([
            context.runtime.operation("getContacts"),
            context.runtime.operation("getPresence"),
            context.runtime.operation("getDirectoryChannels"),
        ]);
        const presence = new Map(live.presence.map((item) => [item.userId, item.status]));
        const statuses = new Map(live.statuses.map((item) => [item.userId, item]));
        context.directory.directoryInput({
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
        context.directory.directoryInput({ type: "directoryFailed", error: userError(error) });
    }
}
