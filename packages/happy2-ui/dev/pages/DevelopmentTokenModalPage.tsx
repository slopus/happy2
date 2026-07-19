import type { ReactNode } from "react";
import { DevelopmentTokenModal } from "../../src/DevelopmentTokenModal";
import { ComponentPage, Specimen } from "../kit";

function WindowFrame(props: { children: ReactNode }) {
    return (
        <div
            style={{
                background: "var(--happy2-bg-app)",
                border: "1px solid var(--happy2-border-strong)",
                borderRadius: "8px",
                height: "520px",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "720px",
            }}
        >
            {props.children}
        </div>
    );
}

const credential = {
    token: "happy2_dev_k7yQ5xNFtG2aVe9zR4mLp8Bw",
    sessionId: "session_blueprint",
    expiresAt: "2026-07-20T01:00:00.000Z",
};
const noop = () => undefined;

export function DevelopmentTokenModalPage() {
    return (
        <ComponentPage
            number="C-071"
            summary="One-time handoff for a development bearer bound to a server session. The explicit close action prevents accidental secret loss; visibility, copy confirmation, and clipboard failure remain controlled states."
            title="Development token modal"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="token revealed · one-time warning · deterministic UTC expiry"
                    label="New credential"
                    number="T-01"
                    stage="app"
                >
                    <WindowFrame>
                        <DevelopmentTokenModal
                            credential={credential}
                            onClose={noop}
                            onCopy={noop}
                            onToggleReveal={noop}
                            revealed
                        />
                    </WindowFrame>
                </Specimen>
            </div>
            <div className="specimen-grid">
                <Specimen
                    detail="masked token · copied confirmation · clipboard error"
                    label="Copy feedback"
                    number="T-02"
                    stage="app"
                >
                    <WindowFrame>
                        <DevelopmentTokenModal
                            copied
                            copyError="Clipboard access is unavailable."
                            credential={credential}
                            onClose={noop}
                            onCopy={noop}
                            onToggleReveal={noop}
                        />
                    </WindowFrame>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
