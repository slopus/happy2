import { createSignal, onCleanup, Show } from "solid-js";
import {
    Avatar,
    Badge,
    Box,
    CallPanel,
    DataTable,
    EmptyState,
    type BadgeVariant,
    type CallParticipant,
    type DataTableRow,
    type IconName,
} from "happy2-ui";
import {
    callHistoryColumns,
    featureEmptyStates,
    type CallDirection,
    type CallHistoryEntry,
} from "../mockData";

export type CallsViewProps = {
    participants: CallParticipant[];
    incoming?: CallParticipant[];
    history: CallHistoryEntry[];
};

/* Call kind → the Badge glyph + short label shown in each history row. */
const kindMeta: Record<CallHistoryEntry["kind"], { icon: IconName; label: string }> = {
    audio: { icon: "mic", label: "Audio" },
    video: { icon: "eye", label: "Video" },
};

/* Direction → a color-coded Badge: a missed call reads danger, an answered
 * incoming reads info, an outgoing call reads accent. */
const directionMeta: Record<CallDirection, { label: string; variant: BadgeVariant }> = {
    incoming: { label: "Incoming", variant: "info" },
    outgoing: { label: "Outgoing", variant: "accent" },
    missed: { label: "Missed", variant: "danger" },
};

/* The active call opens with a running clock; mm:ss keeps the header honest. */
function formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Calls feature area — an active {@link CallPanel}, an incoming-call variant of
 * the same panel, and a {@link DataTable} of recent call history. Calls are not
 * yet backed by the server client, so the screen is composed from the mock-data
 * foundation; call controls drive local UI state (mute/camera/leave and
 * join/decline) so the panels behave. Empty history and a fully idle screen
 * fall back to {@link EmptyState}.
 */
export function CallsView(props: CallsViewProps) {
    const [muted, setMuted] = createSignal(false);
    const [videoOn, setVideoOn] = createSignal(true);
    const [activeEnded, setActiveEnded] = createSignal(false);
    const [incomingResolved, setIncomingResolved] = createSignal(false);
    const [seconds, setSeconds] = createSignal(12 * 60 + 4);

    const timer = setInterval(() => {
        if (!activeEnded()) setSeconds((value) => value + 1);
    }, 1000);
    onCleanup(() => clearInterval(timer));

    const incomingCallers = () => props.incoming ?? [];
    const hasActive = () => !activeEnded() && props.participants.length > 0;
    const hasIncoming = () => !incomingResolved() && incomingCallers().length > 0;
    const hasHistory = () => props.history.length > 0;
    const isEmpty = () => !hasActive() && !hasIncoming() && !hasHistory();

    const historyRows = (): DataTableRow[] =>
        props.history.map((entry) => ({
            id: entry.id,
            cells: {
                with: (
                    <Box style={{ display: "flex", "align-items": "center", gap: "10px" }}>
                        <Avatar initials={entry.initials} size="sm" tone={entry.tone} />
                        {entry.with}
                    </Box>
                ),
                kind: (
                    <Badge
                        icon={kindMeta[entry.kind].icon}
                        label={kindMeta[entry.kind].label}
                        variant="neutral"
                    />
                ),
                direction: (
                    <Badge
                        label={directionMeta[entry.direction].label}
                        variant={directionMeta[entry.direction].variant}
                    />
                ),
                duration: entry.duration,
                time: entry.time,
            },
        }));

    const emptyState = featureEmptyStates["calls"]!;

    return (
        <Show
            when={!isEmpty()}
            fallback={
                <EmptyState
                    description={emptyState.description}
                    icon={emptyState.icon}
                    title={emptyState.title}
                />
            }
        >
            <Box
                style={{
                    display: "flex",
                    "flex-direction": "column",
                    flex: "1 1 auto",
                    gap: "16px",
                    "min-height": "0",
                    "overflow-y": "auto",
                    padding: "24px",
                    "box-sizing": "border-box",
                }}
            >
                <Show when={hasIncoming()}>
                    <CallPanel
                        kind="audio"
                        onDecline={() => setIncomingResolved(true)}
                        onJoin={() => setIncomingResolved(true)}
                        participants={incomingCallers()}
                        status="ringing"
                        variant="incoming"
                    />
                </Show>
                <Show when={hasActive()}>
                    <CallPanel
                        durationLabel={formatDuration(seconds())}
                        kind="video"
                        muted={muted()}
                        onLeave={() => setActiveEnded(true)}
                        onToggleMute={() => setMuted((value) => !value)}
                        onToggleVideo={() => setVideoOn((value) => !value)}
                        participants={props.participants}
                        status="active"
                        videoOn={videoOn()}
                    />
                </Show>
                <Box style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                    <Badge label="Recent calls" variant="neutral" />
                    <DataTable
                        columns={callHistoryColumns}
                        empty={
                            <EmptyState
                                description="Calls you place or receive will show up here."
                                icon="clock"
                                size="inline"
                                title="No calls yet"
                            />
                        }
                        rows={historyRows()}
                    />
                </Box>
            </Box>
        </Show>
    );
}
