import { type ChatKind, type ChatRole, type ChatSummary } from "../types.js";

import { number } from "../number.js";
import { optionalText } from "../optionalText.js";
import { text } from "../text.js";
export function asChat(row: Record<string, unknown>): ChatSummary {
    const kind = text(row.kind) as ChatKind;
    const starred = number(row.starred, 0) === 1;
    return {
        id: text(row.id),
        kind,
        parentMessageId: optionalText(row.parent_message_id),
        name: optionalText(row.name),
        slug: optionalText(row.slug),
        topic: optionalText(row.topic),
        dmType: optionalText(row.dm_type) as ChatSummary["dmType"],
        ownerUserId: optionalText(row.owner_user_id),
        photoFileId: optionalText(row.photo_file_id),
        isListed: number(row.is_listed, 1) === 1,
        isMain: number(row.is_main, 0) === 1,
        autoJoin: number(row.auto_join, 0) === 1,
        defaultAgentUserId: optionalText(row.default_agent_user_id),
        isDefaultAgentConversation: number(row.is_default_agent_conversation, 0) === 1,
        archivedAt: optionalText(row.archived_at),
        retentionMode: text(row.retention_mode, "forever") as ChatSummary["retentionMode"],
        retentionSeconds: number(row.retention_seconds, 0) || undefined,
        defaultExpiryMode: text(
            row.default_expiry_mode,
            "none",
        ) as ChatSummary["defaultExpiryMode"],
        defaultSelfDestructSeconds: number(row.default_self_destruct_seconds, 0) || undefined,
        defaultAfterReadScope: text(
            row.default_after_read_scope,
            "any_reader",
        ) as ChatSummary["defaultAfterReadScope"],
        lifecycleVersion: text(row.lifecycle_version, "1"),
        createdByUserId: text(row.created_by_user_id),
        pts: text(row.pts),
        lastMessageSequence: text(row.last_message_sequence),
        membershipEpoch:
            optionalText(row.membership_epoch) ?? (kind === "public_channel" ? "public" : ""),
        membershipRole: optionalText(row.membership_role) as ChatRole | undefined,
        starred,
        followed: number(row.followed, 0) === 1,
        starOrder:
            !starred || row.sort_order === null || row.sort_order === undefined
                ? undefined
                : number(row.sort_order),
        lastReadSequence: text(row.last_read_sequence, "0"),
        unreadCount: number(row.unread_count, 0),
        mentionCount: number(row.mention_count, 0),
        notificationLevel: text(row.notification_level, "all") as ChatSummary["notificationLevel"],
        mutedUntil: optionalText(row.muted_until),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}
