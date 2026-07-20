import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../../Button";
import { ModalOverlay } from "../../ModalOverlay";
import { Select, type SelectOption } from "../../Select";
import { SegmentedControl } from "../../SegmentedControl";

export interface ComposeModalModelOption {
    label: string;
    value: string;
}

export interface ComposeModalProps {
    busy?: boolean;
    defaultAgentUserId?: string;
    defaultEffort?: string;
    effortOptions?: readonly string[];
    models: readonly ComposeModalModelOption[];
    onClose(): void;
    onCreate(input: { agentUserId: string; effort: string; prompt: string }): void | Promise<void>;
}

const DEFAULT_EFFORT_OPTIONS = ["low", "medium", "high", "xhigh"] as const;

function effortLabel(value: string): string {
    return value === "xhigh" ? "X-High" : value.charAt(0).toUpperCase() + value.slice(1);
}

/** Prompt-first modal for starting a new agent conversation. */
export function ComposeModal(props: ComposeModalProps) {
    const busy = () => props.busy === true;
    const models = () => props.models;
    const effortOptions = () => props.effortOptions ?? DEFAULT_EFFORT_OPTIONS;
    const [prompt, setPrompt] = useState("");
    const [agentUserIdDraft, setAgentUserIdDraft] = useState(
        () => props.defaultAgentUserId ?? models()[0]?.value ?? "",
    );
    const [effort, setEffort] = useState(() => props.defaultEffort ?? "high");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        textareaRef.current?.focus();
    }, []);
    const agentUserId = agentUserIdResolve(agentUserIdDraft, props.defaultAgentUserId, models());
    const modelOptions: SelectOption[] = models().map((model) => ({
        label: model.label,
        value: model.value,
    }));
    const effortSegments = effortOptions().map((value) => ({
        label: effortLabel(value),
        value,
    }));
    const canCreate = () =>
        !busy() && prompt.trim().length > 0 && agentUserId.length > 0 && models().length > 0;
    async function submit() {
        if (!canCreate()) return;
        await props.onCreate({
            agentUserId,
            effort,
            prompt: prompt.trim(),
        });
    }
    function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
        event.preventDefault();
        void submit();
    }
    return (
        <ModalOverlay onDismiss={busy() ? undefined : props.onClose}>
            <div className="happy2-compose-modal" data-happy2-ui="compose-modal">
                <div
                    aria-labelledby="happy2-compose-modal-title"
                    aria-modal="true"
                    className="happy2-compose-modal__dialog"
                    data-happy2-ui="compose-modal-dialog"
                    role="dialog"
                >
                    <header
                        className="happy2-compose-modal__header"
                        data-happy2-ui="compose-modal-header"
                    >
                        <div
                            className="happy2-compose-modal__brand"
                            data-happy2-ui="compose-modal-brand"
                        >
                            <span
                                className="happy2-compose-modal__title"
                                id="happy2-compose-modal-title"
                            >
                                Happy
                                <span
                                    className="happy2-compose-modal__title-suffix"
                                    data-happy2-ui="compose-modal-title-suffix"
                                >
                                    {" "}
                                    2
                                </span>
                            </span>
                        </div>
                        <Button
                            aria-label="Close"
                            disabled={busy()}
                            icon="close"
                            iconOnly
                            onClick={props.onClose}
                            size="small"
                            variant="ghost"
                        />
                    </header>
                    <div
                        className="happy2-compose-modal__input"
                        data-happy2-ui="compose-modal-input"
                    >
                        <textarea
                            className="happy2-compose-modal__textarea"
                            data-happy2-ui="compose-modal-textarea"
                            disabled={busy() || models().length === 0}
                            onChange={(event) => setPrompt(event.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="What do you want to work on?"
                            ref={textareaRef}
                            rows={4}
                            value={prompt}
                        />
                    </div>
                    <footer
                        className="happy2-compose-modal__footer"
                        data-happy2-ui="compose-modal-footer"
                    >
                        <div
                            className="happy2-compose-modal__controls"
                            data-happy2-ui="compose-modal-controls"
                        >
                            <Select
                                aria-label="Model"
                                disabled={busy() || modelOptions.length === 0}
                                onValueChange={setAgentUserIdDraft}
                                options={modelOptions}
                                size="small"
                                value={agentUserId}
                            />
                            <SegmentedControl
                                disabled={busy() || effortSegments.length === 0}
                                onChange={setEffort}
                                segments={effortSegments}
                                size="small"
                                value={
                                    effortSegments.some((segment) => segment.value === effort)
                                        ? effort
                                        : (effortSegments[0]?.value ?? effort)
                                }
                            />
                        </div>
                        <Button
                            className="happy2-compose-modal__create"
                            data-happy2-ui="compose-modal-create"
                            disabled={!canCreate()}
                            icon="send"
                            onClick={() => void submit()}
                            size="medium"
                            variant="primary"
                        >
                            Create
                        </Button>
                    </footer>
                </div>
            </div>
        </ModalOverlay>
    );
}

function agentUserIdResolve(
    requested: string,
    defaultAgentUserId: string | undefined,
    models: readonly ComposeModalModelOption[],
): string {
    if (models.some((model) => model.value === requested)) return requested;
    if (defaultAgentUserId && models.some((model) => model.value === defaultAgentUserId))
        return defaultAgentUserId;
    return models[0]?.value ?? "";
}
