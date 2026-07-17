import { type DataExportJob } from "../../operations/types.js";
export interface ClaimedDataExport extends DataExportJob {
    claimStartedAt: string;
}
