import { useState, type CSSProperties } from "react";
import { Icon } from "./Icon";

export type ComposerModelChoice = {
    id: string;
    label: string;
};
export type ComposerModelControlProps = {
    advancedValue: number;
    className?: string;
    "data-testid"?: string;
    disabled?: boolean;
    effort: string;
    efforts: readonly ComposerModelChoice[];
    model: string;
    models: readonly ComposerModelChoice[];
    onAdvancedValueChange?(value: number): void;
    onEffortChange?(id: string): void;
    onModelChange?(id: string): void;
    onSpeedChange?(id: string): void;
    speed: string;
    speeds: readonly ComposerModelChoice[];
    style?: CSSProperties;
};

type Panel = "advanced" | "effort" | "main" | "model" | "speed";

function labelFor(choices: readonly ComposerModelChoice[], value: string) {
    return choices.find((choice) => choice.id === value)?.label ?? value;
}

/**
 * C-145 ComposerModelControl — a compact, composer-only model configuration
 * pill. Its controlled model, effort, speed, and advanced-value props keep
 * product policy outside this visual control, while local panel state handles
 * the transient hierarchical popover without a global overlay.
 */
export function ComposerModelControl(props: ComposerModelControlProps) {
    const [panel, setPanel] = useState<Panel | null>(null);
    const modelLabel = labelFor(props.models, props.model);
    const effortLabel = labelFor(props.efforts, props.effort);
    const speedLabel = labelFor(props.speeds, props.speed);
    const choicesFor = (next: "effort" | "model" | "speed") =>
        next === "model" ? props.models : next === "effort" ? props.efforts : props.speeds;
    const valueFor = (next: "effort" | "model" | "speed") =>
        next === "model" ? props.model : next === "effort" ? props.effort : props.speed;
    const change = (next: "effort" | "model" | "speed", value: string) => {
        if (next === "model") props.onModelChange?.(value);
        if (next === "effort") props.onEffortChange?.(value);
        if (next === "speed") props.onSpeedChange?.(value);
        setPanel(null);
    };
    const row = (label: string, value: string, next: "effort" | "model" | "speed") => (
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
    const choicePanel = (next: "effort" | "model" | "speed") => (
        <div
            aria-label={`Select ${next}`}
            className="happy2-composer-model-control__choices"
            data-happy2-ui="composer-model-control-choices"
            role="dialog"
        >
            <div className="happy2-composer-model-control__choices-label">
                {next === "model" ? "Model" : next === "effort" ? "Effort" : "Speed"}
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
            {panel === "main" || panel === "model" || panel === "effort" || panel === "speed" ? (
                <div
                    aria-label="Model configuration"
                    className="happy2-composer-model-control__menu"
                    data-happy2-ui="composer-model-control-menu"
                    role="dialog"
                >
                    {row("Model", modelLabel, "model")}
                    {row("Effort", effortLabel, "effort")}
                    {row("Speed", speedLabel, "speed")}
                    <div className="happy2-composer-model-control__divider" />
                    <button
                        className="happy2-composer-model-control__advanced"
                        data-happy2-ui="composer-model-control-advanced"
                        onClick={() => setPanel("advanced")}
                        type="button"
                    >
                        <span>Advanced</span>
                        <Icon name="chevron-down" size={16} />
                    </button>
                    {panel === "model" || panel === "effort" || panel === "speed"
                        ? choicePanel(panel)
                        : null}
                </div>
            ) : null}
            {panel === "advanced" ? (
                <div
                    aria-label="Advanced model controls"
                    className="happy2-composer-model-control__advanced-panel"
                    data-happy2-ui="composer-model-control-advanced-panel"
                    role="dialog"
                >
                    <button
                        className="happy2-composer-model-control__advanced-heading"
                        onClick={() => setPanel("main")}
                        type="button"
                    >
                        <span>Advanced</span>
                        <Icon name="chevron-right" size={20} />
                        <Icon name="zap" size={20} />
                    </button>
                    <input
                        aria-label="Advanced reasoning budget"
                        className="happy2-composer-model-control__range"
                        max={100}
                        min={0}
                        onChange={(event) =>
                            props.onAdvancedValueChange?.(Number(event.currentTarget.value))
                        }
                        type="range"
                        value={props.advancedValue}
                    />
                </div>
            ) : null}
        </div>
    );
}
