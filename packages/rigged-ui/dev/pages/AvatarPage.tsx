import { For } from "solid-js";
import { Avatar, type AvatarSize, type ToneName } from "../../src/Avatar";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const FIXTURE_IMAGE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAT0lEQVR4nGPorvk+ufrTrOp3i6perqx8srHiwY6K2wfKrzNgFT1edokBq+j5srMMWEWvlZ5kwCp6r+QIA1bRp8X7GbCKvi3ezYBV9EvRNgD7aoNVazUeBQAAAABJRU5ErkJggg==";

const SIZES: Array<{ dimension: number; initials: string; size: AvatarSize }> = [
    { size: "xs", dimension: 20, initials: "MJ" },
    { size: "sm", dimension: 28, initials: "SK" },
    { size: "md", dimension: 36, initials: "ST" },
    { size: "lg", dimension: 44, initials: "AR" },
];

const TONES: ToneName[] = ["violet", "ember", "mint", "ocean", "rose", "amber", "slate", "brand"];

const row: Record<string, string> = {
    display: "flex",
    "align-items": "flex-end",
    gap: "24px",
};

const cell: Record<string, string> = {
    display: "flex",
    "flex-direction": "column",
    "align-items": "center",
    gap: "10px",
};

export function AvatarPage() {
    return (
        <ComponentPage
            number="C-004"
            title="Avatar"
            summary="Identity mark for humans (circle) and agents (rounded square) with tone gradients, presence, and image variant."
        >
            <Specimen
                number="01"
                label="Human sizes"
                detail="Circle · 20 / 28 / 36 / 44 · initials 8 / 10 / 12 / 14 px, 700"
                stage="app"
            >
                <div style={row}>
                    <For each={SIZES}>
                        {(entry) => (
                            <div style={cell}>
                                <Avatar initials={entry.initials} size={entry.size} tone="violet" />
                                <DimensionRule label={`${entry.dimension}`} />
                            </div>
                        )}
                    </For>
                </div>
            </Specimen>

            <Specimen
                number="01A"
                label="Initials calibration"
                detail="Shared cap baseline · O is the balanced optical reference · content-shaped centroids remain distinct"
                stage="app"
            >
                <div style={row}>
                    <For each={["O", "ST", "MJ", "AI", "A"]}>
                        {(initials) => (
                            <Avatar
                                initials={initials}
                                size="md"
                                tone={initials === "O" ? "ocean" : "slate"}
                            />
                        )}
                    </For>
                </div>
            </Specimen>

            <Specimen
                number="02"
                label="Agent sizes"
                detail="Rounded square · radius 6 / 7 / 9 / 10 by size"
                stage="app"
            >
                <div style={row}>
                    <For each={SIZES}>
                        {(entry) => (
                            <div style={cell}>
                                <Avatar initials="AI" size={entry.size} tone="mint" type="agent" />
                                <DimensionRule label={`${entry.dimension}`} />
                            </div>
                        )}
                    </For>
                </div>
            </Specimen>

            <Specimen
                number="03"
                label="Tone gradients"
                detail="Theme identity tones · default slate"
                stage="app"
            >
                <div style={row}>
                    <For each={TONES}>
                        {(tone) => (
                            <div style={cell}>
                                <Avatar
                                    initials={tone.slice(0, 2).toUpperCase()}
                                    size="md"
                                    tone={tone}
                                />
                                <DimensionRule label={tone} />
                            </div>
                        )}
                    </For>
                </div>
            </Specimen>

            <Specimen
                number="04"
                label="Presence"
                detail="Online dot 8px (10px on lg) · 2px app-colored ring · −1px overhang"
                stage="app"
            >
                <div style={row}>
                    <For each={SIZES}>
                        {(entry) => (
                            <div style={cell}>
                                <Avatar
                                    initials={entry.initials}
                                    size={entry.size}
                                    tone="ocean"
                                    online
                                />
                                <DimensionRule label={entry.size} />
                            </div>
                        )}
                    </For>
                    <div style={cell}>
                        <Avatar initials="AI" size="md" tone="rose" type="agent" online />
                        <DimensionRule label="agent" />
                    </div>
                </div>
            </Specimen>

            <Specimen
                number="05"
                label="Image variant"
                detail="Image covers the box and inherits the shape radius"
                stage="app"
            >
                <div style={row}>
                    <For each={SIZES}>
                        {(entry) => (
                            <div style={cell}>
                                <Avatar
                                    imageUrl={FIXTURE_IMAGE}
                                    initials={entry.initials}
                                    size={entry.size}
                                    online={entry.size === "md"}
                                />
                                <DimensionRule label={entry.size} />
                            </div>
                        )}
                    </For>
                    <div style={cell}>
                        <Avatar imageUrl={FIXTURE_IMAGE} initials="AI" size="lg" type="agent" />
                        <DimensionRule label="agent lg" />
                    </div>
                </div>
            </Specimen>

            <Specimen
                number="06"
                label="In context"
                detail="Facepile overlap −6px with chrome ring · humans and agents mixed"
                stage="chrome"
            >
                <div style={{ display: "flex", "align-items": "center", gap: "32px" }}>
                    <div style={{ display: "flex" }}>
                        <For
                            each={[
                                { initials: "MJ", tone: "ember" as ToneName },
                                { initials: "SK", tone: "violet" as ToneName },
                                { initials: "AR", tone: "ocean" as ToneName },
                            ]}
                        >
                            {(member, index) => (
                                <Avatar
                                    initials={member.initials}
                                    size="xs"
                                    tone={member.tone}
                                    style={{
                                        "margin-left": index() === 0 ? "0" : "-6px",
                                        "box-shadow": "0 0 0 2px var(--rg-bg-chrome)",
                                    }}
                                />
                            )}
                        </For>
                    </div>
                    <div style={{ display: "flex", "align-items": "center", gap: "10px" }}>
                        <Avatar initials="CX" size="xs" tone="brand" type="agent" online />
                        <span
                            style={{
                                color: "var(--rg-text-secondary)",
                                font: "500 13px/16px var(--rg-font-ui)",
                            }}
                        >
                            Codex
                        </span>
                    </div>
                    <div style={{ display: "flex", "align-items": "center", gap: "10px" }}>
                        <Avatar initials="MJ" size="sm" tone="ember" online />
                        <span
                            style={{
                                color: "var(--rg-text-secondary)",
                                font: "500 13px/16px var(--rg-font-ui)",
                            }}
                        >
                            Maya Johnson
                        </span>
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
