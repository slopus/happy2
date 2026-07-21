import { Button } from "../../src/Button";
import { DefaultAgentForm, type DefaultAgentFormProps } from "../../src/DefaultAgentForm";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const noop = () => {};

function AgentFormFixture(
    props: Omit<
        DefaultAgentFormProps,
        "formId" | "onLucky" | "onNameChange" | "onSubmit" | "onUsernameChange"
    > & {
        submitDisabled?: boolean;
    },
) {
    const formId = `blueprint-default-agent-${props["data-testid"] ?? "form"}`;
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "20px",
                width: "480px",
                boxSizing: "border-box",
                padding: "24px",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "var(--happy2-radius-shell)",
                background: "var(--surface)",
            }}
        >
            <DefaultAgentForm
                {...props}
                formId={formId}
                onLucky={noop}
                onNameChange={noop}
                onSubmit={noop}
                onUsernameChange={noop}
            />
            <Button
                disabled={props.submitting || props.submitDisabled}
                form={formId}
                fullWidth
                type="submit"
            >
                {props.submitting ? "Creating agent…" : "Create agent"}
            </Button>
            <DimensionRule label="480px standalone form host · linked external submit" />
        </div>
    );
}

export function DefaultAgentFormPage() {
    return (
        <ComponentPage
            number="C-064"
            summary="Modality-neutral controlled default-agent form — display name, username hint, exact feeling-lucky preset, field and server errors, and host-linked submit states. The form owns no modal, card, or product state."
            title="Default agent form"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="proposed Happy / happy · external submit linked by stable form id"
                    label="Proposed identity"
                    number="D-01"
                    stage="app"
                >
                    <AgentFormFixture data-testid="proposed" name="Happy" username="happy" />
                </Specimen>
                <Specimen
                    detail="custom Mochi / mochi_main — no name is hard-coded by the form"
                    label="Custom identity"
                    number="D-02"
                    stage="app"
                >
                    <AgentFormFixture data-testid="custom" name="Mochi" username="mochi_main" />
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="per-field validation errors · linked submit disabled"
                    label="Invalid"
                    number="D-03"
                    stage="app"
                >
                    <AgentFormFixture
                        data-testid="invalid"
                        name=""
                        nameError="Enter a display name."
                        submitDisabled
                        username="No"
                        usernameError="Use 3–32 lowercase letters, digits, underscores, or hyphens."
                    />
                </Specimen>
                <Specimen
                    detail="whole-form server conflict keeps the existing danger-text alert"
                    label="Conflict"
                    number="D-04"
                    stage="app"
                >
                    <AgentFormFixture
                        data-testid="conflict"
                        formError="The default agent username is already taken."
                        name="Happy"
                        username="happy"
                    />
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="request in flight — fields, preset, and linked submit locked"
                    label="Submitting"
                    number="D-05"
                    stage="app"
                >
                    <AgentFormFixture
                        data-testid="submitting"
                        name="Happy"
                        submitting
                        username="happy"
                    />
                </Specimen>
            </div>
        </ComponentPage>
    );
}
