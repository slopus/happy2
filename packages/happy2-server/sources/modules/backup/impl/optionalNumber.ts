import { number } from "../../operations/number.js";
export function optionalNumber(value: unknown): number | undefined {
    return value === null || value === undefined ? undefined : number(value);
}
