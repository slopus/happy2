import { threadsLoad, type ThreadsActionContext } from "./threadsLoad.js";
import type { ThreadsOutput } from "./threadsTypes.js";
import { userError } from "../runtime/stateRuntime.js";

/** Persists one thread-list intent and reconciles the retained list from durable state. */
export async function threadsOutputRoute(
    context: ThreadsActionContext,
    event: ThreadsOutput,
): Promise<void> {
    if (event.type === "threadsMoreRequested") {
        await threadsLoad(context, true);
        return;
    }
    try {
        if (event.type === "threadReadSubmitted")
            await context.runtime.operation("markThreadRead", {
                messageId: event.rootMessageId,
                throughMessageId: event.throughMessageId,
            });
        else
            await context.runtime.operation("updateThreadSubscription", {
                messageId: event.rootMessageId,
                subscribed: event.subscribed,
                notificationLevel: event.notificationLevel,
            });
        await threadsLoad(context);
    } catch (error) {
        context.threads.threadsInput({ type: "threadActionFailed", error: userError(error) });
    }
}
