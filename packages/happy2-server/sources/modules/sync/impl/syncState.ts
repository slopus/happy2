import { number } from "../../chat/number.js";
import { stateAt } from "./stateAt.js";
import { type SyncState } from "../../chat/types.js";
import { text } from "../../chat/text.js";
export function syncState(row: Record<string, unknown>): SyncState {
    return stateAt(text(row.generation), number(row.sequence));
}
