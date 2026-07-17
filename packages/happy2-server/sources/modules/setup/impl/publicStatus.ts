import { type PublicServerSetupStatus, type RegistrationAvailability } from "../types.js";

import { type ServerStepRecord } from "./serverStepRecord.js";
export function publicStatus(snapshot: {
    schemaVersion: number;
    bootstrapAccountId: string | null;
    registrationEnabled: number | null;
    steps: ServerStepRecord;
}): PublicServerSetupStatus {
    const bootstrapComplete = snapshot.steps.bootstrap_administrator.state === "complete";
    const complete = snapshot.steps.server_setup_complete.state === "complete";
    const registration: RegistrationAvailability = complete
        ? snapshot.registrationEnabled === 1
            ? "open"
            : "closed"
        : snapshot.bootstrapAccountId
          ? "closed"
          : "bootstrap";
    return {
        schemaVersion: snapshot.schemaVersion,
        phase: complete
            ? "complete"
            : bootstrapComplete
              ? "configuration_required"
              : "bootstrap_required",
        registration,
    };
}
