/** Allows only the packaged renderer document, or the configured development origin. */
export function rendererNavigationAllowed(
    candidateValue: string,
    rendererValue: string,
    development: boolean,
): boolean {
    try {
        const candidate = new URL(candidateValue);
        const renderer = new URL(rendererValue);
        if (development) return candidate.origin === renderer.origin;
        return (
            candidate.protocol === "file:" &&
            candidate.host === renderer.host &&
            candidate.pathname === renderer.pathname &&
            candidate.search === renderer.search
        );
    } catch {
        return false;
    }
}
