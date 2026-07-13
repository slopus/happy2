import { Show, splitProps, type JSX } from "solid-js";
import { Icon, type IconName } from "./Icon";

export type FileAttachmentKind = "file" | "photo" | "video" | "gif" | "audio" | "archive";

export type FileAttachmentProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    /** File name, shown truncated with an ellipsis when it overflows. */
    name: string;
    /** Human size string, e.g. "283 KB". */
    size?: string;
    kind?: FileAttachmentKind;
    /** Click handler — renders a real button (download/open); never a new tab. */
    onOpen?: () => void;
    "aria-label"?: string;
};

const kindIcons: Record<FileAttachmentKind, IconName> = {
    file: "doc",
    photo: "files",
    video: "play",
    gif: "play",
    audio: "mic",
    archive: "files",
};

/**
 * C-049 FileAttachment — a non-image file card for a chat message: a doc glyph,
 * a truncating file name, and an optional mono size on an inset pill. A single
 * block-level element (a real <button> when clickable) so it composes cleanly in
 * a message body — unlike wrapping a chip in an inline <a>, which breaks layout.
 */
export function FileAttachment(props: FileAttachmentProps) {
    const [local] = splitProps(props, [
        "class",
        "data-testid",
        "style",
        "name",
        "size",
        "kind",
        "onOpen",
        "aria-label",
    ]);
    const kind = () => local.kind ?? "file";

    const inner = (
        <>
            <span class="rigged-file-attachment__icon" data-rigged-ui="file-attachment-icon">
                <Icon name={kindIcons[kind()]} size={16} />
            </span>
            <span class="rigged-file-attachment__name" data-rigged-ui="file-attachment-name">
                {local.name}
            </span>
            <Show when={local.size}>
                <span class="rigged-file-attachment__size" data-rigged-ui="file-attachment-size">
                    {local.size}
                </span>
            </Show>
        </>
    );
    const className = ["rigged-file-attachment", local.class].filter(Boolean).join(" ");

    return (
        <Show
            fallback={
                <div
                    class={className}
                    data-kind={kind()}
                    data-rigged-ui="file-attachment"
                    data-testid={local["data-testid"]}
                    style={local.style}
                >
                    {inner}
                </div>
            }
            when={local.onOpen}
        >
            {(onOpen) => (
                <button
                    aria-label={local["aria-label"] ?? `Open ${local.name}`}
                    class={className}
                    data-kind={kind()}
                    data-rigged-ui="file-attachment"
                    data-testid={local["data-testid"]}
                    onClick={() => onOpen()()}
                    style={local.style}
                    type="button"
                >
                    {inner}
                </button>
            )}
        </Show>
    );
}
