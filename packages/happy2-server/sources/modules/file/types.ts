export type FileKind = "file" | "photo" | "video" | "gif";

export interface StoredFile {
    id: string;
    userId: string;
    uploadedByUserId: string;
    isPublic: boolean;
    storageName: string;
    contentType: string;
    size: number;
    width: number;
    height: number;
    thumbhash: string;
    kind: FileKind;
    originalName?: string;
    durationMs?: number;
}
