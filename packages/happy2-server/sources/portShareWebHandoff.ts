export const portShareWebHandoffRoute = "/preview-link/:portShareId";

export function portShareWebHandoffPath(portShareId: string): string {
    return `/preview-link/${encodeURIComponent(portShareId)}`;
}
