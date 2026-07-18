import type { JSX } from "solid-js";
import { SetupOptionCard } from "../../src/SetupOptionCard";
import { ComponentPage, Specimen } from "../kit";

const column: JSX.CSSProperties = {
    display: "flex",
    "flex-direction": "column",
    gap: "12px",
    width: "420px",
    "max-width": "100%",
};

export function SetupOptionCardPage() {
    return (
        <ComponentPage
            number="C-062"
            summary="Full-width selectable option used during onboarding to choose a sandbox provider, a base image, and the registration policy. The whole card is a real button; selection, health, and pending state are all props."
            title="Setup option card"
        >
            <Specimen
                detail="Whole card is a button · 16px pad · 36px icon chip · trailing check when selected"
                label="Sandbox provider — health"
                number="01"
                stage="app"
            >
                <div style={column}>
                    <SetupOptionCard
                        icon="terminal"
                        meta="Docker 25.0.3"
                        recommended
                        selected
                        status={{ label: "HEALTHY", variant: "success", icon: "check-circle" }}
                        title="Docker"
                    />
                    <SetupOptionCard
                        description="Runs each agent in an isolated local container."
                        disabled
                        hint="Start the Docker daemon, then reopen this step."
                        hintTone="danger"
                        icon="shield"
                        status={{ label: "UNAVAILABLE", variant: "danger" }}
                        title="Docker"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Leading image glyph · secondary meta line · in-flight ring"
                label="Base image"
                number="02"
                stage="app"
            >
                <div style={column}>
                    <SetupOptionCard
                        description="Ubuntu 24.04 with the standard agent toolchain preinstalled."
                        icon="image"
                        meta="Download and build"
                        status={{ label: "READY", variant: "info" }}
                        title="Standard base image"
                    />
                    <SetupOptionCard
                        description="Building the image from your Dockerfile."
                        icon="image"
                        meta="Download and build"
                        pending
                        title="Custom base image"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Registration policy pair — one selectable choice each"
                label="Registration policy"
                number="03"
                stage="app"
            >
                <div style={column}>
                    <SetupOptionCard
                        description="Anyone with the workspace link can create an account."
                        icon="users"
                        selected
                        title="Open"
                    />
                    <SetupOptionCard
                        description="New accounts require an admin invite."
                        icon="shield"
                        title="Closed"
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
