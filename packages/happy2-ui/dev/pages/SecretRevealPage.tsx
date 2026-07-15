import { SecretReveal } from "../../src/SecretReveal";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const TOKEN = "happy2_demo_secret_0f2c1a7b4e51d";

export function SecretRevealPage() {
    return (
        <ComponentPage
            number="C-042"
            summary="One-time token/secret: a card with a label + mono meta, a reveal/copy action pair, a code-well mono token (dot mask when hidden, wrapping token when revealed), and a warning banner. Composes Button and Banner."
            title="Secret reveal"
        >
            <div class="specimen-grid">
                <Specimen
                    detail="masked · 24-dot mask · warning banner · card 16 pad · well radius 6"
                    label="One-time token (hidden)"
                    number="01"
                    stage="surface"
                >
                    <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                        <div style={{ width: "380px" }}>
                            <SecretReveal
                                label="Personal access token"
                                meta="tok_… · expires in 24h"
                                secret={TOKEN}
                                warning="Copy this now — it won't be shown again."
                            />
                        </div>
                        <DimensionRule label="card 380 · well 346 · row rhythm 12" />
                    </div>
                </Specimen>

                <Specimen
                    detail="revealed · full mono token wraps in the well · text at full strength"
                    label="Revealed"
                    number="02"
                    stage="surface"
                >
                    <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                        <div style={{ width: "380px" }}>
                            <SecretReveal
                                label="Personal access token"
                                meta="tok_… · expires in 24h"
                                revealed
                                secret={TOKEN}
                                warning="Copy this now — it won't be shown again."
                            />
                        </div>
                        <DimensionRule label="well width stable at 346 across masked/revealed" />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="copied feedback · copy Button switches to success + check glyph"
                    label="Copied state"
                    number="03"
                    stage="surface"
                >
                    <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                        <div style={{ width: "380px" }}>
                            <SecretReveal
                                copied
                                label="Webhook signing secret"
                                meta="whsec_…"
                                revealed
                                secret="whsec_3f9ac2b7e1d64850bb9c72af10e5"
                            />
                        </div>
                        <DimensionRule label="copy → success · 28px control row" />
                    </div>
                </Specimen>

                <Specimen
                    detail="no label / meta / warning — bare reveal+copy header over the well"
                    label="Minimal"
                    number="04"
                    stage="surface"
                >
                    <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                        <div style={{ width: "300px" }}>
                            <SecretReveal secret="sk_test_51H8x2eLkd0" />
                        </div>
                        <DimensionRule label="header collapses to the 28px action row" />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
