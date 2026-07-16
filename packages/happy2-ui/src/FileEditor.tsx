import { Show, splitProps, type JSX } from "solid-js";
import { Button } from "./Button";
import { Icon } from "./Icon";

export type FileEditorProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    /** Full workspace path — split into a file name and a directory subtitle. */
    path: string;
    /** Editor content. */
    value: string;
    onValueChange?: (value: string) => void;
    onSave?: () => void;
    onRevert?: () => void;
    onClose?: () => void;
    /** Unsaved local edits exist. Drives the marker, Save, and Revert. */
    dirty?: boolean;
    /** A save is in flight. */
    saving?: boolean;
    readOnly?: boolean;
    /** Alert slot between header and body — a disk-change or conflict Banner. */
    banner?: JSX.Element;
    /** Right-aligned status-bar text (e.g. "Saved", "1.2 KB"). */
    status?: string;
    placeholder?: string;
    saveLabel?: string;
    revertLabel?: string;
    closeLabel?: string;
};

function splitPath(path: string): { name: string; directory: string } {
    const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
    const slash = trimmed.lastIndexOf("/");
    return slash < 0
        ? { name: trimmed, directory: "" }
        : { name: trimmed.slice(slash + 1), directory: trimmed.slice(0, slash + 1) };
}

/**
 * C-054 FileEditor — a props-only text editor surface for one workspace file.
 * A 52px surface header (name, directory subtitle, unsaved marker, Save /
 * Revert / Close), an optional alert banner for disk-change or conflict, a
 * monospace code body, and a status bar. Cmd/Ctrl+S saves. The app owns the
 * draft, the dirty/saving state, and the conflict-safe write — the editor only
 * renders and reports intent.
 */
export function FileEditor(props: FileEditorProps) {
    const [local] = splitProps(props, [
        "class",
        "data-testid",
        "style",
        "path",
        "value",
        "onValueChange",
        "onSave",
        "onRevert",
        "onClose",
        "dirty",
        "saving",
        "readOnly",
        "banner",
        "status",
        "placeholder",
        "saveLabel",
        "revertLabel",
        "closeLabel",
    ]);

    const parts = () => splitPath(local.path);
    const canSave = () => Boolean(local.dirty) && !local.saving && !local.readOnly;

    const handleKeyDown = (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            if (canSave()) local.onSave?.();
        }
    };

    return (
        <section
            class={["happy2-file-editor", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="file-editor"
            data-dirty={local.dirty ? "" : undefined}
            data-testid={local["data-testid"]}
            onKeyDown={handleKeyDown}
            style={local.style}
        >
            <header class="happy2-file-editor__header" data-happy2-ui="file-editor-header">
                <span class="happy2-file-editor__glyph" data-happy2-ui="file-editor-glyph">
                    <Icon name="doc" size={16} />
                </span>
                <span class="happy2-file-editor__heading" data-happy2-ui="file-editor-heading">
                    <span class="happy2-file-editor__name-row">
                        <span class="happy2-file-editor__name" data-happy2-ui="file-editor-name">
                            {parts().name}
                        </span>
                        <Show when={local.dirty}>
                            <span
                                aria-label="Unsaved changes"
                                class="happy2-file-editor__marker"
                                data-happy2-ui="file-editor-marker"
                            />
                        </Show>
                    </span>
                    <Show when={parts().directory}>
                        <span
                            class="happy2-file-editor__subtitle"
                            data-happy2-ui="file-editor-subtitle"
                        >
                            {parts().directory}
                        </span>
                    </Show>
                </span>
                <span class="happy2-file-editor__actions" data-happy2-ui="file-editor-actions">
                    <Show when={local.dirty && !local.readOnly}>
                        <Button
                            disabled={local.saving}
                            onClick={() => local.onRevert?.()}
                            size="small"
                            variant="ghost"
                        >
                            {local.revertLabel ?? "Revert"}
                        </Button>
                    </Show>
                    <Show when={!local.readOnly}>
                        <Button disabled={!canSave()} onClick={() => local.onSave?.()} size="small">
                            {local.saving ? "Saving…" : (local.saveLabel ?? "Save")}
                        </Button>
                    </Show>
                    <Show when={local.onClose}>
                        <Button
                            aria-label={local.closeLabel ?? "Close file"}
                            icon="close"
                            iconOnly
                            onClick={() => local.onClose?.()}
                            size="small"
                            variant="ghost"
                        />
                    </Show>
                </span>
            </header>
            <Show when={local.banner}>
                <div class="happy2-file-editor__banner" data-happy2-ui="file-editor-banner">
                    {local.banner}
                </div>
            </Show>
            <textarea
                class="happy2-file-editor__area"
                data-happy2-ui="file-editor-area"
                onInput={(event) => local.onValueChange?.(event.currentTarget.value)}
                placeholder={local.placeholder}
                readOnly={local.readOnly}
                spellcheck={false}
                value={local.value}
                wrap="off"
            />
            <footer class="happy2-file-editor__status" data-happy2-ui="file-editor-status">
                <span class="happy2-file-editor__path" data-happy2-ui="file-editor-path">
                    {local.path}
                </span>
                <Show when={local.status}>
                    <span
                        class="happy2-file-editor__status-text"
                        data-happy2-ui="file-editor-status-text"
                    >
                        {local.status}
                    </span>
                </Show>
            </footer>
        </section>
    );
}
