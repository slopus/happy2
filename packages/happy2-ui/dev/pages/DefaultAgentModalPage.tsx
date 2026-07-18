import { type ReactNode } from "react";
import { DefaultAgentModal } from "../../src/DefaultAgentModal";
import { ComponentPage, Specimen } from "../kit";
/*
 * The modal sits on ModalOverlay, which is `position: fixed`; a transformed
 * wrapper establishes a containing block so each specimen renders the required
 * modal inside a bounded, screenshot-safe window frame.
 */
function WindowFrame(props: { children: ReactNode; width: number; height: number }) {
    return (
        <div
            style={{
                position: "relative",
                width: `${props.width}px`,
                height: `${props.height}px`,
                overflow: "hidden",
                transform: "translateZ(0)",
                borderRadius: "8px",
                border: "1px solid var(--happy2-border-strong)",
                background: "var(--happy2-bg-app)",
            }}
        >
            {props.children}
        </div>
    );
}
const noop = () => {};
export function DefaultAgentModalPage() {
    return (
        <ComponentPage
            number="C-064"
            summary="Required default-agent naming modal — non-dismissible (no backdrop, Escape, or close), editable name/username, a 'Happy, I’m feeling lucky' preset, and validation / conflict / submitting states. The chosen name is a product decision, so nothing is hard-coded to 'Happy'."
            title="Default agent modal"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="proposed Happy / happy · submit enabled"
                    label="Proposed identity"
                    number="D-01"
                    stage="app"
                >
                    <WindowFrame height={520} width={720}>
                        <DefaultAgentModal
                            name="Happy"
                            onLucky={noop}
                            onNameChange={noop}
                            onSubmit={noop}
                            onUsernameChange={noop}
                            username="happy"
                        />
                    </WindowFrame>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="custom Mochi / mochi_main — the card never assumes the name is Happy"
                    label="Custom identity"
                    number="D-02"
                    stage="app"
                >
                    <WindowFrame height={520} width={720}>
                        <DefaultAgentModal
                            name="Mochi"
                            onLucky={noop}
                            onNameChange={noop}
                            onSubmit={noop}
                            onUsernameChange={noop}
                            username="mochi_main"
                        />
                    </WindowFrame>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="per-field validation errors · submit disabled"
                    label="Invalid"
                    number="D-03"
                    stage="app"
                >
                    <WindowFrame height={560} width={720}>
                        <DefaultAgentModal
                            name=""
                            nameError="Enter a display name."
                            onLucky={noop}
                            onNameChange={noop}
                            onSubmit={noop}
                            onUsernameChange={noop}
                            submitDisabled
                            username="No"
                            usernameError="Use 3–32 lowercase letters, digits, underscores, or hyphens."
                        />
                    </WindowFrame>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="whole-form server conflict in the danger tone"
                    label="Conflict"
                    number="D-04"
                    stage="app"
                >
                    <WindowFrame height={540} width={720}>
                        <DefaultAgentModal
                            formError="The default agent username is already taken."
                            name="Happy"
                            onLucky={noop}
                            onNameChange={noop}
                            onSubmit={noop}
                            onUsernameChange={noop}
                            username="happy"
                        />
                    </WindowFrame>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="request in flight — fields and both actions locked, submit reads 'Creating agent…'"
                    label="Submitting"
                    number="D-05"
                    stage="app"
                >
                    <WindowFrame height={520} width={720}>
                        <DefaultAgentModal
                            name="Happy"
                            onLucky={noop}
                            onNameChange={noop}
                            onSubmit={noop}
                            onUsernameChange={noop}
                            submitting
                            username="happy"
                        />
                    </WindowFrame>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
