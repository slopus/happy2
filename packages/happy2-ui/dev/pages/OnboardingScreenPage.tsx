import type { JSX } from "solid-js";
import { Button } from "../../src/Button";
import { OnboardingScreen, type OnboardingStep } from "../../src/OnboardingScreen";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/*
 * Deterministic, network-free background fill: a static inline-SVG data URI
 * stands in for the shared onboarding image so the has-image path renders
 * without a network asset. The minimal specimen omits `backgroundUrl` to show
 * the window-backdrop fallback.
 */
const backgroundDataUri =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'>` +
            `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
            `<stop offset='0' stop-color='%236d28d9'/><stop offset='1' stop-color='%23f472b6'/>` +
            `</linearGradient></defs>` +
            `<rect width='96' height='96' fill='%23131217'/>` +
            `<circle cx='26' cy='70' r='46' fill='url(%23g)' opacity='0.85'/>` +
            `<circle cx='78' cy='22' r='20' fill='%2338bdf8' opacity='0.45'/></svg>`,
    );

const serverSteps: readonly OnboardingStep[] = [
    { label: "Account", state: "complete" },
    { label: "Server", state: "current" },
    { label: "Finish", state: "upcoming" },
];

function Field(props: { hint: string; label: string; value: string }): JSX.Element {
    return (
        <label style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
            <span
                style={{
                    color: "var(--happy2-text-secondary)",
                    "font-size": "13px",
                    "font-weight": 600,
                }}
            >
                {props.label}
            </span>
            <span
                style={{
                    "align-items": "center",
                    background: "var(--happy2-bg-inset)",
                    border: "1px solid var(--happy2-border-strong)",
                    "border-radius": "var(--happy2-radius-md)",
                    color: "var(--happy2-text)",
                    display: "flex",
                    "font-size": "14px",
                    height: "40px",
                    padding: "0 12px",
                }}
            >
                {props.value}
            </span>
            <span style={{ color: "var(--happy2-text-muted)", "font-size": "12px" }}>
                {props.hint}
            </span>
        </label>
    );
}

function window1024(children: JSX.Element) {
    return (
        <div style={{ display: "flex", "flex-direction": "column", gap: "8px", width: "1024px" }}>
            <div style={{ height: "704px", width: "1024px" }}>{children}</div>
            <DimensionRule label="1024px × 704px — minimum window contract" />
        </div>
    );
}

export function OnboardingScreenPage() {
    return (
        <ComponentPage
            number="C-061"
            summary="Centered desktop onboarding card — a single card floats over the shared onboarding background and legibility scrim. Brand mast, horizontal step rail, content block, scrolling body slot, and footer. Relay dark theme."
            title="Onboarding screen"
        >
            <Specimen
                detail="steps rail · brand · kicker/title/copy · body rows · footer actions · background image"
                label="Configure server step"
                number="01"
                stage="chrome"
            >
                {window1024(
                    <OnboardingScreen
                        backgroundUrl={backgroundDataUri}
                        brand={{ name: "Relay" }}
                        copy="Point Relay at the workspace server that will run your agents and store threads."
                        footer={
                            <div style={{ display: "flex", gap: "12px" }}>
                                <Button size="large" variant="secondary">
                                    Back
                                </Button>
                                <Button size="large" variant="primary">
                                    Continue
                                </Button>
                            </div>
                        }
                        kicker="Step 2 of 3"
                        steps={serverSteps}
                        title="Connect your server"
                    >
                        <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
                            <Field
                                hint="The base URL of your Relay server."
                                label="Server URL"
                                value="https://relay.acme.studio"
                            />
                            <Field
                                hint="Used to authenticate this device."
                                label="Access token"
                                value="rl_live_9f3c…a21b"
                            />
                        </div>
                    </OnboardingScreen>,
                )}
            </Specimen>

            <Specimen
                detail='width="large" — 640px card with more body content'
                label="Large width variant"
                number="02"
                stage="chrome"
            >
                {window1024(
                    <OnboardingScreen
                        backgroundUrl={backgroundDataUri}
                        brand={{ name: "Relay" }}
                        copy="Choose the base image and defaults new agents inherit when they join this workspace."
                        footer={
                            <div style={{ display: "flex", gap: "12px" }}>
                                <Button size="large" variant="secondary">
                                    Back
                                </Button>
                                <Button size="large" variant="primary">
                                    Create workspace
                                </Button>
                            </div>
                        }
                        kicker="Step 3 of 3"
                        steps={[
                            { label: "Account", state: "complete" },
                            { label: "Server", state: "complete" },
                            { label: "Workspace", state: "current" },
                        ]}
                        title="Set up your workspace"
                        width="large"
                    >
                        <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
                            <Field
                                hint="Shown to teammates you invite."
                                label="Workspace name"
                                value="Acme Studio"
                            />
                            <Field
                                hint="Agents boot from this image."
                                label="Base image"
                                value="relay/base:2026.07"
                            />
                            <Field
                                hint="Applied to every new agent run."
                                label="Default model"
                                value="claude-opus-4-8"
                            />
                        </div>
                    </OnboardingScreen>,
                )}
            </Specimen>

            <Specimen
                detail='state="loading" — deterministic static ring + label replaces the body slot'
                label="Loading state"
                number="03"
                stage="chrome"
            >
                {window1024(
                    <OnboardingScreen
                        backgroundUrl={backgroundDataUri}
                        brand={{ name: "Relay" }}
                        copy="We are provisioning the base image and starting your first agent."
                        kicker="Almost there"
                        loadingLabel="Provisioning workspace…"
                        state="loading"
                        steps={[
                            { label: "Account", state: "complete" },
                            { label: "Server", state: "complete" },
                            { label: "Workspace", state: "current" },
                        ]}
                        title="Building your workspace"
                    >
                        <div>hidden while loading</div>
                    </OnboardingScreen>,
                )}
            </Specimen>

            <Specimen
                detail="minimal — no brand / steps / kicker / copy / footer; title + body only, background fallback"
                label="Minimal card"
                number="04"
                stage="chrome"
            >
                {window1024(
                    <OnboardingScreen title="Enter your invite code">
                        <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
                            <Field
                                hint="Sent to you by your workspace admin."
                                label="Invite code"
                                value="ACME-4821-QK"
                            />
                            <Button fullWidth size="large" variant="primary">
                                Continue
                            </Button>
                        </div>
                    </OnboardingScreen>,
                )}
            </Specimen>
        </ComponentPage>
    );
}
