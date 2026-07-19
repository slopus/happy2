import { type ReactNode } from "react";
import { Banner } from "../../src/Banner";
import { Button } from "../../src/Button";
import { DefaultAgentForm } from "../../src/DefaultAgentForm";
import { OnboardingScreen, type OnboardingStep } from "../../src/OnboardingScreen";
import { SetupOptionCard } from "../../src/SetupOptionCard";
import { TextField } from "../../src/TextField";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/* Deterministic, network-free background fill for the blueprint image path. */
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

const stepLabels = ["Sandbox", "Base image", "Build", "Agent", "Registration"] as const;
function wizardSteps(current: number): readonly OnboardingStep[] {
    return stepLabels.map((label, index) => ({
        label,
        state: index < current ? "complete" : index === current ? "current" : "upcoming",
    }));
}

function WindowFrame(props: { children: ReactNode; height?: number; width?: number }) {
    const width = props.width ?? 1024;
    const height = props.height ?? 704;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: `${width}px` }}>
            <div style={{ height: `${height}px`, width: `${width}px` }}>{props.children}</div>
            <DimensionRule label={`${width}px × ${height}px desktop window`} />
        </div>
    );
}

const noop = () => {};

export function OnboardingScreenPage() {
    const agentFormId = "blueprint-onboarding-default-agent";
    return (
        <ComponentPage
            number="C-061"
            summary="Calm desktop onboarding frame — fixed 600px card above the 648px height threshold, 48px total vertical safe gutter below it, one full-bleed scrolling body, and an optional pinned footer aligned to the body’s 8px focus gutter."
            title="Onboarding screen"
        >
            <Specimen
                detail="five-step server wizard · width=large · footer and body share the same horizontal gutter"
                label="Five-step 640 wizard"
                number="01"
                stage="chrome"
            >
                <WindowFrame>
                    <OnboardingScreen
                        backgroundUrl={backgroundDataUri}
                        bodyKey="sandbox-provider"
                        brand={{ name: "Happy (2)" }}
                        copy="Agent code runs inside the selected sandbox provider, isolated from the Happy server process."
                        footer={
                            <Button fullWidth type="button">
                                Continue with Docker
                            </Button>
                        }
                        kicker="Server setup"
                        steps={wizardSteps(0)}
                        title="Choose a sandbox"
                        width="large"
                    >
                        <SetupOptionCard
                            description="Docker Engine is available and ready to run agents."
                            icon="terminal"
                            meta="Docker version 27.0.3, build gym"
                            recommended
                            selected
                            status={{ label: "HEALTHY", variant: "success", icon: "check-circle" }}
                            title="Docker"
                        />
                        <SetupOptionCard
                            description="Podman is not installed on this server."
                            disabled
                            icon="terminal"
                            title="Podman"
                        />
                    </OnboardingScreen>
                </WindowFrame>
            </Specimen>

            <Specimen
                detail="same 640×600 card rect for a short loading row and the resolved form body"
                label="Loading / form parity"
                number="02"
                stage="chrome"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <WindowFrame>
                        <OnboardingScreen
                            backgroundUrl={backgroundDataUri}
                            bodyKey="loading"
                            brand={{ name: "Happy (2)" }}
                            kicker="Server setup"
                            loadingLabel="Loading server setup…"
                            state="loading"
                            steps={wizardSteps(1)}
                            title="Preparing setup"
                            width="large"
                        >
                            <div>Hidden while loading</div>
                        </OnboardingScreen>
                    </WindowFrame>
                    <WindowFrame>
                        <OnboardingScreen
                            backgroundUrl={backgroundDataUri}
                            bodyKey="base-image"
                            brand={{ name: "Happy (2)" }}
                            copy="The base image is downloaded and built once, then becomes the default sandbox for every agent."
                            kicker="Server setup"
                            steps={wizardSteps(1)}
                            title="Pick a base image"
                            width="large"
                        >
                            <Banner icon="shield" tone="info">
                                Agent code runs inside the Docker sandbox (Docker version 27.0.3,
                                build gym).
                            </Banner>
                            <SetupOptionCard icon="image" title="Daycare Minimal" />
                        </OnboardingScreen>
                    </WindowFrame>
                </div>
            </Specimen>

            <Specimen
                detail="body content deliberately exceeds the fixed frame; the footer stays pinned while the body scrolls"
                label="Overflowing build choices"
                number="03"
                stage="chrome"
            >
                <WindowFrame>
                    <OnboardingScreen
                        backgroundUrl={backgroundDataUri}
                        bodyKey="base-image-overflow"
                        brand={{ name: "Happy (2)" }}
                        copy="Choose one image or provide a Dockerfile. Every option remains reachable inside the body scrollport."
                        footer={
                            <Button fullWidth type="button">
                                Build selected image
                            </Button>
                        }
                        kicker="Server setup"
                        steps={wizardSteps(1)}
                        title="Pick a base image"
                        width="large"
                    >
                        {[
                            "Daycare Minimal",
                            "Daycare Full",
                            "Node + browser tools",
                            "Rust workshop",
                            "Data science",
                        ].map((title) => (
                            <SetupOptionCard
                                key={title}
                                description="A prepared sandbox image with the Happy agent toolchain."
                                icon="image"
                                meta="Download and build"
                                title={title}
                            />
                        ))}
                        <TextField label="Custom image name" value="acme/workbench" />
                    </OnboardingScreen>
                </WindowFrame>
            </Specimen>

            <Specimen
                detail="agent form stays inside step 4; its full-width linked submit lives in the pinned screen footer"
                label="Default-agent form step"
                number="04"
                stage="chrome"
            >
                <WindowFrame>
                    <OnboardingScreen
                        backgroundUrl={backgroundDataUri}
                        bodyKey="default-agent"
                        brand={{ name: "Happy (2)" }}
                        copy="Create the built-in agent that runs your workspace before you finish setup."
                        footer={
                            <Button form={agentFormId} fullWidth type="submit">
                                Create agent
                            </Button>
                        }
                        kicker="Server setup"
                        steps={wizardSteps(3)}
                        title="Name your agent"
                        width="large"
                    >
                        <DefaultAgentForm
                            description="This agent is the built-in identity that runs your workspace. It will run inside the Docker sandbox (Docker version 27.0.3, build gym). Pick a name and handle you’ll recognize."
                            formId={agentFormId}
                            name="Happy"
                            onLucky={noop}
                            onNameChange={noop}
                            onSubmit={noop}
                            onUsernameChange={noop}
                            username="happy"
                        />
                    </OnboardingScreen>
                </WindowFrame>
            </Specimen>

            <Specimen
                detail="Electron minimum-height case · card resolves to 432px (100% − 48px) and the body remains scrollable"
                label="720 × 480 short window"
                number="05"
                stage="chrome"
            >
                <WindowFrame height={480} width={720}>
                    <OnboardingScreen
                        backgroundUrl={backgroundDataUri}
                        bodyKey="short-registration"
                        brand={{ name: "Happy (2)" }}
                        copy="Decide whether other people can create an account now."
                        footer={
                            <Button fullWidth type="button">
                                Keep registration closed
                            </Button>
                        }
                        kicker="Final step"
                        steps={wizardSteps(4)}
                        title="Open registration?"
                        width="large"
                    >
                        <Banner tone="info">
                            All five steps remain visible at the minimum window.
                        </Banner>
                        <SetupOptionCard
                            description="Anyone who reaches the server can create an account."
                            icon="users"
                            title="Open registration"
                        />
                        <SetupOptionCard
                            description="Only you can sign in until you change this in Admin."
                            icon="shield"
                            title="Keep registration closed"
                        />
                    </OnboardingScreen>
                </WindowFrame>
            </Specimen>
        </ComponentPage>
    );
}
