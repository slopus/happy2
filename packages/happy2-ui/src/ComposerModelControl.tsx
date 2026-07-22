import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "./Icon";

export type ComposerModelChoice = {
    id: string;
    label: string;
};
export type ComposerModelControlProps = {
    className?: string;
    "data-testid"?: string;
    disabled?: boolean;
    effort: string;
    efforts: readonly ComposerModelChoice[];
    model: string;
    models: readonly ComposerModelChoice[];
    onEffortChange?(id: string): void;
    onModelChange?(id: string): void;
    style?: CSSProperties;
};

type Panel = "effort" | "main" | "model";

function labelFor(choices: readonly ComposerModelChoice[], value: string) {
    return choices.find((choice) => choice.id === value)?.label ?? value;
}

/**
 * C-145 ComposerModelControl — a compact, composer-only model configuration
 * pill. Its controlled model and effort props keep product policy outside this
 * visual control, while local panel state handles the transient two-level
 * popover without a global overlay.
 */
export function ComposerModelControl(props: ComposerModelControlProps) {
    const [panel, setPanel] = useState<Panel | null>(null);
    const root = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (panel === null) return;
        const outsidePointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && !root.current?.contains(event.target))
                setPanel(null);
        };
        document.addEventListener("pointerdown", outsidePointerDown, true);
        return () => document.removeEventListener("pointerdown", outsidePointerDown, true);
    }, [panel]);
    const modelLabel = labelFor(props.models, props.model);
    const effortLabel = labelFor(props.efforts, props.effort);
    const choicesFor = (next: "effort" | "model") =>
        next === "model" ? props.models : props.efforts;
    const valueFor = (next: "effort" | "model") => (next === "model" ? props.model : props.effort);
    const change = (next: "effort" | "model", value: string) => {
        if (next === "model") props.onModelChange?.(value);
        if (next === "effort") props.onEffortChange?.(value);
        setPanel(null);
    };
    const row = (label: string, value: string, next: "effort" | "model") => (
        <button
            className="happy2-composer-model-control__row"
            data-happy2-ui="composer-model-control-row"
            onClick={() => setPanel(next)}
            type="button"
        >
            <span>{label}</span>
            <span className="happy2-composer-model-control__row-value">{value}</span>
            <Icon name="chevron-right" size={20} />
        </button>
    );
    const choicePanel = (next: "effort" | "model") => (
        <div
            aria-label={`Select ${next}`}
            className="happy2-composer-model-control__choices"
            data-happy2-ui="composer-model-control-choices"
            role="dialog"
        >
            <div className="happy2-composer-model-control__choices-label">
                {next === "model" ? "Model" : "Effort"}
            </div>
            {choicesFor(next).map((choice) => (
                <button
                    aria-pressed={choice.id === valueFor(next)}
                    className="happy2-composer-model-control__choice"
                    data-happy2-ui="composer-model-control-choice"
                    key={choice.id}
                    onClick={() => change(next, choice.id)}
                    type="button"
                >
                    <span>{choice.label}</span>
                    {choice.id === valueFor(next) ? <Icon name="check" size={20} /> : null}
                </button>
            ))}
        </div>
    );
    return (
        <div
            className={["happy2-composer-model-control", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="composer-model-control"
            data-open={panel === null ? undefined : ""}
            data-testid={props["data-testid"]}
            onKeyDown={(event) => {
                if (event.key === "Escape") setPanel(null);
            }}
            ref={root}
            style={props.style}
        >
            <button
                aria-expanded={panel !== null}
                aria-haspopup="dialog"
                aria-label={`Model: ${modelLabel}. Effort: ${effortLabel}.`}
                className="happy2-composer-model-control__trigger"
                data-happy2-ui="composer-model-control-trigger"
                disabled={props.disabled}
                onClick={() => setPanel((current) => (current === null ? "main" : null))}
                type="button"
            >
                <span className="happy2-composer-model-control__summary">
                    <span>{modelLabel}</span>
                    <span>{effortLabel}</span>
                </span>
                <Icon name="chevron-down" size={20} />
            </button>
            {panel === "main" || panel === "model" || panel === "effort" ? (
                <div
                    aria-label="Model configuration"
                    className="happy2-composer-model-control__menu"
                    data-happy2-ui="composer-model-control-menu"
                    role="dialog"
                >
                    {row("Model", modelLabel, "model")}
                    {row("Effort", effortLabel, "effort")}
                    {panel === "model" || panel === "effort" ? choicePanel(panel) : null}
                </div>
            ) : null}
        </div>
    );
}
