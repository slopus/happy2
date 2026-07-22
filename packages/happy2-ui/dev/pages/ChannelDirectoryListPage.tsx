import { ChannelDirectoryList } from "../../src/ChannelDirectoryList";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const channels = [
    { id: "engineering", name: "Engineering", visibility: "public" as const },
    {
        id: "release-checklist",
        name: "Release checklist",
        parentName: "Engineering",
        visibility: "public" as const,
    },
    { id: "founders", name: "Founders", visibility: "private" as const },
    {
        id: "hiring-plan",
        name: "Hiring plan",
        parentName: "Founders",
        visibility: "private" as const,
    },
];

export function ChannelDirectoryListPage() {
    return (
        <ComponentPage
            number="C-144"
            summary="A compact, history-free directory of eligible channels. Every row names public or private access, keeps child parent context visible, and offers an explicit Join action."
            title="Channel directory list"
        >
            <Specimen
                detail="56 px rows · public hash / private lock · stable Join action"
                label="Eligible channels"
                number="01"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        width: "400px",
                    }}
                >
                    <ChannelDirectoryList channels={channels} onJoin={() => {}} />
                    <DimensionRule label="400 px wide · parent context carries no message history" />
                </div>
            </Specimen>

            <Specimen
                detail="Transient joining and displayable action failure supplied entirely through props"
                label="Action states"
                number="02"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        width: "400px",
                    }}
                >
                    <ChannelDirectoryList
                        channels={channels.slice(1, 3)}
                        joiningId="release-checklist"
                        onJoin={() => {}}
                    />
                    <ChannelDirectoryList
                        channels={[channels[3]!]}
                        error="You no longer have access to this channel."
                        onJoin={() => {}}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
