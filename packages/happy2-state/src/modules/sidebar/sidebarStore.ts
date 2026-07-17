import { storeCreate } from "../../kernel/store.js";
import { sidebarInputApply } from "./sidebarInputApply.js";
import type { SidebarInput, SidebarSnapshot, SidebarStore } from "./sidebarTypes.js";

export interface SidebarStoreBinding {
    readonly store: SidebarStore;
    sidebarInput(event: SidebarInput): void;
    dispose(): void;
}

/** Creates the one coarse chat-directory render store and its owner-only input capability. */
export function sidebarStoreCreateBinding(): SidebarStoreBinding {
    const { store, writer } = storeCreate<SidebarSnapshot>({
        status: { type: "unloaded" },
        chats: [],
    });
    return {
        store,
        sidebarInput: (event) => sidebarInputApply(writer, event),
        dispose: writer.dispose,
    };
}
