import type { IdentityCatalog } from "../identity/identityCatalog.js";
import { messageItemProject, messageProject } from "../chat/messageProject.js";
import { userError, type StateRuntime } from "../runtime/stateRuntime.js";
import type { ThreadStoreBinding } from "./threadStore.js";

export interface ThreadActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    threadGet(rootMessageId: string): ThreadStoreBinding | undefined;
}

const generations = new WeakMap<ThreadStoreBinding, number>();

/** Loads a retained thread and discards late completion after its lease closes. */
export async function threadLoad(
    context: ThreadActionContext,
    rootMessageId: string,
): Promise<void> {
    const binding = context.threadGet(rootMessageId);
    if (!binding) return;
    const generation = (generations.get(binding) ?? 0) + 1;
    generations.set(binding, generation);
    binding.threadInput({ type: "threadLoading" });
    try {
        const result = await context.runtime.operation("getThread", {
            messageId: rootMessageId,
            limit: 100,
        });
        if (context.threadGet(rootMessageId) !== binding || generations.get(binding) !== generation)
            return;
        binding.threadInput({
            type: "threadLoaded",
            root: messageProject(context.identities, result.root),
            replies: result.messages.map((message) =>
                messageItemProject(context.identities, message),
            ),
            hasMore: result.hasMore,
        });
    } catch (error) {
        if (context.threadGet(rootMessageId) === binding && generations.get(binding) === generation)
            binding.threadInput({ type: "threadFailed", error: userError(error) });
    }
}
