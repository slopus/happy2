import { For, Show, type JSX } from "solid-js";
import { Avatar, type ToneName } from "./Avatar";
import { Badge, type BadgeVariant } from "./Badge";
import { Button } from "./Button";
import { Icon } from "./Icon";

export type CallStatus = "ringing" | "active" | "ended";
export type CallKind = "audio" | "video";
export type CallVariant = "panel" | "incoming";
export type CallParticipantState =
    | "invited"
    | "ringing"
    | "joined"
    | "declined"
    | "left"
    | "missed";
export type CallParticipant = {
    id: string;
    name: string;
    initials: string;
    tone?: ToneName;
    imageUrl?: string;
    state: CallParticipantState;
    muted?: boolean;
    speaking?: boolean;
};

export type CallPanelProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    status: CallStatus;
    kind: CallKind;
    participants: CallParticipant[];
    durationLabel?: string;
    onToggleMute?: () => void;
    muted?: boolean;
    videoOn?: boolean;
    onToggleVideo?: () => void;
    onLeave?: () => void;
    onJoin?: () => void;
    onDecline?: () => void;
    variant?: CallVariant;
};

/* Each call status wears a distinct, already-tuned Badge variant so the pill
 * reads the connection state at a glance. */
const statusMeta: Record<CallStatus, { label: string; variant: BadgeVariant }> = {
    ringing: { label: "Ringing", variant: "info" },
    active: { label: "In call", variant: "success" },
    ended: { label: "Ended", variant: "neutral" },
};

const participantStateLabel: Record<CallParticipantState, string> = {
    invited: "Invited",
    ringing: "Ringing",
    joined: "Joined",
    declined: "Declined",
    left: "Left",
    missed: "Missed",
};

/** Avatar with the optional speaking ring and muted chip, shared by the tile
 * grid and the incoming caller row. */
function CallAvatar(props: { participant: CallParticipant; dataId: string }) {
    const participant = () => props.participant;
    return (
        <span class="happy2-call-panel__avatar" data-happy2-ui={props.dataId}>
            <Avatar
                initials={participant().initials}
                imageUrl={participant().imageUrl}
                size="lg"
                tone={participant().tone}
            />
            <Show when={participant().speaking}>
                <span
                    aria-hidden="true"
                    class="happy2-call-panel__ring"
                    data-happy2-ui="call-panel-ring"
                />
            </Show>
            <Show when={participant().muted}>
                <span
                    aria-hidden="true"
                    class="happy2-call-panel__mute"
                    data-happy2-ui="call-panel-mute"
                >
                    <Icon name="mic" size={12} />
                </span>
            </Show>
        </span>
    );
}

/**
 * C-040 CallPanel — the in-call surface and its compact incoming variant.
 *
 * `panel` renders a status pill + duration header, a participant tile grid
 * (speaking ring, muted chip, per-state caption), and a control button row
 * (mute, camera for video calls, leave). `incoming` is a single-row alert
 * card: caller identity plus decline / join actions.
 */
export function CallPanel(props: CallPanelProps) {
    const variant = () => props.variant ?? "panel";
    const status = () => statusMeta[props.status];
    const showControls = () => variant() === "incoming" || props.status !== "ended";
    const caller = () => props.participants[0];

    return (
        <section
            class={["happy2-call-panel", props.class].filter(Boolean).join(" ")}
            data-kind={props.kind}
            data-happy2-ui="call-panel"
            data-status={props.status}
            data-testid={props["data-testid"]}
            data-variant={variant()}
            style={props.style}
        >
            <Show
                when={variant() === "incoming"}
                fallback={
                    <>
                        <header
                            class="happy2-call-panel__status"
                            data-happy2-ui="call-panel-status"
                        >
                            <Badge label={status().label} variant={status().variant} />
                            <Show when={props.durationLabel}>
                                <span
                                    class="happy2-call-panel__duration"
                                    data-happy2-ui="call-panel-duration"
                                >
                                    {props.durationLabel}
                                </span>
                            </Show>
                        </header>
                        <div
                            class="happy2-call-panel__tiles"
                            data-count={props.participants.length}
                            data-happy2-ui="call-panel-tiles"
                        >
                            <For each={props.participants}>
                                {(participant) => (
                                    <div
                                        class="happy2-call-panel__tile"
                                        data-participant-id={participant.id}
                                        data-happy2-ui="call-panel-tile"
                                        data-speaking={participant.speaking ? "" : undefined}
                                        data-state={participant.state}
                                    >
                                        <CallAvatar
                                            dataId="call-panel-tile-avatar"
                                            participant={participant}
                                        />
                                        <span
                                            class="happy2-call-panel__tile-name"
                                            data-happy2-ui="call-panel-tile-name"
                                        >
                                            {participant.name}
                                        </span>
                                        <span
                                            class="happy2-call-panel__tile-state"
                                            data-happy2-ui="call-panel-tile-state"
                                        >
                                            {participantStateLabel[participant.state]}
                                        </span>
                                    </div>
                                )}
                            </For>
                        </div>
                        <Show when={showControls()}>
                            <footer
                                class="happy2-call-panel__controls"
                                data-happy2-ui="call-panel-controls"
                            >
                                <Button
                                    aria-label={props.muted ? "Unmute" : "Mute"}
                                    data-action="mute"
                                    icon="mic"
                                    iconOnly
                                    onClick={() => props.onToggleMute?.()}
                                    size="medium"
                                    variant={props.muted ? "danger" : "secondary"}
                                />
                                <Show when={props.kind === "video"}>
                                    <Button
                                        aria-label={
                                            props.videoOn ? "Turn camera off" : "Turn camera on"
                                        }
                                        data-action="video"
                                        icon="eye"
                                        iconOnly
                                        onClick={() => props.onToggleVideo?.()}
                                        size="medium"
                                        variant={props.videoOn ? "secondary" : "danger"}
                                    />
                                </Show>
                                <Button
                                    data-action="leave"
                                    onClick={() => props.onLeave?.()}
                                    size="medium"
                                    variant="danger"
                                >
                                    Leave
                                </Button>
                            </footer>
                        </Show>
                    </>
                }
            >
                <Show when={caller()}>
                    {(person) => (
                        <>
                            <CallAvatar dataId="call-panel-caller-avatar" participant={person()} />
                            <div
                                class="happy2-call-panel__caller"
                                data-happy2-ui="call-panel-caller"
                            >
                                <span
                                    class="happy2-call-panel__caller-name"
                                    data-happy2-ui="call-panel-caller-name"
                                >
                                    {person().name}
                                </span>
                                <span
                                    class="happy2-call-panel__caller-sub"
                                    data-happy2-ui="call-panel-caller-sub"
                                >
                                    {props.kind === "video"
                                        ? "Incoming video call"
                                        : "Incoming call"}
                                </span>
                            </div>
                            <footer
                                class="happy2-call-panel__controls"
                                data-happy2-ui="call-panel-controls"
                            >
                                <Button
                                    aria-label="Decline"
                                    data-action="decline"
                                    icon="close"
                                    iconOnly
                                    onClick={() => props.onDecline?.()}
                                    size="medium"
                                    variant="danger"
                                />
                                <Button
                                    aria-label="Join"
                                    data-action="join"
                                    icon="check"
                                    iconOnly
                                    onClick={() => props.onJoin?.()}
                                    size="medium"
                                    variant="primary"
                                />
                            </footer>
                        </>
                    )}
                </Show>
            </Show>
        </section>
    );
}
