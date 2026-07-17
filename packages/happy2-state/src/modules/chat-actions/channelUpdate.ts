import type { ChatActionContext } from "./chatActionContext.js";
import { chatResultApply } from "./chatActionContext.js";

export interface ChannelUpdateInput {
    readonly name?: string;
    readonly slug?: string;
    readonly topic?: string | null;
    readonly kind?: "public_channel" | "private_channel";
    readonly photoFileId?: string | null;
    readonly isListed?: boolean;
    readonly autoJoin?: boolean;
}
/** Updates explicit channel fields and reconciles the same authoritative summary across retained surfaces. */
export async function channelUpdate(
    context: ChatActionContext,
    chatId: string,
    input: ChannelUpdateInput,
): Promise<void> {
    const result = await context.runtime.operation("updateChannel", { chatId, ...input });
    await chatResultApply(context, result.chat);
}
