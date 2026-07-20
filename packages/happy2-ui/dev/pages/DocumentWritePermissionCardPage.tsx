import { DocumentWritePermissionCard } from "../../src/DocumentWritePermissionCard";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

function log(message: string) {
    console.info(`[blueprint] DocumentWritePermissionCard: ${message}`);
}

export function DocumentWritePermissionCardPage() {
    return (
        <ComponentPage
            number="C-141"
            summary="Chat-scoped permission prompt for an agent-requested document write: target document, requesting agent, and Approve / Deny actions for any posting member. A busy decision disables actions; approved, denied, and failed are clearly terminal."
            title="DocumentWritePermissionCard"
        >
            <Specimen
                detail="card max 560px · amber pending hairline · edit chip · 40px document glyph · Approve/Deny footer"
                label="Pending write"
                number="01"
                stage="app"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <DocumentWritePermissionCard
                        documentTitle="Launch plan"
                        onApprove={() => log("approve")}
                        onDeny={() => log("deny")}
                        requestedBy="Research Agent"
                        status="pending"
                    />
                </div>
                <DimensionRule label="560px maximum card width" />
            </Specimen>

            <Specimen
                detail="a decision in flight disables both actions"
                label="Busy decision"
                number="02"
                stage="app"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <DocumentWritePermissionCard
                        busy
                        documentTitle="Launch plan"
                        requestedBy="Research Agent"
                        status="pending"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="mint banner and success state line"
                label="Approved"
                number="03"
                stage="app"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <DocumentWritePermissionCard
                        documentTitle="Launch plan"
                        requestedBy="Research Agent"
                        status="approved"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="danger banner with a neutral terminal line"
                label="Denied"
                number="04"
                stage="app"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <DocumentWritePermissionCard
                        documentTitle="Launch plan"
                        requestedBy="Research Agent"
                        status="denied"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="danger banner carries the bounded diagnostic"
                label="Failed"
                number="05"
                stage="app"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <DocumentWritePermissionCard
                        documentTitle="Launch plan"
                        error="The staged update no longer applies to the document."
                        requestedBy="Research Agent"
                        status="failed"
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
