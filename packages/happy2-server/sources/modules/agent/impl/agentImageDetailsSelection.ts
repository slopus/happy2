import { agentImages } from "../../schema.js";
import { agentImageSelection } from "./agentImageSelection.js";
export const agentImageDetailsSelection = {
    ...agentImageSelection,
    dockerfile: agentImages.dockerfile,
    build_log: agentImages.buildLog,
    build_log_truncated: agentImages.buildLogTruncated,
};
