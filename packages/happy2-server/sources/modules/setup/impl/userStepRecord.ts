import {
    type SetupStepStatus,
    type UserOnboardingStep,
    type UserOnboardingStepState,
} from "../types.js";

export type UserStepRecord = Record<UserOnboardingStep, SetupStepStatus<UserOnboardingStepState>>;
