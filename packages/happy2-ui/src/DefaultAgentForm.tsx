import { type CSSProperties } from "react";
import { Button } from "./Button";
import { partitionComponentProps } from "./componentProps";
import { TextField } from "./TextField";

/**
 * The exact label of the preset ("feeling lucky") button. The button asks the
 * host to fill the fields from a predefined client-side identity list; the
 * component itself owns neither the list nor the randomness.
 */
export const DEFAULT_AGENT_LUCKY_LABEL = "Happy, I’m feeling lucky";

export type DefaultAgentFormProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** Stable DOM id used by a submit button rendered outside the form. */
    formId: string;
    /** Current display-name field value (controlled). */
    name: string;
    /** Current username field value (controlled). */
    username: string;
    onNameChange: (value: string) => void;
    onUsernameChange: (value: string) => void;
    /** Fill both fields from a predefined preset identity. */
    onLucky: () => void;
    /** Commit the current name/username as the server default agent. */
    onSubmit: () => void;
    nameError?: string;
    usernameError?: string;
    /** A whole-form failure (e.g. a server conflict) shown after the actions. */
    formError?: string;
    /** True while the create request is in flight: every form control locks. */
    submitting?: boolean;
    /** Locks every form control for a host-owned unavailable state. */
    disabled?: boolean;
    /** Prevents both linked-button and Enter-key submission while invalid. */
    submitDisabled?: boolean;
    description?: string;
    nameLabel?: string;
    usernameLabel?: string;
    namePlaceholder?: string;
    usernamePlaceholder?: string;
    usernameHint?: string;
};

/**
 * C-064 DefaultAgentForm — the modality-neutral controlled form that names the
 * built-in default agent. It owns only field, hint, preset-action, and
 * whole-form error presentation; the host chooses where the form lives and may
 * link a pinned submit button through `formId`. Native Enter submission and an
 * external submit button share the same guarded `onSubmit` path.
 */
export function DefaultAgentForm(props: DefaultAgentFormProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "formId",
        "name",
        "username",
        "onNameChange",
        "onUsernameChange",
        "onLucky",
        "onSubmit",
        "nameError",
        "usernameError",
        "formError",
        "submitting",
        "disabled",
        "submitDisabled",
        "description",
        "nameLabel",
        "usernameLabel",
        "namePlaceholder",
        "usernamePlaceholder",
        "usernameHint",
    ]);
    const controlsDisabled = () => local.submitting === true || local.disabled === true;
    const submissionDisabled = () => controlsDisabled() || local.submitDisabled === true;
    return (
        <form
            aria-busy={local.submitting === true ? "true" : undefined}
            className={["happy2-default-agent-form", local.className].filter(Boolean).join(" ")}
            data-disabled={local.disabled ? "" : undefined}
            data-happy2-ui="default-agent-form"
            data-submitting={local.submitting ? "" : undefined}
            data-testid={local["data-testid"]}
            id={local.formId}
            noValidate
            onSubmit={(event) => {
                event.preventDefault();
                if (submissionDisabled()) return;
                local.onSubmit();
            }}
            style={local.style}
        >
            <p
                className="happy2-default-agent-form__description"
                data-happy2-ui="default-agent-description"
            >
                {local.description ??
                    "This agent is the built-in identity that runs your workspace and posts every automated update. Pick a name and handle you’ll recognize."}
            </p>
            <TextField
                autoComplete="name"
                data-testid="default-agent-name"
                disabled={controlsDisabled()}
                error={local.nameError}
                fullWidth
                label={local.nameLabel ?? "Display name"}
                name="default-agent-name"
                onValueChange={local.onNameChange}
                placeholder={local.namePlaceholder ?? "Happy"}
                required
                value={local.name}
            />
            <TextField
                autoComplete="username"
                data-testid="default-agent-username"
                disabled={controlsDisabled()}
                error={local.usernameError}
                fullWidth
                hint={
                    local.usernameHint ??
                    "3–32 characters: lowercase letters, digits, underscores, or hyphens."
                }
                label={local.usernameLabel ?? "Username"}
                leadingIcon="at"
                name="default-agent-username"
                onValueChange={local.onUsernameChange}
                placeholder={local.usernamePlaceholder ?? "happy"}
                required
                value={local.username}
            />
            <div
                className="happy2-default-agent-form__preset"
                data-happy2-ui="default-agent-preset"
            >
                <Button
                    data-testid="default-agent-lucky"
                    disabled={controlsDisabled()}
                    icon="spark"
                    onClick={() => local.onLucky()}
                    type="button"
                    variant="secondary"
                >
                    {DEFAULT_AGENT_LUCKY_LABEL}
                </Button>
            </div>
            {local.formError ? (
                <p
                    className="happy2-default-agent-form__error"
                    data-happy2-ui="default-agent-error"
                    role="alert"
                >
                    {local.formError}
                </p>
            ) : null}
        </form>
    );
}
