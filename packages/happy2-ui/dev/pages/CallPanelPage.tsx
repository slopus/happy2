import type { CallParticipant } from "../../src/CallPanel";
import { CallPanel } from "../../src/CallPanel";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const activeParticipants: CallParticipant[] = [
    {
        id: "1",
        name: "Ada Lovelace",
        initials: "AL",
        tone: "violet",
        state: "joined",
        speaking: true,
    },
    { id: "2", name: "Grace Hopper", initials: "GH", tone: "mint", state: "joined", muted: true },
    { id: "3", name: "Alan Turing", initials: "AT", tone: "ocean", state: "joined" },
    { id: "4", name: "Katherine J.", initials: "KJ", tone: "rose", state: "ringing" },
];

const endedParticipants: CallParticipant[] = [
    { id: "1", name: "Ada Lovelace", initials: "AL", tone: "violet", state: "left" },
    { id: "2", name: "Grace Hopper", initials: "GH", tone: "mint", state: "declined" },
];

const noop = () => {};

export function CallPanelPage() {
    return (
        <ComponentPage
            number="C-040"
            summary="Call surface + incoming variant: participant tiles, status pill, control buttons."
            title="Call panel"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="320px shell · status pill · 2-col tile grid · control row"
                    label="Active — video"
                    number="C-040a"
                    stage="app"
                >
                    <div
                        style={{
                            display: "grid",
                            justifyItems: "center",
                            gap: "8px",
                            padding: "28px",
                        }}
                    >
                        <div style={{ width: "320px" }}>
                            <DimensionRule label="width 320" />
                        </div>
                        <CallPanel
                            durationLabel="04:12"
                            kind="video"
                            onLeave={noop}
                            onToggleMute={noop}
                            onToggleVideo={noop}
                            participants={activeParticipants.slice(0, 2)}
                            status="active"
                            videoOn
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="four participants · speaking ring · muted chip"
                    label="Active — 2×2 grid"
                    number="C-040b"
                    stage="app"
                >
                    <div style={{ padding: "28px" }}>
                        <CallPanel
                            durationLabel="12:38"
                            kind="video"
                            onLeave={noop}
                            onToggleMute={noop}
                            onToggleVideo={noop}
                            participants={activeParticipants}
                            status="active"
                            videoOn
                        />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="audio call · info pill · mute + leave (no camera)"
                    label="Ringing — audio"
                    number="C-040c"
                    stage="app"
                >
                    <div style={{ padding: "28px" }}>
                        <CallPanel
                            kind="audio"
                            muted
                            onLeave={noop}
                            onToggleMute={noop}
                            participants={[
                                {
                                    id: "1",
                                    name: "Ada Lovelace",
                                    initials: "AL",
                                    tone: "violet",
                                    state: "ringing",
                                },
                                {
                                    id: "2",
                                    name: "Grace Hopper",
                                    initials: "GH",
                                    tone: "mint",
                                    state: "invited",
                                },
                            ]}
                            status="ringing"
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="neutral pill · danger captions · no control row"
                    label="Ended"
                    number="C-040d"
                    stage="app"
                >
                    <div style={{ padding: "28px" }}>
                        <CallPanel
                            durationLabel="08:04"
                            kind="video"
                            participants={endedParticipants}
                            status="ended"
                        />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="360×74 raised card · caller row · decline / join"
                    label="Incoming"
                    number="C-040e"
                    stage="chrome"
                >
                    <div
                        style={{
                            display: "grid",
                            justifyItems: "center",
                            gap: "8px",
                            padding: "28px",
                        }}
                    >
                        <div style={{ width: "360px" }}>
                            <DimensionRule label="width 360 · height 74" />
                        </div>
                        <CallPanel
                            kind="video"
                            onDecline={noop}
                            onJoin={noop}
                            participants={[
                                {
                                    id: "1",
                                    name: "Ada Lovelace",
                                    initials: "AL",
                                    tone: "violet",
                                    state: "ringing",
                                },
                            ]}
                            status="ringing"
                            variant="incoming"
                        />
                        <CallPanel
                            kind="audio"
                            onDecline={noop}
                            onJoin={noop}
                            participants={[
                                {
                                    id: "1",
                                    name: "Grace Hopper",
                                    initials: "GH",
                                    tone: "mint",
                                    state: "ringing",
                                },
                            ]}
                            status="ringing"
                            variant="incoming"
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
