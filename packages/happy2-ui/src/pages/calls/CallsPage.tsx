import { useLayoutEffect, useState } from "react";
import type { CallProjection, CallsStore } from "happy2-state";
import { Avatar } from "../../Avatar";
import { Badge } from "../../Badge";
import { Box } from "../../Box";
import { CallPanel, type CallParticipant } from "../../CallPanel";
import { DataTable, type DataTableColumn, type DataTableRow } from "../../DataTable";
import { EmptyState } from "../../EmptyState";
import { StoreSurface } from "../../StoreSurface";
export interface CallsPageProps {
    store: CallsStore;
    imageUrl?: (fileId?: string) => string | undefined;
}
const historyColumns: DataTableColumn[] = [
    { id: "with", header: "Participant" },
    { id: "kind", header: "Type" },
    { id: "status", header: "Status" },
    { id: "duration", header: "Duration", align: "end" },
    { id: "time", header: "When", align: "end", width: 180 },
];
/** Complete calls surface backed by one CallsStore. */
export function CallsPage(props: CallsPageProps) {
    const [muted, setMuted] = useState(false);
    const [videoOn, setVideoOn] = useState(true);
    const [now, setNow] = useState(() => Date.now());
    useLayoutEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);
    return (
        <StoreSurface store={props.store}>
            {(snapshot, store) => {
                const calls = (() => {
                    const state = snapshot.calls;
                    return state.type === "ready" ? state.value : [];
                })();
                const active = calls.find((call) => call.status === "active");
                const incoming = calls.find((call) => call.status === "ringing");
                const history = calls.filter(
                    (call) => call.status !== "active" && call.status !== "ringing",
                );
                return active || incoming || history.length > 0 ? (
                    <Box
                        style={{
                            boxSizing: "border-box",
                            display: "flex",
                            flex: "1 1 auto",
                            flexDirection: "column",
                            minHeight: "0",
                            overflowY: "auto",
                        }}
                    >
                        <Box
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "16px",
                                padding: "24px",
                            }}
                        >
                            {incoming
                                ? ((call) => (
                                      <CallPanel
                                          kind={call.kind}
                                          onDecline={() => store.callDecline(call.id)}
                                          onJoin={() => store.callJoin(call.id)}
                                          participants={participants(call, props.imageUrl)}
                                          status="ringing"
                                          variant="incoming"
                                      />
                                  ))(incoming)
                                : null}
                            {active
                                ? ((call) => (
                                      <CallPanel
                                          durationLabel={duration(call, now)}
                                          kind={call.kind}
                                          muted={muted}
                                          onLeave={() => store.callLeave(call.id)}
                                          onToggleMute={() => setMuted((value) => !value)}
                                          onToggleVideo={() => setVideoOn((value) => !value)}
                                          participants={participants(call, props.imageUrl)}
                                          status="active"
                                          videoOn={videoOn}
                                      />
                                  ))(active)
                                : null}
                            <Box style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                <Badge label="Recent calls" variant="neutral" />
                                <DataTable
                                    columns={historyColumns}
                                    empty={
                                        <EmptyState
                                            description="Calls you place or receive will show up here."
                                            icon="clock"
                                            size="inline"
                                            title="No calls yet"
                                        />
                                    }
                                    rows={history.map((call) => historyRow(call, props.imageUrl))}
                                />
                            </Box>
                        </Box>
                    </Box>
                ) : (
                    <EmptyState
                        description="Calls you place or receive will show up here."
                        icon="mic"
                        title={snapshot.calls.type === "loading" ? "Loading calls…" : "Calls"}
                    />
                );
            }}
        </StoreSurface>
    );
}
function participants(
    call: CallProjection,
    imageUrl?: (fileId?: string) => string | undefined,
): CallParticipant[] {
    return call.participants.map((participant) => ({
        id: participant.userId,
        name: participant.identity?.displayName ?? participant.userId,
        initials: initials(participant.identity?.displayName ?? participant.userId),
        imageUrl: imageUrl?.(participant.identity?.photoFileId),
        state: participant.status === "removed" ? "left" : participant.status,
    }));
}
function historyRow(
    call: CallProjection,
    imageUrl?: (fileId?: string) => string | undefined,
): DataTableRow {
    const participant = call.participants.find((item) => item.identity);
    const name = participant?.identity?.displayName ?? call.chatId;
    return {
        id: call.id,
        cells: {
            with: (
                <Box style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Avatar
                        imageUrl={imageUrl?.(participant?.identity?.photoFileId)}
                        initials={initials(name)}
                        size="sm"
                        tone="brand"
                    />
                    {name}
                </Box>
            ),
            kind: <Badge label={call.kind === "video" ? "Video" : "Audio"} variant="neutral" />,
            status: (
                <Badge
                    label={call.status}
                    variant={call.status === "failed" ? "danger" : "neutral"}
                />
            ),
            duration: duration(call),
            time: formatDate(call.updatedAt),
        },
    };
}
function duration(call: CallProjection, now = Date.now()): string {
    if (!call.startedAt) return "—";
    const end = call.endedAt ? Date.parse(call.endedAt) : now;
    const seconds = Math.max(0, Math.round((end - Date.parse(call.startedAt)) / 1000));
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}
function initials(value: string): string {
    return value
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}
function formatDate(value: string): string {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
    );
}
