import { type SyncState } from "../../chat/types.js";
export function stateAt(generation: string, sequence: number): SyncState {
    return {
        protocolVersion: 1,
        generation,
        sequence: String(sequence),
    };
}
