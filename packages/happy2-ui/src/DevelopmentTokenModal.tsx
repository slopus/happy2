import type { DevelopmentTokenCredential } from "happy2-state";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { SecretReveal } from "./SecretReveal";

export interface DevelopmentTokenModalProps {
    credential: DevelopmentTokenCredential;
    copied?: boolean;
    copyError?: string;
    onClose: () => void;
    onCopy: () => void;
    onToggleReveal: () => void;
    revealed?: boolean;
}

/**
 * C-071 DevelopmentTokenModal — the non-accidentally-dismissible, one-time handoff for a
 * session-bound development bearer. All secret visibility and clipboard state remain controlled
 * by the host so closing the modal can erase the credential from component memory immediately.
 */
export function DevelopmentTokenModal(props: DevelopmentTokenModalProps) {
    return (
        <ModalOverlay
            className="happy2-development-token-modal"
            data-testid="development-token-modal"
        >
            <Modal
                footer={
                    <Button onClick={props.onClose} size="small" type="button">
                        Done
                    </Button>
                }
                icon="terminal"
                onClose={props.onClose}
                size="medium"
                title="Development token created"
            >
                <div
                    className="happy2-development-token-modal__content"
                    data-happy2-ui="development-token-modal-content"
                >
                    <p
                        className="happy2-development-token-modal__description"
                        data-happy2-ui="development-token-modal-description"
                    >
                        Use this bearer token only in local development clients you control. It
                        carries your current access and remains valid until this server invalidates
                        it or the expiry shown below is reached.
                    </p>
                    <SecretReveal
                        copied={props.copied}
                        label="Development bearer token"
                        meta={`Expires ${developmentTokenExpiryFormat(props.credential.expiresAt)}`}
                        onCopy={props.onCopy}
                        onToggleReveal={props.onToggleReveal}
                        revealed={props.revealed}
                        secret={props.credential.token}
                        warning="Copy this token now. It will not be shown again after you close this window."
                    />
                    {props.copyError ? (
                        <Banner tone="danger" title="Token was not copied">
                            {props.copyError}
                        </Banner>
                    ) : null}
                </div>
            </Modal>
        </ModalOverlay>
    );
}

function developmentTokenExpiryFormat(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
    }).format(date)} UTC`;
}
