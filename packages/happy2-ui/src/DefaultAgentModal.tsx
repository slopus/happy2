import { partitionComponentProps } from "./componentProps";
import { useId, type CSSProperties } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { TextField } from "./TextField";

/**
 * The exact label of the preset ("feeling lucky") button. The button asks the
 * host to fill the fields from a predefined client-side identity list; the
 * component itself owns neither the list nor the randomness.
 */
export const DEFAULT_AGENT_LUCKY_LABEL = "Happy, I’m feeling lucky";

export type DefaultAgentModalProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
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
    /** A whole-form failure (e.g. a server conflict) shown above the actions. */
    formError?: string;
    /** True while the create request is in flight: fields and buttons lock. */
    submitting?: boolean;
    /** Disables the primary action while the form is not yet submittable. */
    submitDisabled?: boolean;
    title?: string;
    description?: string;
    nameLabel?: string;
    usernameLabel?: string;
    namePlaceholder?: string;
    usernamePlaceholder?: string;
    usernameHint?: string;
    submitLabel?: string;
    submittingLabel?: string;
};

/**
 * C-064 DefaultAgentModal — the required setup surface that names the one
 * built-in default agent. It composes {@link ModalOverlay} without an
 * `onDismiss` and {@link Modal} without an `onClose`, so it cannot be closed by
 * a backdrop click, the Escape key, or a header control: onboarding may only
 * advance once creation succeeds. The proposed identity, validation errors,
 * and busy state are all supplied by the host; the component owns no product
 * state and no preset list. The chosen name is a plain product decision, so the
 * card never assumes it is called "Happy".
 */
export function DefaultAgentModal(props: DefaultAgentModalProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
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
        "submitDisabled",
        "title",
        "description",
        "nameLabel",
        "usernameLabel",
        "namePlaceholder",
        "usernamePlaceholder",
        "usernameHint",
        "submitLabel",
        "submittingLabel",
    ]);
    const submitting = () => local.submitting === true;
    const formId = `${useId()}-default-agent`;
    const submitLabel = () =>
        submitting()
            ? (local.submittingLabel ?? "Creating agent…")
            : (local.submitLabel ?? "Create agent");
    return (
        <ModalOverlay
            className={local.className}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <Modal
                className="happy2-default-agent-modal"
                icon="agents"
                size="medium"
                title={local.title ?? "Name your agent"}
                footer={
                    <Button
                        data-testid="default-agent-submit"
                        disabled={submitting() || local.submitDisabled === true}
                        form={formId}
                        type="submit"
                        variant="primary"
                    >
                        {submitLabel()}
                    </Button>
                }
            >
                <form
                    className="happy2-default-agent"
                    data-happy2-ui="default-agent-form"
                    id={formId}
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (submitting() || local.submitDisabled === true) return;
                        local.onSubmit();
                    }}
                >
                    <p
                        className="happy2-default-agent__description"
                        data-happy2-ui="default-agent-description"
                    >
                        {local.description ??
                            "This agent is the built-in identity that runs your workspace and posts every automated update. Pick a name and handle you’ll recognize."}
                    </p>
                    <TextField
                        autoComplete="off"
                        data-testid="default-agent-name"
                        disabled={submitting()}
                        error={local.nameError}
                        fullWidth
                        label={local.nameLabel ?? "Display name"}
                        onValueChange={local.onNameChange}
                        placeholder={local.namePlaceholder ?? "Happy"}
                        required
                        value={local.name}
                    />
                    <TextField
                        autoComplete="off"
                        data-testid="default-agent-username"
                        disabled={submitting()}
                        error={local.usernameError}
                        fullWidth
                        hint={
                            local.usernameHint ??
                            "3–32 characters: lowercase letters, digits, underscores, or hyphens."
                        }
                        label={local.usernameLabel ?? "Username"}
                        leadingIcon="at"
                        onValueChange={local.onUsernameChange}
                        placeholder={local.usernamePlaceholder ?? "happy"}
                        required
                        value={local.username}
                    />
                    <div
                        className="happy2-default-agent__preset"
                        data-happy2-ui="default-agent-preset"
                    >
                        <Button
                            data-testid="default-agent-lucky"
                            disabled={submitting()}
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
                            className="happy2-default-agent__error"
                            data-happy2-ui="default-agent-error"
                            role="alert"
                        >
                            {local.formError}
                        </p>
                    ) : null}
                </form>
            </Modal>
        </ModalOverlay>
    );
}
