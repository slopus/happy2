import { type ChatSummary, type MessageSummary, type UserSummary } from "../../chat/types.js";

export function resultId(
    result:
        | {
              type: "message";
              message: MessageSummary;
          }
        | {
              type: "channel";
              channel: ChatSummary;
          }
        | {
              type: "user";
              user: UserSummary;
          },
): string {
    if (result.type === "message") return result.message.id;
    if (result.type === "channel") return result.channel.id;
    return result.user.id;
}
