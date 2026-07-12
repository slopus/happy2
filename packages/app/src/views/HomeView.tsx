import { For, Show } from "solid-js";
import {
    AgentDesk,
    Box,
    EmptyState,
    NotificationList,
    StatTile,
    type NotificationItem,
    type StatTileProps,
} from "rigged-ui";
import { type AuthSession } from "../components/AuthGate";
import { deskDone, deskQueued, deskRunning, featureEmptyStates } from "../mockData";

export type HomeViewProps = {
    stats: StatTileProps[];
    notifications: NotificationItem[];
    session?: AuthSession;
};

/**
 * Home feature area — a day-at-a-glance dashboard composed entirely from
 * rigged-ui: a StatTile row (unread / mentions / agent runs / storage), a recent
 * NotificationList, and the docked AgentDesk overview of agent activity. Stats
 * and notifications arrive as props; the agent-desk lists are read from the mock
 * foundation (no server feed yet). Notifications fall back to EmptyState.
 */
export function HomeView(props: HomeViewProps) {
    const recent = () => props.notifications.slice(0, 6);
    const empty = featureEmptyStates["home"]!;

    return (
        <Box
            style={{
                display: "flex",
                "flex-direction": "column",
                gap: "16px",
                height: "100%",
                "min-height": "0",
                overflow: "hidden",
                padding: "20px",
            }}
        >
            <Box
                style={{
                    display: "grid",
                    "grid-template-columns": "repeat(4, minmax(0, 1fr))",
                    gap: "12px",
                    flex: "none",
                }}
            >
                <For each={props.stats}>{(stat) => <StatTile {...stat} />}</For>
            </Box>

            <Box
                style={{
                    display: "flex",
                    gap: "16px",
                    flex: "1 1 0%",
                    "min-height": "0",
                }}
            >
                <Box
                    style={{
                        display: "flex",
                        "flex-direction": "column",
                        flex: "1 1 0%",
                        "min-width": "0",
                        "min-height": "0",
                        "overflow-y": "auto",
                    }}
                >
                    <Show
                        fallback={
                            <EmptyState
                                description={empty.description}
                                icon={empty.icon}
                                title={empty.title}
                            />
                        }
                        when={recent().length > 0}
                    >
                        <NotificationList notifications={recent()} />
                    </Show>
                </Box>

                <Box
                    style={{
                        display: "flex",
                        flex: "none",
                        "min-height": "0",
                        width: "340px",
                    }}
                >
                    <AgentDesk done={deskDone} queued={deskQueued} running={deskRunning} />
                </Box>
            </Box>
        </Box>
    );
}
