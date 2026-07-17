import { type AgentImageDetails } from "../../chat/types.js";
import { asAgentImage } from "./asAgentImage.js";
import { number } from "../../chat/number.js";
import { text } from "../../chat/text.js";
export function asAgentImageDetails(row: Record<string, unknown>): AgentImageDetails {
    return {
        ...asAgentImage(row),
        dockerfile: text(row.dockerfile),
        buildLog: text(row.build_log, ""),
        buildLogTruncated: number(row.build_log_truncated) === 1,
    };
}
