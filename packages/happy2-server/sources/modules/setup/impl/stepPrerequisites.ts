import { type ServerSetupStep } from "../types.js";
export const STEP_PREREQUISITES: Readonly<Record<ServerSetupStep, readonly ServerSetupStep[]>> = {
    bootstrap_administrator: [],
    sandbox_provider_selected: ["bootstrap_administrator"],
    sandbox_provider_validated: ["sandbox_provider_selected"],
    base_image_selected: ["sandbox_provider_validated"],
    base_image_build_requested: ["base_image_selected"],
    base_image_ready: ["base_image_build_requested"],
    default_agent_created: ["base_image_ready"],
    registration_policy_selected: ["default_agent_created"],
    server_setup_complete: ["registration_policy_selected"],
};
