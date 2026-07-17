import { type ServerSetupStep, type ServerSetupStepState, type SetupStepStatus } from "../types.js";

export type ServerStepRecord = Record<ServerSetupStep, SetupStepStatus<ServerSetupStepState>>;
