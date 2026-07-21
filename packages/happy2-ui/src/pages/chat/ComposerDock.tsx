import { useRef, type ReactNode } from "react";
import type { AgentActivityState, DeepReadonly } from "happy2-state";
import {
    AgentActivityStrip,
    Box,
    Composer,
    type ContextItem,
    type Mentionable,
} from "./ChatPageComponents.js";
import type { AudienceValue } from "../../AudienceToggle.js";
import { emojiItems } from "./chatPageModels.js";
export interface ComposerDockProps {
    activities: readonly DeepReadonly<AgentActivityState>[];
    activityNow: number;
    composerAudience?: AudienceValue;
    composerCompactHint: string;
    /** Native plugin composer contribution triggers, shown in the composer toolbar. */
    composerContributions?: ReactNode;
    composerDisabled: boolean;
    composerHint: string;
    composerMentions: Mentionable[];
    composerPending: boolean;
    composerSendEnabled: boolean;
    composerValue: string;
    contextItems: ContextItem[];
    placeholder: string;
    onAudienceChange?(audience: AudienceValue): void;
    onComposerFocusChange(focused: boolean): void;
    onContextRemove(id: string): void;
    onFilesSelected(files: FileList | null): void;
    onMentionSelect?(mention: Mentionable): void;
    onSend(): void;
    onValueChange(value: string): void;
}
/**
 * The grounded chat input bar: an optional live agent-activity strip above a
 * Composer, centered on the shared chat measure with a top hairline. It is
 * reusable so the same input can sit at the bottom of the conversation column
 * and, when a trace panel is expanded to fill the shell, at the bottom of that
 * expanded panel. It owns only the hidden file-input ref; every value and every
 * handler comes from props so both mounts drive the one composer surface store.
 */
export function ComposerDock(props: ComposerDockProps) {
    const fileInput = useRef<HTMLInputElement>(null);
    return (
        <Box className="happy2-composer-dock" data-happy2-ui="composer-dock">
            <Box className="happy2-composer-dock__compose">
                {props.activities.length > 0 ? (
                    <AgentActivityStrip
                        now={props.activityNow}
                        // Rig subagent/terminal ids are only unique per agent, so
                        // two concurrently active agents need namespaced row keys.
                        subagents={props.activities.flatMap((activity) =>
                            activity.subagents.map((subagent) => ({
                                ...subagent,
                                id: `${activity.agentUserId}:${subagent.id}`,
                            })),
                        )}
                        terminals={props.activities.flatMap((activity) =>
                            activity.backgroundTerminals.map((terminal) => ({
                                ...terminal,
                                id: `${activity.agentUserId}:${terminal.id}`,
                            })),
                        )}
                    />
                ) : null}
                <input
                    hidden
                    multiple
                    onChange={(event) => props.onFilesSelected(event.currentTarget.files)}
                    ref={fileInput}
                    type="file"
                />
                <Composer
                    audience={props.composerAudience}
                    contributions={props.composerContributions}
                    contextItems={props.contextItems}
                    disabled={props.composerDisabled}
                    emoji={emojiItems}
                    compactHint={props.composerCompactHint}
                    hint={props.composerHint}
                    mentions={props.composerMentions}
                    onAttachFile={() => fileInput.current?.click()}
                    onMentionSelect={props.onMentionSelect}
                    onAudienceChange={props.onAudienceChange}
                    onContextRemove={props.onContextRemove}
                    onFocusChange={props.onComposerFocusChange}
                    onSend={props.onSend}
                    onValueChange={props.onValueChange}
                    pending={props.composerPending}
                    placeholder={props.placeholder}
                    sendEnabled={props.composerSendEnabled}
                    value={props.composerValue}
                />
            </Box>
        </Box>
    );
}
