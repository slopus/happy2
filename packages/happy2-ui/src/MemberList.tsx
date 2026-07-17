import { createMemo, For, Show, splitProps, type JSX } from "solid-js";
import { Avatar, type ToneName } from "./Avatar";
import { Badge, type BadgeVariant } from "./Badge";
import { Button } from "./Button";

export type MemberPresence = "online" | "offline";
export type MemberRole = "owner" | "admin" | "member";
export type MemberItem = {
    id: string;
    name: string;
    username?: string;
    title?: string;
    initials: string;
    tone?: ToneName;
    imageUrl?: string;
    presence?: MemberPresence;
    role: MemberRole;
    /** Renders the agent avatar treatment instead of the human one. */
    agent?: boolean;
    /** A built-in service account (e.g. the @happy service agent): shows a
     *  "Service" status pill instead of the org role and carries no presence. */
    systemRole?: "service";
};

export type MemberListProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    members: MemberItem[];
    onAction?: (id: string) => void;
    actionLabel?: string;
    rowMenu?: (member: MemberItem) => JSX.Element;
};

/* Role → status pill. Each role maps to a distinct, already-tuned Badge
 * variant so the roster reads owner / admin / member at a glance. */
const roleBadges: Record<MemberRole, { label: string; variant: BadgeVariant }> = {
    owner: { label: "Owner", variant: "accent" },
    admin: { label: "Admin", variant: "info" },
    member: { label: "Member", variant: "neutral" },
};

/* A built-in service account outranks its org role in the roster: it always
 * reads "Service" regardless of the plain member/admin role it carries. */
const serviceBadge = { label: "Service", variant: "accent" as BadgeVariant };

/* Secondary line: the title takes priority (it is the descriptive roster
 * label); a bare @handle stands in when there is no title. */
function subtitleOf(member: MemberItem): string | undefined {
    if (member.title) return member.title;
    if (member.username) return `@${member.username}`;
    return undefined;
}

function MemberRow(props: {
    actionLabel?: string;
    member: MemberItem;
    onAction?: (id: string) => void;
    rowMenu?: (member: MemberItem) => JSX.Element;
}) {
    const member = () => props.member;
    const service = () => member().systemRole === "service";
    const badge = () => (service() ? serviceBadge : roleBadges[member().role]);
    const subtitle = () => subtitleOf(member());
    /* One trailing control per row: a caller-supplied menu wins; otherwise an
     * action button appears whenever an action handler or label is declared. */
    const trailing = createMemo(() => {
        if (props.rowMenu) return props.rowMenu(member());
        if (props.onAction || props.actionLabel) {
            return (
                <Button
                    onClick={() => props.onAction?.(member().id)}
                    size="small"
                    variant="secondary"
                >
                    {props.actionLabel ?? "Message"}
                </Button>
            );
        }
        return null;
    });

    return (
        <li
            class="happy2-member-list__row"
            data-member-id={member().id}
            data-presence={service() ? undefined : (member().presence ?? "offline")}
            data-happy2-ui="member-row"
            data-role={service() ? "service" : member().role}
        >
            <Avatar
                class="happy2-member-list__avatar"
                imageUrl={member().imageUrl}
                initials={member().initials}
                online={!service() && member().presence === "online"}
                size="md"
                tone={member().tone}
                type={member().agent ? "agent" : "human"}
            />
            <span class="happy2-member-list__identity" data-happy2-ui="member-identity">
                <span class="happy2-member-list__name" data-happy2-ui="member-name">
                    {member().name}
                </span>
                <Show when={subtitle()}>
                    <span class="happy2-member-list__subtitle" data-happy2-ui="member-subtitle">
                        {subtitle()}
                    </span>
                </Show>
            </span>
            <Badge class="happy2-member-list__role" label={badge().label} variant={badge().variant} />
            <Show when={trailing()}>
                <span class="happy2-member-list__trailing" data-happy2-ui="member-trailing">
                    {trailing()}
                </span>
            </Show>
        </li>
    );
}

/**
 * C-039 MemberList — chat roster on a 56px row grid. Each row pairs a 36px
 * presence-aware Avatar with a name/title identity block, a role status Badge,
 * and an optional trailing action button or caller-supplied menu. Rows are
 * separated by a hairline and the component itself carries no card chrome, so
 * it drops straight into a channel-members panel.
 */
export function MemberList(props: MemberListProps) {
    const [local, rest] = splitProps(props, [
        "actionLabel",
        "class",
        "members",
        "onAction",
        "rowMenu",
        "style",
    ]);

    return (
        <ul
            {...rest}
            class={["happy2-member-list", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="member-list"
            style={local.style}
        >
            <For each={local.members}>
                {(member) => (
                    <MemberRow
                        actionLabel={local.actionLabel}
                        member={member}
                        onAction={local.onAction}
                        rowMenu={local.rowMenu}
                    />
                )}
            </For>
        </ul>
    );
}
