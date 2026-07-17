import { storeCreate } from "../../kernel/store.js";
import type { DirectoryInput, DirectorySnapshot, DirectoryStore } from "./directoryTypes.js";

export interface DirectoryStoreBinding {
    readonly store: DirectoryStore;
    directoryInput(event: DirectoryInput): void;
    dispose(): void;
}

/** Creates one people/channel-directory surface with presence only where the surface renders it. */
export function directoryStoreCreateBinding(): DirectoryStoreBinding {
    const { store, writer } = storeCreate<DirectorySnapshot>({
        status: { type: "unloaded" },
        users: [],
        channels: [],
    });
    return {
        store,
        directoryInput(event): void {
            writer.update((snapshot) => {
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
        dispose: writer.dispose,
    };
}
