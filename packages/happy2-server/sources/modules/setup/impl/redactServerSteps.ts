import { SERVER_SETUP_STEPS } from "../types.js";
import { type ServerStepRecord } from "./serverStepRecord.js";
export function redactServerSteps(
    steps: ServerStepRecord,
    includeDetails: boolean,
): ServerStepRecord {
    const result = {} as ServerStepRecord;
    for (const step of SERVER_SETUP_STEPS) {
        const status = steps[step];
        result[step] = includeDetails
            ? status
            : {
                  state: status.state,
                  updatedAt: status.updatedAt,
                  ...(status.completedAt
                      ? {
                            completedAt: status.completedAt,
                        }
                      : {}),
              };
    }
    return result;
}
