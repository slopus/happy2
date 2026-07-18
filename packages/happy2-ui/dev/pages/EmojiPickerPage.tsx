import { EmojiPicker, type EmojiItem } from "../../src/EmojiPicker";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/* Custom (non-unicode) emoji as an inline SVG data-URI — a deterministic,
 * network-free stand-in for an uploaded custom reaction image. */
const customEmoji = (fill: string) =>
    `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="${fill}"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg>`,
    )}`;

const emoji: EmojiItem[] = [
    { id: "thumbsup", char: "\u{1F44D}", name: "thumbs up" },
    { id: "tada", char: "\u{1F389}", name: "tada" },
    { id: "rocket", char: "\u{1F680}", name: "rocket" },
    { id: "check", char: "\u{2705}", name: "check mark" },
    { id: "fire", char: "\u{1F525}", name: "fire" },
    { id: "heart", char: "\u{2764}\u{FE0F}", name: "heart" },
    { id: "eyes", char: "\u{1F440}", name: "eyes" },
    { id: "pray", char: "\u{1F64F}", name: "folded hands" },
    { id: "grinning", char: "\u{1F600}", name: "grinning" },
    { id: "sweat-smile", char: "\u{1F605}", name: "sweat smile" },
    { id: "thinking", char: "\u{1F914}", name: "thinking" },
    { id: "party", char: "\u{1F973}", name: "partying face" },
    { id: "star", char: "\u{2B50}", name: "star" },
    { id: "sparkles", char: "\u{2728}", name: "sparkles" },
    { id: "bulb", char: "\u{1F4A1}", name: "light bulb" },
    { id: "handshake", char: "\u{1F91D}", name: "handshake" },
    { id: "flag-us", char: "\u{1F1FA}\u{1F1F8}", name: "flag United States" },
    { id: "dev", char: "\u{1F469}\u{200D}\u{1F4BB}", name: "woman technologist" },
    { id: "relay", imageUrl: customEmoji("#8b7cf7"), name: "relay (custom)" },
    { id: "pink", imageUrl: customEmoji("#f472b6"), name: "party-parrot (custom)" },
    { id: "mint", imageUrl: customEmoji("#34d399"), name: "shipit (custom)" },
    { id: "amber", imageUrl: customEmoji("#fbbf24"), name: "on-fire (custom)" },
    { id: "rainbow", char: "\u{1F308}", name: "rainbow" },
    { id: "pizza", char: "\u{1F355}", name: "pizza" },
];

export function EmojiPickerPage() {
    return (
        <ComponentPage
            number="C-043"
            summary="Reaction picker: a search field over an emoji grid of fixed, equal 36px slots — unicode chars and custom images share one slot geometry."
            title="Emoji picker"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="306px card · 8 columns · 36px slots · 24 emoji"
                    label="Default"
                    number="EP-01"
                    stage="surface"
                >
                    <div style={{ display: "grid", gap: "8px", justifyItems: "start" }}>
                        <div style={{ width: "306px" }}>
                            <DimensionRule label="width 306" />
                        </div>
                        <EmojiPicker emoji={emoji} onSelect={() => {}} />
                    </div>
                </Specimen>

                <Specimen
                    detail="recent row + full grid, mono section labels"
                    label="With recent"
                    number="EP-02"
                    stage="surface"
                >
                    <EmojiPicker
                        emoji={emoji}
                        onSelect={() => {}}
                        recent={["thumbsup", "tada", "rocket", "fire", "heart", "relay"]}
                    />
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="active query — recent hidden while searching"
                    label="Searching"
                    number="EP-03"
                    stage="surface"
                >
                    <EmojiPicker
                        emoji={emoji.filter(
                            (item) => item.name.includes("fire") || item.id === "amber",
                        )}
                        onSelect={() => {}}
                        query="fire"
                        recent={["thumbsup", "tada"]}
                    />
                </Specimen>

                <Specimen
                    detail="no results — empty message"
                    label="Empty"
                    number="EP-04"
                    stage="surface"
                >
                    <EmojiPicker emoji={[]} query="zzzz" />
                </Specimen>

                <Specimen
                    detail="columns=6 — slots stay a fixed 36px"
                    label="Narrow"
                    number="EP-05"
                    stage="surface"
                >
                    <EmojiPicker columns={6} emoji={emoji.slice(0, 18)} onSelect={() => {}} />
                </Specimen>
            </div>
        </ComponentPage>
    );
}
