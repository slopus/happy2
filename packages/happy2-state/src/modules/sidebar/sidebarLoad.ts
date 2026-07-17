import { Happy2Api } from "../../api.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import { userError } from "../runtime/stateRuntime.js";
import type { SidebarStoreBinding } from "./sidebarStore.js";
import type { SidebarChatsProjector } from "./sidebarChatsProject.js";

export interface SidebarLoadContext {
    readonly runtime: StateRuntime;
    readonly sidebar: SidebarStoreBinding;
    readonly sidebarChats: SidebarChatsProjector;
}

/** Loads the durable chat directory and global sync cursor into the sidebar surface. */
export async function sidebarLoad(context: SidebarLoadContext): Promise<void> {
    const { runtime, sidebar } = context;
    if (!runtime.connected) return;
    sidebar.sidebarInput({ type: "sidebarLoading" });
    try {
        const sync = await runtime.read((transport) => new Happy2Api(transport).state());
        const chats = await runtime.operation("getChats");
        if (!runtime.active) return;
        sidebar.sidebarInput({
            type: "sidebarLoaded",
            chats: await context.sidebarChats.project(chats.chats),
            sync: sync.state,
        });
    } catch (error) {
        const failure = userError(error);
        sidebar.sidebarInput({ type: "sidebarFailed", error: failure });
        throw failure;
    }
}
