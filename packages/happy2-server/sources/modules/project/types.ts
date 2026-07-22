export interface ProjectSummary {
    id: string;
    name: string;
    description?: string;
    isDefault: boolean;
    createdByUserId?: string;
    syncSequence: string;
    createdAt: string;
    updatedAt: string;
}
