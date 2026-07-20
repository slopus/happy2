import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
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
    | "thread"
    | "at"
    | "hash"
    | "bell"
    | "more"
    | "arrow-right"
    | "shield"
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
 * Hand-drawn glyphs on a 20-unit grid. Every stroked path uses the shared
 * 1.7-unit stroke with round caps and joins so the whole set carries the same
 * ink mass. Path data is optically centered: the alpha-weighted centroid of
 * the painted pixels lands on (10, 10) within 0.4px at sizes 14/16/20 in
 * Chromium, Gecko, and WebKit (verified differentially against a calibration
 * square in Icon.test.tsx), so any off-center-looking value below is a
 * deliberate optical correction. Directional glyphs (send, arrow-right,
 * reply, play, terminal) keep intentional off-axis ink and are exempt on the
 * axis they point along.
 */
const glyphs: Record<IconName, () => ReactNode> = {
    home: () => (
        <>
            <path d="M3.3 8.25 10 2.45l6.7 5.8" />
            <path d="M5.1 7.05v6.9a1.6 1.6 0 0 0 1.6 1.6h6.6a1.6 1.6 0 0 0 1.6 -1.6V7.05" />
            <path d="M8.3 15.55v-2.8a1.7 1.7 0 0 1 3.4 0v2.8" />
        </>
    ),
    inbox: () => (
        <>
            <path d="M2.9 9.9l2.2 -5.4a1.7 1.7 0 0 1 1.6 -1.1h6.6a1.7 1.7 0 0 1 1.6 1.1l2.2 5.4v3.2a1.9 1.9 0 0 1 -1.9 1.9H4.8a1.9 1.9 0 0 1 -1.9 -1.9z" />
            <path d="M2.9 9.9h4l1.4 2.2h3.4l1.4 -2.2h4" />
        </>
    ),
    chat: () => (
        <path d="M17.75 12.8a1.7 1.7 0 0 1 -1.7 1.7H6.95l-3.4 3.2V5.8a1.7 1.7 0 0 1 1.7 -1.7h10.8a1.7 1.7 0 0 1 1.7 1.7Z" />
    ),
    agents: () => (
        <>
            <path d="M10 3v2.2" />
            <rect x="4.3" y="5.2" width="11.4" height="10.4" rx="2.4" />
            <path d="M7.8 9.5v1.9" />
            <path d="M12.2 9.5v1.9" />
        </>
    ),
    tasks: () => (
        <path d="M2.65 5l1.6 1.6 3.2 -3.2 M10.75 5h6.1 M10.75 10h6.1 M2.65 15l1.6 1.6 3.2 -3.2 M10.75 15h6.1" />
    ),
    files: () => (
        <>
            <path d="M8.2 15.8a1.7 1.7 0 0 1 -1.7 -1.7V4.3a1.7 1.7 0 0 1 1.7 -1.7h5l3.6 3.6v7.9a1.7 1.7 0 0 1 -1.7 1.7Z" />
            <path d="M12.8 2.8v2.5a1.4 1.4 0 0 0 1.4 1.4h2.4" />
            <path d="M3.7 6.2v8.3a2.1 2.1 0 0 0 2.1 2.1h7" />
        </>
    ),
    search: () => (
        <>
            <circle cx="9.3" cy="9.3" r="5.9" />
            <path d="M13.5 13.5 17 17" />
        </>
    ),
    settings: () => (
        <>
            <path d="M2.9 4.6h6.2" />
            <path d="M11.8 2.8v3.6" />
            <path d="M14.3 4.6h2.8" />
            <path d="M2.9 10h2.8" />
            <path d="M8.2 8.2v3.6" />
            <path d="M10.7 10h6.4" />
            <path d="M2.9 15.4h6.2" />
            <path d="M11.8 13.6v3.6" />
            <path d="M14.3 15.4h2.8" />
        </>
    ),
    clock: () => (
        <>
            <circle cx="10" cy="10.2" r="7" />
            <path d="M10 6.4v3.8l2.6 1.5" />
        </>
    ),
    plus: () => (
        <>
            <path d="M10 4.4v11.2" />
            <path d="M4.4 10h11.2" />
        </>
    ),
    send: () => (
        <>
            <path d="M17.4 2.6 11.6 17.2 8.4 9.6 2.6 6.4Z" />
            <path d="M17.4 2.6 8.4 9.6" />
        </>
    ),
    check: () => <path d="M3.8 9.9l4 4 8.4-8.8" />,
    "check-circle": () => (
        <>
            <circle cx="10" cy="10" r="7" />
            <path d="M6.9 10.4l2.1 2.1 4.1-4.5" />
        </>
    ),
    "chevron-down": () => <path d="M5.7 8.1l4.3 4.3 4.3 -4.3" />,
    "chevron-right": () => <path d="M8.05 5.8l4.3 4.3 -4.3 4.3" />,
    close: () => (
        <>
            <path d="M5.3 5.45l9.4 9.4" />
            <path d="M14.7 5.45l-9.4 9.4" />
        </>
    ),
    branch: () => (
        <>
            <path d="M5.85 3.05v9.6" />
            <circle cx="15.05" cy="5.45" r="2.4" />
            <circle cx="5.85" cy="15.05" r="2.4" />
            <path d="M15.05 7.85c0 4 -3 7.2 -6.8 7.2" />
        </>
    ),
    merge: () => (
        <>
            <circle cx="6.55" cy="4.35" r="2.4" />
            <circle cx="15.75" cy="13.95" r="2.4" />
            <path d="M6.55 15.95V6.75c0 4 3 7.2 6.8 7.2" />
        </>
    ),
    spark: () => (
        <path d="M10 3C10.7 6.8 13.3 9.4 17.1 10.1 13.3 10.8 10.7 13.4 10 17.2 9.3 13.4 6.7 10.8 2.9 10.1 6.7 9.4 9.3 6.8 10 3Z" />
    ),
    doc: () => (
        <>
            <path d="M12.1 2.75H6.5a1.7 1.7 0 0 0 -1.7 1.7v10.8a1.7 1.7 0 0 0 1.7 1.7h7a1.7 1.7 0 0 0 1.7 -1.7V5.85Z" />
            <path d="M11.9 2.95v2.8a1.3 1.3 0 0 0 1.3 1.3h2" />
            <path d="M7.6 10.25h4.8" />
            <path d="M7.6 13.05h4.8" />
        </>
    ),
    code: () => (
        <>
            <path d="M7.6 5.6 3.2 10l4.4 4.4" />
            <path d="M12.4 5.6 16.8 10l-4.4 4.4" />
        </>
    ),
    braces: () => (
        <>
            <path d="M9 4.6C8 4.6 7.4 5 7.4 6.2V8.4C7.4 9.4 6.9 10 5.8 10 6.9 10 7.4 10.6 7.4 11.6V13.8C7.4 15 8 15.4 9 15.4" />
            <path d="M11 4.6C12 4.6 12.6 5 12.6 6.2V8.4C12.6 9.4 13.1 10 14.2 10 13.1 10 12.6 10.6 12.6 11.6V13.8C12.6 15 12 15.4 11 15.4" />
        </>
    ),
    image: () => (
        <>
            <rect x="3.3" y="4.3" width="13.4" height="11.4" rx="2.4" />
            <circle cx="7.4" cy="8.2" r="1.15" />
            <path d="M3.8 14.2 8.2 9.9l3 2.9 2.2 -2.1 3 3" />
        </>
    ),
    play: () => (
        <path d="M7.3 5.1v9.8a.7.7 0 0 0 1.1.6l7.6-4.9a.7.7 0 0 0 0-1.2L8.4 4.5a.7.7 0 0 0-1.1.6Z" />
    ),
    pause: () => (
        <>
            <path d="M7.1 4.8v10.4" />
            <path d="M12.9 4.8v10.4" />
        </>
    ),
    thread: () => (
        <>
            <path d="M17.75 12.95a1.7 1.7 0 0 1 -1.7 1.7H6.95l-3.4 3.2V5.95a1.7 1.7 0 0 1 1.7 -1.7h10.8a1.7 1.7 0 0 1 1.7 1.7Z" />
            <path d="M7.55 8.35h6.2" />
            <path d="M7.55 11.35h4.6" />
        </>
    ),
    at: () => (
        <>
            <circle cx="10" cy="10.15" r="3" />
            <path d="M13 7.05v3.7a2 2 0 0 0 4 0v-0.6a7 7 0 1 0 -2.9 5.7" />
        </>
    ),
    hash: () => (
        <>
            <path d="M3.5 7.4h13" />
            <path d="M3.5 12.6h13" />
            <path d="M8.6 3.2 7.2 16.8" />
            <path d="M12.8 3.2 11.4 16.8" />
        </>
    ),
    bell: () => (
        <>
            <path d="M5.7 7.5a4.3 4.3 0 0 1 8.6 0c0 4.9 1.9 6.3 1.9 6.3H3.8s1.9-1.4 1.9-6.3" />
            <path d="M8.7 15.7a1.5 1.5 0 0 0 2.6 0" />
        </>
    ),
    more: () => (
        <>
            <circle cx="4.4" cy="10.1" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="10" cy="10.1" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="15.6" cy="10.1" r="1.5" fill="currentColor" stroke="none" />
        </>
    ),
    "arrow-right": () => (
        <>
            <path d="M3.6 10h12.8" />
            <path d="M10.9 4.6l5.5 5.4-5.5 5.4" />
        </>
    ),
    shield: () => (
        <path d="M10 3.2c1.7 1.4 3.9 2.2 6.1 2.2v5c0 4 -2.5 6 -6.1 7.2C6.4 16.4 3.9 14.4 3.9 10.4V5.4c2.2 0 4.4 -0.8 6.1 -2.2Z" />
    ),
    eye: () => (
        <>
            <path d="M2.9 10C4.5 6.5 7 4.7 10 4.7s5.5 1.8 7.1 5.3c-1.6 3.5-4.1 5.3-7.1 5.3S4.5 13.5 2.9 10Z" />
            <circle cx="10" cy="10" r="2.4" />
        </>
    ),
    link: () => (
        <>
            <path d="M8.3 10.8a4.2 4.2 0 0 0 6.3.5l2.5-2.5a4.2 4.2 0 0 0-5.9-5.9l-1.4 1.4" />
            <path d="M11.7 9.2a4.2 4.2 0 0 0-6.3-.5l-2.5 2.5a4.2 4.2 0 0 0 5.9 5.9l1.4-1.4" />
        </>
    ),
    smile: () => (
        <>
            <circle cx="10" cy="9.8" r="7" />
            <path d="M6.8 11.4c0.7 1.4 1.9 2.2 3.2 2.2s2.5 -0.8 3.2 -2.2" />
            <circle cx="7.4" cy="7.6" r="0.95" fill="currentColor" stroke="none" />
            <circle cx="12.6" cy="7.6" r="0.95" fill="currentColor" stroke="none" />
        </>
    ),
    paperclip: () => (
        <path d="M17.32 9.16l-6.62 6.62a4.32 4.32 0 0 1 -6.11 -6.11l6.17 -6.17a2.88 2.88 0 1 1 4.08 4.08l-6.19 6.17a1.44 1.44 0 0 1 -2.03 -2.03l6.11 -6.1" />
    ),
    mic: () => (
        <>
            <path d="M10.1 2.85a2.3 2.3 0 0 0 -2.3 2.3v4.6a2.3 2.3 0 0 0 4.6 0V5.15A2.3 2.3 0 0 0 10.1 2.85Z" />
            <path d="M15.5 8.55v1.2a5.4 5.4 0 0 1 -10.8 0V8.55" />
            <path d="M10.1 15.15v1.8" />
        </>
    ),
    users: () => (
        <>
            <circle cx="7.65" cy="6.8" r="2.8" />
            <path d="M12.35 16.4v-0.9a2.8 2.8 0 0 0 -2.8 -2.8H5.95a2.8 2.8 0 0 0 -2.8 2.8v0.9" />
            <path d="M18.15 16.4v-0.9a2.8 2.8 0 0 0 -2.1 -2.7" />
            <path d="M13.65 4.2a2.8 2.8 0 0 1 0 5.2" />
        </>
    ),
    star: () => (
        <path d="M10 2.8 11.8 7.6 16.9 7.8 12.9 11.1 14.3 16 10 13.2 5.7 16 7.1 11.1 3.1 7.8 8.2 7.6Z" />
    ),
    reply: () => (
        <>
            <path d="M8.1 13.5 3.9 9.3l4.2 -4.2" />
            <path d="M16.4 14.7v-1.7a3.3 3.3 0 0 0 -3.3 -3.3H3.9" />
        </>
    ),
    zap: () => <path d="M11.5 3.15 4.8 11.05h4.2l-0.8 6.1 7.4 -8.5h-4.6Z" />,
    terminal: () => (
        <>
            <path d="M3.6 5.8 8.4 10l-4.8 4.2" />
            <path d="M10.8 14.6h5.6" />
        </>
    ),
    filter: () => <path d="M2.8 5.4h14.4l-5.6 6.5v6.7l-3.2 -1.6v-5.1Z" />,
    edit: () => (
        <>
            <path d="M13.7 3.65a1.9 1.9 0 0 1 2.7 2.7l-9.3 9.3a2 2 0 0 1 -0.9 0.5l-3.4 1 1 -3.4a2 2 0 0 1 0.5 -0.9Z" />
            <path d="M12.1 5.25l3 3" />
        </>
    ),
    sun: () => (
        <>
            <circle cx="10" cy="10" r="3.25" />
            <path d="M10 2.7v1.6M10 15.7v1.6M2.7 10h1.6M15.7 10h1.6M4.85 4.85l1.15 1.15M14 14l1.15 1.15M15.15 4.85 14 6M6 14l-1.15 1.15" />
        </>
    ),
    moon: () => <path d="M18.15 11A6.8 6.8 0 0 1 9 1.85 7.1 7.1 0 1 0 18.15 11Z" />,
    dot: () => <circle cx="10" cy="10" r="3" fill="currentColor" stroke="none" />,
};
export const iconNames = Object.keys(glyphs) as IconName[];
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
    return (
        <svg
            aria-hidden={local["aria-label"] ? undefined : "true"}
            aria-label={local["aria-label"]}
            className={["happy2-icon", local.className].filter(Boolean).join(" ")}
            data-name={local.name}
            data-happy2-ui="icon"
            data-testid={local["data-testid"]}
            fill="none"
            height={local.size ?? 16}
            role={local["aria-label"] ? "img" : undefined}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
            style={local.color === undefined ? local.style : { ...local.style, color: local.color }}
            viewBox="0 0 20 20"
            width={local.size ?? 16}
        >
            {glyphs[local.name]()}
        </svg>
    );
}
