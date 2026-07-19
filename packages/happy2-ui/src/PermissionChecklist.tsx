import { partitionComponentProps } from "./componentProps";
import { useId, type CSSProperties } from "react";
import { Checkbox } from "./Checkbox";
export type PermissionChecklistOption = {
    id: string;
    /** Short human name of the capability, e.g. "Manage secrets". */
    label: string;
    /** One-line explanation of what the capability allows. */
    description?: string;
};
export type PermissionChecklistProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    options: readonly PermissionChecklistOption[];
    /** Ids of the currently allowed options. */
    selected: readonly string[];
    onToggle?: (id: string, checked: boolean) => void;
    disabled?: boolean;
};
/**
 * C-067 PermissionChecklist — a closed allow-list editor: one 18px Checkbox per
 * capability with its name and a muted one-line description. Fully controlled —
 * the selection and every toggle flow through props, so the same checklist edits
 * a role's grants, a member's direct grants, or renders read-only when disabled.
 * Rows keep stable DOM identity per option id so focus survives store updates.
 */
export function PermissionChecklist(props: PermissionChecklistProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "options",
        "selected",
        "onToggle",
        "disabled",
    ]);
    const prefix = useId();
    const checked = (id: string) => local.selected.includes(id);
    return (
        <div
            {...rest}
            className={["happy2-permission-checklist", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="permission-checklist"
            style={local.style}
        >
            {local.options.map((option) => (
                <div
                    className="happy2-permission-checklist__row"
                    data-checked={checked(option.id) ? "" : undefined}
                    data-happy2-ui="permission-row"
                    data-permission-id={option.id}
                    key={option.id}
                >
                    <Checkbox
                        aria-label={option.label}
                        checked={checked(option.id)}
                        className="happy2-permission-checklist__checkbox"
                        disabled={local.disabled}
                        id={`${prefix}-${option.id}`}
                        onChange={(value) => local.onToggle?.(option.id, value)}
                    />
                    <label
                        className="happy2-permission-checklist__text"
                        data-happy2-ui="permission-text"
                        htmlFor={`${prefix}-${option.id}`}
                    >
                        <span
                            className="happy2-permission-checklist__label"
                            data-happy2-ui="permission-label"
                        >
                            {option.label}
                        </span>
                        {option.description ? (
                            <span
                                className="happy2-permission-checklist__description"
                                data-happy2-ui="permission-description"
                            >
                                {option.description}
                            </span>
                        ) : null}
                    </label>
                </div>
            ))}
        </div>
    );
}
