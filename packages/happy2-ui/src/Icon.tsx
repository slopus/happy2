import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { ioniconsGlyphs, type IoniconName } from "./vectorIcons/ioniconsGlyphs";
import { octiconsGlyphs, type OcticonName } from "./vectorIcons/octiconsGlyphs";
export type IconName =
    | "home"
    | "inbox"
    | "chat"
    | "agents"
    | "tasks"
    | "files"
    | "search"
    | "settings"
    | "clock"
    | "plus"
    | "send"
    | "check"
    | "check-circle"
    | "chevron-down"
    | "chevron-right"
    | "close"
    | "branch"
    | "merge"
    | "spark"
    | "doc"
    | "code"
    | "braces"
    | "image"
    | "play"
    | "pause"
    | "at"
    | "hash"
    | "bell"
    | "more"
    | "arrow-right"
    | "shield"
    | "lock"
    | "eye"
    | "link"
    | "smile"
    | "paperclip"
    | "mic"
    | "users"
    | "star"
    | "reply"
    | "zap"
    | "terminal"
    | "filter"
    | "edit"
    | "sun"
    | "moon"
    | "trash"
    | "dot";
export type IconProps = {
    name: IconName;
    size?: 12 | 14 | 16 | 18 | 20;
    color?: string;
    className?: string;
    style?: CSSProperties;
    "aria-label"?: string;
    "data-testid"?: string;
};
/*
 * The curated house icon vocabulary, backed by the font-based vector sets ported
 * verbatim from Happy's `@expo/vector-icons` usage (Ionicons and Octicons). Each
 * curated `IconName` resolves to one upstream glyph in one set, so a name renders
 * the exact glyph Happy renders while call sites keep the small, stable
 * `IconName` union. Outline Ionicons variants are chosen so the set reads with a
 * consistent light stroke weight; the few code/repository affordances that only
 * Octicons carries (branch, merge, braces, hash) come from Octicons.
 *
 * The glyph itself is a Private Use Area codepoint painted in the icon font, so
 * there is no path data or optical centering to tune here — the font supplies a
 * box-centered glyph. Regenerate the glyphmaps from upstream rather than editing
 * a codepoint here.
 */
type IconGlyph = { set: "ionicons"; name: IoniconName } | { set: "octicons"; name: OcticonName };
const glyphs: Record<IconName, IconGlyph> = {
    home: { set: "ionicons", name: "home-outline" },
    inbox: { set: "ionicons", name: "file-tray-outline" },
    chat: { set: "ionicons", name: "chatbubble-outline" },
    agents: { set: "ionicons", name: "hardware-chip-outline" },
    tasks: { set: "ionicons", name: "checkbox-outline" },
    files: { set: "ionicons", name: "documents-outline" },
    search: { set: "ionicons", name: "search-outline" },
    settings: { set: "ionicons", name: "settings-outline" },
    clock: { set: "ionicons", name: "time-outline" },
    plus: { set: "ionicons", name: "add-outline" },
    send: { set: "ionicons", name: "paper-plane-outline" },
    check: { set: "ionicons", name: "checkmark-outline" },
    "check-circle": { set: "ionicons", name: "checkmark-circle-outline" },
    "chevron-down": { set: "ionicons", name: "chevron-down-outline" },
    "chevron-right": { set: "ionicons", name: "chevron-forward-outline" },
    close: { set: "ionicons", name: "close-outline" },
    branch: { set: "octicons", name: "git-branch" },
    merge: { set: "octicons", name: "git-merge" },
    spark: { set: "ionicons", name: "sparkles-outline" },
    doc: { set: "ionicons", name: "document-text-outline" },
    code: { set: "ionicons", name: "code-slash-outline" },
    braces: { set: "octicons", name: "code" },
    image: { set: "ionicons", name: "image-outline" },
    play: { set: "ionicons", name: "play-outline" },
    pause: { set: "ionicons", name: "pause-outline" },
    at: { set: "ionicons", name: "at-outline" },
    hash: { set: "octicons", name: "hash" },
    bell: { set: "ionicons", name: "notifications-outline" },
    more: { set: "ionicons", name: "ellipsis-horizontal" },
    "arrow-right": { set: "ionicons", name: "arrow-forward-outline" },
    shield: { set: "ionicons", name: "shield-checkmark-outline" },
    lock: { set: "ionicons", name: "lock-closed-outline" },
    eye: { set: "ionicons", name: "eye-outline" },
    link: { set: "ionicons", name: "link-outline" },
    smile: { set: "ionicons", name: "happy-outline" },
    paperclip: { set: "ionicons", name: "attach-outline" },
    mic: { set: "ionicons", name: "mic-outline" },
    users: { set: "ionicons", name: "people-outline" },
    star: { set: "ionicons", name: "star-outline" },
    reply: { set: "ionicons", name: "arrow-undo-outline" },
    zap: { set: "ionicons", name: "flash-outline" },
    terminal: { set: "ionicons", name: "terminal-outline" },
    filter: { set: "ionicons", name: "funnel-outline" },
    edit: { set: "ionicons", name: "create-outline" },
    sun: { set: "ionicons", name: "sunny-outline" },
    moon: { set: "ionicons", name: "moon-outline" },
    trash: { set: "ionicons", name: "trash-outline" },
    dot: { set: "ionicons", name: "ellipse" },
};
export const iconNames = Object.keys(glyphs) as IconName[];
function glyphChar(glyph: IconGlyph) {
    const codepoint =
        glyph.set === "ionicons" ? ioniconsGlyphs[glyph.name] : octiconsGlyphs[glyph.name];
    return String.fromCodePoint(codepoint);
}
export function Icon(props: IconProps) {
    const [local] = partitionComponentProps(props, [
        "aria-label",
        "className",
        "color",
        "data-testid",
        "name",
        "size",
        "style",
    ]);
    const glyph = glyphs[local.name];
    const size = local.size ?? 16;
    return (
        <span
            aria-hidden={local["aria-label"] ? undefined : "true"}
            aria-label={local["aria-label"]}
            className={["happy2-icon", local.className].filter(Boolean).join(" ")}
            data-glyph={glyph.name}
            data-happy2-ui="icon"
            data-name={local.name}
            data-set={glyph.set}
            data-testid={local["data-testid"]}
            role={local["aria-label"] ? "img" : undefined}
            style={{
                fontSize: `${size}px`,
                lineHeight: 1,
                width: `${size}px`,
                height: `${size}px`,
                ...local.style,
                ...(local.color === undefined ? null : { color: local.color }),
            }}
        >
            {glyphChar(glyph)}
        </span>
    );
}
