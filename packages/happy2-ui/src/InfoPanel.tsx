import { Show, splitProps, type JSX } from "solid-js";
import { type ToneName } from "./Avatar";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { MemberList, type MemberItem } from "./MemberList";
import { ProfileCard, type ProfilePresence, type ProfileStatus } from "./ProfileCard";
import { Toolbar } from "./Toolbar";

/** Surface header row height shared with ChannelHeader and ThreadPanel. */
export const SURFACE_HEADER_HEIGHT = 52;

export type InfoPanelProfile = {
    /** Stable product identity used by hosts to deep-link this profile surface. */
    id?: string;
    name: string;
    username: string;
    title?: string;
    initials: string;
    tone?: ToneName;
    imageUrl?: string;
    presence?: ProfilePresence;
    status?: ProfileStatus;
};

export type InfoPanelProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    /** Header title — the channel name or the person's name. */
    title: string;
    subtitle?: string;
    /** Leading header glyph, e.g. `hash` for a channel. */
    leadingIcon?: IconName;
    onClose?: () => void;
    closeLabel?: string;
    /** Extra header controls placed before the close button. */
    actions?: JSX.Element;
    /** Person identity block (DMs / user info). */
    profile?: InfoPanelProfile;
    /** Read-only channel about/topic text. */
    about?: string;
    aboutLabel?: string;
    /** Extra body content (e.g. an editable details form) below identity. */
    children?: JSX.Element;
    members?: MemberItem[];
    membersLabel?: string;
    memberActionLabel?: string;
    onMemberAction?: (id: string) => void;
    memberRowMenu?: (member: MemberItem) => JSX.Element;
};

/**
 * C-047 InfoPanel — the channel/user detail side panel. A 52px surface header
 * (shared height with ChannelHeader and ThreadPanel), then a scrolling body:
 * an optional person ProfileCard or a read-only channel About block, a caller
 * body slot for editable details, and a labeled member roster. Props only — the
 * app supplies data and the member/close handlers.
 */
export function InfoPanel(props: InfoPanelProps) {
    const [local] = splitProps(props, [
        "class",
        "data-testid",
        "style",
        "title",
        "subtitle",
        "leadingIcon",
        "onClose",
        "closeLabel",
        "actions",
        "profile",
        "about",
        "aboutLabel",
        "children",
        "members",
        "membersLabel",
        "memberActionLabel",
        "onMemberAction",
        "memberRowMenu",
    ]);

    return (
        <section
            class={["happy2-info-panel", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="info-panel"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <Toolbar
                class="happy2-info-panel__header"
                height={SURFACE_HEADER_HEIGHT}
                leading={
                    local.leadingIcon ? <Icon name={local.leadingIcon} size={16} /> : undefined
                }
                subtitle={local.subtitle}
                title={local.title}
                trailing={
                    <>
                        {local.actions}
                        <Show when={local.onClose}>
                            <Button
                                aria-label={local.closeLabel ?? "Close details"}
                                icon="close"
                                iconOnly
                                onClick={() => local.onClose?.()}
                                size="small"
                                variant="ghost"
                            />
                        </Show>
                    </>
                }
            />
            <div class="happy2-info-panel__body" data-happy2-ui="info-panel-body">
                <Show when={local.profile}>
                    {(profile) => (
                        <ProfileCard
                            imageUrl={profile().imageUrl}
                            initials={profile().initials}
                            name={profile().name}
                            presence={profile().presence}
                            status={profile().status}
                            title={profile().title}
                            tone={profile().tone}
                            username={profile().username}
                        />
                    )}
                </Show>
                <Show when={local.about !== undefined}>
                    <div class="happy2-info-panel__about" data-happy2-ui="info-panel-about">
                        <span class="happy2-info-panel__about-label">
                            {local.aboutLabel ?? "About"}
                        </span>
                        <span class="happy2-info-panel__about-text">{local.about}</span>
                    </div>
                </Show>
                {local.children}
                <Show when={local.members && local.members.length > 0}>
                    {(_) => (
                        <div class="happy2-info-panel__members" data-happy2-ui="info-panel-members">
                            <span class="happy2-info-panel__section-label">
                                {local.membersLabel ?? "Members"} · {local.members!.length}
                            </span>
                            <MemberList
                                actionLabel={local.memberActionLabel}
                                members={local.members!}
                                onAction={local.onMemberAction}
                                rowMenu={local.memberRowMenu}
                            />
                        </div>
                    )}
                </Show>
            </div>
        </section>
    );
}
