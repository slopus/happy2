import type { ReactNode } from "react";
import { UserPasswordResetDialog } from "../../src/UserPasswordResetDialog";
import { ComponentPage, Specimen } from "../kit";

function WindowFrame(props: { children: ReactNode }) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "8px",
                height: "600px",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "760px",
            }}
        >
            {props.children}
        </div>
    );
}

const noop = () => undefined;
const common = {
    displayName: "Ada Lovelace",
    username: "ada",
    password: "R8!mQ2#vT7-pL4@xK9_w",
    onClose: noop,
    onCopy: noop,
    onRegenerate: noop,
    onSubmit: noop,
    onToggleReveal: noop,
} as const;

export function UserPasswordResetDialogPage() {
    return (
        <ComponentPage
            number="C-079"
            summary="Client-generated password handoff for administrators. The dialog names the target, exposes copy and regeneration before submission, warns about session cutoff, and preserves the credential through success or failure."
            title="User password reset dialog"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="generated locally · revealed · ready to submit"
                    label="Preflight"
                    number="T-01"
                    stage="app"
                >
                    <WindowFrame>
                        <UserPasswordResetDialog {...common} revealed status="ready" />
                    </WindowFrame>
                </Specimen>
                <Specimen
                    detail="mutation in flight · handoff controls locked"
                    label="Submitting"
                    number="T-02"
                    stage="app"
                >
                    <WindowFrame>
                        <UserPasswordResetDialog {...common} revealed status="submitting" />
                    </WindowFrame>
                </Specimen>
            </div>
            <div className="specimen-grid">
                <Specimen
                    detail="successful mutation · two sessions revoked · copied"
                    label="Completed"
                    number="T-03"
                    stage="app"
                >
                    <WindowFrame>
                        <UserPasswordResetDialog
                            {...common}
                            copied
                            revealed
                            revokedSessionCount={2}
                            status="succeeded"
                        />
                    </WindowFrame>
                </Specimen>
                <Specimen
                    detail="server refusal · password retained for retry"
                    label="Failure"
                    number="T-04"
                    stage="app"
                >
                    <WindowFrame>
                        <UserPasswordResetDialog
                            {...common}
                            error="Only the owner can reset the owner's password"
                            revealed
                            status="failed"
                        />
                    </WindowFrame>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
