import { Show, splitProps, type JSX } from "solid-js";
import { Icon, type IconName } from "./Icon";

export type FileAttachmentKind = "file" | "photo" | "video" | "gif" | "audio" | "archive";
export type FileAttachmentVariant = "compact" | "chat";

export type FileAttachmentProps = {
    /** Keeps the hover affordance visible in deterministic blueprint fixtures. */
    actionsVisible?: boolean;
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    /** File name, shown truncated with an ellipsis when it overflows. */
    name: string;
    /** Human size string, e.g. "283 KB". */
    size?: string;
    kind?: FileAttachmentKind;
    /** Larger Slack-like card used for attachments in a chat message list. */
    variant?: FileAttachmentVariant;
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
 * C-049 FileAttachment — a non-image file rendered as either a compact control
 * or a bounded chat-list card. A single element (a real <button> when clickable)
 * keeps the entire attachment one accessible action.
 */
export function FileAttachment(props: FileAttachmentProps) {
    const [local] = splitProps(props, [
        "actionsVisible",
        "class",
        "data-testid",
        "style",
        "name",
        "size",
        "kind",
        "variant",
        "onOpen",
        "aria-label",
    ]);
    const kind = () => local.kind ?? "file";
    const variant = () => local.variant ?? "compact";
    const typeLabel = () => {
        const extension = local.name.match(/\.([a-z0-9]{1,8})$/i)?.[1];
        if (extension) return extension.toUpperCase();
        return {
            archive: "Archive",
            audio: "Audio",
            file: "File",
            gif: "GIF",
            photo: "Image",
            video: "Video",
        }[kind()];
    };

    const compactInner = (
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
    const chatInner = (
        <>
            <span class="rigged-file-attachment__icon" data-rigged-ui="file-attachment-icon">
                <Icon name={kindIcons[kind()]} size={20} />
            </span>
            <span class="rigged-file-attachment__copy" data-rigged-ui="file-attachment-copy">
                <span class="rigged-file-attachment__name" data-rigged-ui="file-attachment-name">
                    {local.name}
                </span>
                <span class="rigged-file-attachment__meta" data-rigged-ui="file-attachment-meta">
                    <span class="rigged-file-attachment__meta-default">
                        {typeLabel()}
                        <Show when={local.size}>{(size) => <> · {size()}</>}</Show>
                    </span>
                    <Show when={local.onOpen}>
                        <span class="rigged-file-attachment__meta-hover">
                            Download {typeLabel()}
                        </span>
                    </Show>
                </span>
            </span>
            <Show when={local.onOpen}>
                <span
                    aria-hidden="true"
                    class="rigged-file-attachment__action"
                    data-rigged-ui="file-attachment-action"
                >
                    <Icon name="arrow-right" size={16} />
                </span>
            </Show>
        </>
    );
    const className = ["rigged-file-attachment", local.class].filter(Boolean).join(" ");
    const inner = () => (variant() === "chat" ? chatInner : compactInner);

    return (
        <Show
            fallback={
                <div
                    class={className}
                    data-actions-visible={local.actionsVisible ? "" : undefined}
                    data-kind={kind()}
                    data-rigged-ui="file-attachment"
                    data-variant={variant()}
                    data-testid={local["data-testid"]}
                    style={local.style}
                >
                    {inner()}
                </div>
            }
            when={local.onOpen}
        >
            {(onOpen) => (
                <button
                    aria-label={local["aria-label"] ?? `Open ${local.name}`}
                    class={className}
                    data-actions-visible={local.actionsVisible ? "" : undefined}
                    data-kind={kind()}
                    data-rigged-ui="file-attachment"
                    data-variant={variant()}
                    data-testid={local["data-testid"]}
                    onClick={() => onOpen()()}
                    style={local.style}
                    type="button"
                >
                    {inner()}
                </button>
            )}
        </Show>
    );
}
