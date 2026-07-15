export type Dimension = number | string;

export function toCssDimension(value: Dimension | undefined) {
    return typeof value === "number" ? `${value}px` : value;
}
