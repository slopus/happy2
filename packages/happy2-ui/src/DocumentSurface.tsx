import { type CSSProperties } from "react";
import * as Y from "yjs";
import { Button } from "./Button";
import {
    DocumentEditor,
    type DocumentEditorPresence,
    type DocumentEditorPresencePayload,
    type DocumentEditorUser,
} from "./DocumentEditor";
import { SURFACE_HEADER_HEIGHT } from "./InfoPanel";
import { Toolbar } from "./Toolbar";

export interface DocumentSurfaceParticipant {
    readonly name: string;
    readonly color: string;
}

export interface DocumentSurfaceProps {
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
    readonly title: string;
    readonly saveState: "idle" | "dirty" | "saving" | "error";
    readonly saveError?: string;
    /** Initial hydration only. */
    readonly loading?: boolean;
    /** Load failure message. */
    readonly error?: string;
    readonly participants?: readonly DocumentSurfaceParticipant[];
    readonly onTitleCommit?: (title: string) => void;
    readonly onClose?: () => void;
    readonly ydoc: Y.Doc;
    readonly user: DocumentEditorUser;
    readonly presence?: readonly DocumentEditorPresence[];
    readonly onPresence?: (payload: DocumentEditorPresencePayload) => void;
    readonly editable?: boolean;
    readonly theme?: "light" | "dark";
}

const SAVE_LABELS = {
    idle: "Saved",
    dirty: "Saving…",
    saving: "Saving…",
    error: "Not saved",
} as const;

/**
 * C-082 DocumentSurface — one collaborative document as a complete surface:
 * a 56px header with an inline-committable title, live save status, remote
 * participant chips, and a close action above the BlockNote editor body.
 * Props only — the host owns the session store, save pipeline, and presence
 * relay.
 */
export function DocumentSurface(props: DocumentSurfaceProps) {
    const commitTitle = (value: string) => {
        const next = value.trim();
        if (next !== props.title) props.onTitleCommit?.(next);
    };
    const body = () => {
        if (props.loading)
            return <div className="happy2-document-surface__status">Opening document…</div>;
        if (props.error !== undefined)
            return (
                <div className="happy2-document-surface__status" data-happy2-tone="danger">
                    {props.error}
                </div>
            );
        return (
            <DocumentEditor
                editable={props.editable}
                onPresence={props.onPresence}
                presence={props.presence}
                theme={props.theme}
                user={props.user}
                ydoc={props.ydoc}
            />
        );
    };
    return (
        <section
            className={["happy2-document-surface", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="document-surface"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <Toolbar
                className="happy2-document-surface__header"
                height={SURFACE_HEADER_HEIGHT}
                leading={
                    <input
                        aria-label="Document title"
                        className="happy2-document-surface__title"
                        data-happy2-ui="document-surface-title"
                        defaultValue={props.title}
                        // Remount when the authoritative title changes so the
                        // uncontrolled input never mirrors props into state.
                        key={props.title}
                        onBlur={(event) => commitTitle(event.currentTarget.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                event.currentTarget.blur();
                            }
                        }}
                        placeholder="Untitled document"
                        readOnly={props.onTitleCommit === undefined}
                        type="text"
                    />
                }
                trailing={
                    <>
                        <span
                            className="happy2-document-surface__save"
                            data-happy2-ui="document-surface-save"
                            data-state={props.saveState}
                        >
                            {props.saveState === "error" && props.saveError
                                ? props.saveError
                                : SAVE_LABELS[props.saveState]}
                        </span>
                        {(props.participants ?? []).map((participant, index) => (
                            <span
                                className="happy2-document-surface__participant"
                                key={`${participant.name}-${index}`}
                                style={{ background: participant.color }}
                                title={participant.name}
                            >
                                {(participant.name || "?").slice(0, 1).toUpperCase()}
                            </span>
                        ))}
                        {props.onClose ? (
                            <Button
                                aria-label="Close document"
                                icon="close"
                                iconOnly
                                onClick={() => props.onClose?.()}
                                size="small"
                                variant="ghost"
                            />
                        ) : null}
                    </>
                }
            />
            <div className="happy2-document-surface__body">{body()}</div>
        </section>
    );
}
