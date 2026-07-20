import type { HappyCallContext } from "../types.js";

const VIEWER_META_KEY = "happy2/viewer";
const CHAT_META_KEY = "happy2/chat";
const MESSAGE_META_KEY = "happy2/message";
const INSTANCE_META_KEY = "happy2/instance";
const CONTRIBUTION_META_KEY = "happy2/contribution";

interface McpRequestExtra {
    readonly _meta?: Readonly<Record<string, unknown>>;
}

/** Reads Happy's protected current-call capabilities without accepting plugin arguments as authority. */
export function happyCallContext(extra: McpRequestExtra): HappyCallContext {
    const meta = extra._meta;
    if (!meta) return {};
    return {
        ...(meta[VIEWER_META_KEY]
            ? { viewer: capability(meta[VIEWER_META_KEY], VIEWER_META_KEY) }
            : {}),
        ...(meta[CHAT_META_KEY] ? { chat: capability(meta[CHAT_META_KEY], CHAT_META_KEY) } : {}),
        ...(meta[MESSAGE_META_KEY]
            ? { message: capability(meta[MESSAGE_META_KEY], MESSAGE_META_KEY) }
            : {}),
        ...(meta[INSTANCE_META_KEY]
            ? { instance: instanceCapability(meta[INSTANCE_META_KEY]) }
            : {}),
        ...(meta[CONTRIBUTION_META_KEY]
            ? { contribution: contributionCapability(meta[CONTRIBUTION_META_KEY]) }
            : {}),
    };
}

function capability(value: unknown, label: string): { id: string; token: string } {
    const record = object(value, label);
    return { id: string(record.id, `${label}.id`), token: string(record.token, `${label}.token`) };
}

function instanceCapability(value: unknown): { id: string; key: string } {
    const record = object(value, INSTANCE_META_KEY);
    return {
        id: string(record.id, `${INSTANCE_META_KEY}.id`),
        key: string(record.key, `${INSTANCE_META_KEY}.key`),
    };
}

function contributionCapability(value: unknown) {
    const record = object(value, CONTRIBUTION_META_KEY);
    const placement = string(record.placement, `${CONTRIBUTION_META_KEY}.placement`);
    if (
        ![
            "sidebarMenu",
            "profileSection",
            "pluginSettings",
            "chatMenu",
            "composerIcon",
            "composerMenu",
            "messageMenu",
        ].includes(placement)
    )
        throw new TypeError(`${CONTRIBUTION_META_KEY}.placement is invalid`);
    const revision = record.revision;
    if (!Number.isSafeInteger(revision) || (revision as number) < 0)
        throw new TypeError(`${CONTRIBUTION_META_KEY}.revision must be a non-negative integer`);
    return {
        id: string(record.id, `${CONTRIBUTION_META_KEY}.id`),
        key: string(record.key, `${CONTRIBUTION_META_KEY}.key`),
        placement: placement as
            | "sidebarMenu"
            | "profileSection"
            | "pluginSettings"
            | "chatMenu"
            | "composerIcon"
            | "composerMenu"
            | "messageMenu",
        revision: revision as number,
        ...(record.chatId === undefined
            ? {}
            : { chatId: string(record.chatId, `${CONTRIBUTION_META_KEY}.chatId`) }),
        ...(record.messageId === undefined
            ? {}
            : { messageId: string(record.messageId, `${CONTRIBUTION_META_KEY}.messageId`) }),
    };
}

function object(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new TypeError(`${label} must be an object`);
    return value as Readonly<Record<string, unknown>>;
}

function string(value: unknown, label: string): string {
    if (typeof value !== "string" || !value) throw new TypeError(`${label} must be a string`);
    return value;
}
