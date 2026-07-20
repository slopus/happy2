import type { MutationHint } from "../chat/types.js";

export const portShareContainerPorts = [
    3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010,
] as const;

export type PortShareContainerPort = (typeof portShareContainerPorts)[number];

export interface PortShareSummary {
    id: string;
    chatId: string;
    agentUserId: string;
    containerName: string;
    containerPort: PortShareContainerPort;
    name: string;
    subdomain: string;
    createdByUserId: string;
    createdAt: string;
    disabledAt?: string;
    disabledByUserId?: string;
}

export interface PortShareMutation {
    portShare: PortShareSummary;
    hint: MutationHint;
}

export class PortShareError extends Error {
    constructor(
        readonly code: "not_found" | "forbidden" | "invalid" | "conflict" | "not_ready",
        message: string,
    ) {
        super(message);
    }
}
