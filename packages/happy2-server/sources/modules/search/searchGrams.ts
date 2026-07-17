export function searchGrams(value: string): Map<string, number> {
    const points = [...value];
    const width = Math.min(3, points.length);
    const grams = new Map<string, number>();
    for (let index = 0; index <= points.length - width; index += 1) {
        const gram = points.slice(index, index + width).join("");
        grams.set(gram, (grams.get(gram) ?? 0) + 1);
    }
    return grams;
}
