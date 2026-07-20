import { Banner } from "./Banner";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { SecretReveal } from "./SecretReveal";

export type UserPasswordResetStatus = "ready" | "submitting" | "succeeded" | "failed";

export interface UserPasswordResetDialogProps {
    displayName: string;
    username: string;
    password: string;
    status: UserPasswordResetStatus;
    revokedSessionCount?: number;
    error?: string;
    copied?: boolean;
    copyError?: string;
    revealed?: boolean;
    onClose: () => void;
    onCopy: () => void;
    onRegenerate: () => void;
    onSubmit: () => void;
    onToggleReveal: () => void;
}

/**
 * C-079 UserPasswordResetDialog — a controlled handoff for one client-generated user password,
 * including preflight, submission, failure, and durable-success states without owning product data.
 */
export function UserPasswordResetDialog(props: UserPasswordResetDialogProps) {
    const completed = props.status === "succeeded";
    const submitting = props.status === "submitting";
    const userLabel = props.displayName || `@${props.username}`;
    return (
        <ModalOverlay className="happy2-user-password-reset-dialog" data-testid="password-reset">
            <Modal
                footer={
                    completed ? (
                        <Button onClick={props.onClose} size="small">
                            Done
                        </Button>
                    ) : (
                        <>
                            <Button
                                disabled={submitting}
                                onClick={props.onClose}
                                size="small"
                                variant="ghost"
                            >
                                Cancel
                            </Button>
                            <Button
                                disabled={submitting}
                                icon="spark"
                                onClick={props.onRegenerate}
                                size="small"
                                variant="secondary"
                            >
                                Generate another
                            </Button>
                            <Button
                                disabled={submitting}
                                icon="shield"
                                onClick={props.onSubmit}
                                size="small"
                            >
                                {submitting ? "Resetting…" : "Reset password"}
                            </Button>
                        </>
                    )
                }
                icon="shield"
                onClose={submitting ? undefined : props.onClose}
                size="medium"
                title="Reset user password"
            >
                <div
                    className="happy2-user-password-reset-dialog__content"
                    data-happy2-ui="user-password-reset-dialog-content"
                >
                    <p
                        className="happy2-user-password-reset-dialog__description"
                        data-happy2-ui="user-password-reset-dialog-description"
                    >
                        A new password was generated on this device for <strong>{userLabel}</strong>
                        {props.displayName ? (
                            <span className="happy2-user-password-reset-dialog__username">
                                {" "}
                                @{props.username}
                            </span>
                        ) : null}
                        . Copy it before closing this window.
                    </p>
                    <SecretReveal
                        copied={props.copied}
                        label="Generated password"
                        meta={`${props.password.length} characters`}
                        onCopy={props.onCopy}
                        onToggleReveal={props.onToggleReveal}
                        revealed={props.revealed}
                        secret={props.password}
                        warning={
                            completed
                                ? "This password will not be shown again after you close this window."
                                : "Resetting signs the user out of every existing session. Share the password through a trusted channel."
                        }
                    />
                    {completed ? (
                        <Banner icon="check-circle" tone="success" title="Password reset">
                            {sessionCopy(props.revokedSessionCount ?? 0)} The generated password is
                            ready to share.
                        </Banner>
                    ) : props.error ? (
                        <Banner icon="shield" tone="danger" title="Password was not reset">
                            {props.error}
                        </Banner>
                    ) : null}
                    {props.copyError ? (
                        <Banner tone="danger" title="Password was not copied">
                            {props.copyError}
                        </Banner>
                    ) : null}
                </div>
            </Modal>
        </ModalOverlay>
    );
}

function sessionCopy(count: number): string {
    if (count === 0) return "No active sessions needed to be revoked.";
    if (count === 1) return "1 active session was revoked.";
    return `${count} active sessions were revoked.`;
}
