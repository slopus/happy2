import type { ChatStoreBinding } from "../chat/chatStore.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import type { IdentityCatalog } from "./identityCatalog.js";
import type { IdentityProjection } from "./identityTypes.js";

export interface IdentitiesReconcileContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    chatsGet(): Iterable<readonly [string, ChatStoreBinding]>;
    directoryReconcile(): void;
    agentSecretsReconcile(): void;
    sidebarIdentityReconcile(identity: IdentityProjection): void;
}

/** Fetches authoritative user presentations after a users hint and replaces affected retained rows only. */
export async function identitiesReconcile(context: IdentitiesReconcileContext): Promise<void> {
    const contacts = await context.runtime.operation("getContacts");
    for (const user of contacts.users) {
        const identity = context.identities.project(user);
        for (const [, binding] of context.chatsGet())
            binding.chatInput({ type: "identityReconciled", identity });
        context.sidebarIdentityReconcile(identity);
    }
    context.directoryReconcile();
    context.agentSecretsReconcile();
}
