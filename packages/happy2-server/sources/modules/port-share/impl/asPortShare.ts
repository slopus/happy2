import type { PortShareSummary } from "../types.js";
import { portShareAudiences, portShareContainerPorts } from "../types.js";
import type { PortShareRow } from "./portShareSelection.js";

export function asPortShare(row: PortShareRow): PortShareSummary {
    if (!portShareContainerPorts.includes(row.containerPort as never))
        throw new Error("Persisted port share uses an unsupported container port");
    if (!portShareAudiences.includes(row.audience as never))
        throw new Error("Persisted port share uses an unsupported audience");
    return {
        id: row.id,
        chatId: row.chatId,
        agentUserId: row.agentUserId,
        containerName: row.containerName,
        containerPort: row.containerPort as PortShareSummary["containerPort"],
        name: row.name,
        subdomain: row.subdomain,
        audience: row.audience as PortShareSummary["audience"],
        createdByUserId: row.createdByUserId,
        createdAt: sqliteTimestampAsIso(row.createdAt),
        ...(row.disabledAt ? { disabledAt: sqliteTimestampAsIso(row.disabledAt) } : {}),
        ...(row.disabledByUserId ? { disabledByUserId: row.disabledByUserId } : {}),
    };
}

function sqliteTimestampAsIso(value: string): string {
    return new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`).toISOString();
}
