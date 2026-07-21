import { portShares } from "../../schema.js";

export const portShareSelection = {
    id: portShares.id,
    chatId: portShares.chatId,
    agentUserId: portShares.agentUserId,
    containerName: portShares.containerName,
    containerPort: portShares.containerPort,
    name: portShares.name,
    subdomain: portShares.subdomain,
    audience: portShares.audience,
    createdByUserId: portShares.createdByUserId,
    createdAt: portShares.createdAt,
    disabledAt: portShares.disabledAt,
    disabledByUserId: portShares.disabledByUserId,
};

export interface PortShareRow {
    id: string;
    chatId: string;
    agentUserId: string;
    containerName: string;
    containerPort: number;
    name: string;
    subdomain: string;
    audience: string;
    createdByUserId: string;
    createdAt: string;
    disabledAt: string | null;
    disabledByUserId: string | null;
}
