import { Badge } from "../../src/Badge";
import { Box } from "../../src/Box";
import { Button } from "../../src/Button";
import { FormRow } from "../../src/FormRow";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export function FormRowPage() {
    return (
        <ComponentPage
            number="C-029"
            summary="Settings row: label + optional muted description on the left, a trailing control slot, inline or stacked, with a hairline divider so rows tile into a list."
            title="Form row"
        >
            <div class="specimen-grid">
                <Specimen
                    detail="inline · label + description · 16px vertical padding"
                    label="Inline"
                    number="F-01"
                    stage="surface"
                >
                    <div style={{ display: "grid", width: "440px", padding: "24px", gap: "8px" }}>
                        <DimensionRule label="width 440 · control right-aligned" />
                        <FormRow
                            control={
                                <Button size="small" variant="secondary">
                                    Change
                                </Button>
                            }
                            description="Applies across every workspace on this device"
                            htmlFor="theme"
                            label="Appearance"
                        />
                    </div>
                </Specimen>

                <Specimen
                    detail="inline · label only · no description"
                    label="Label only"
                    number="F-02"
                    stage="surface"
                >
                    <div style={{ display: "grid", width: "440px", padding: "24px" }}>
                        <FormRow
                            control={
                                <Button
                                    aria-label="Edit display name"
                                    icon="edit"
                                    iconOnly
                                    size="small"
                                    variant="ghost"
                                />
                            }
                            label="Display name"
                        />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="stacked · control drops below the text at 12px gap"
                    label="Stacked"
                    number="F-03"
                    stage="surface"
                >
                    <div style={{ display: "grid", width: "440px", padding: "24px", gap: "8px" }}>
                        <DimensionRule label="stacked · control left-aligned below" />
                        <FormRow
                            align="start"
                            control={
                                <Button size="medium" variant="secondary" width={220}>
                                    Upload a new avatar
                                </Button>
                            }
                            description="PNG or JPG, at least 256×256 pixels"
                            label="Profile photo"
                            layout="stacked"
                        />
                    </div>
                </Specimen>

                <Specimen
                    detail="align start vs center against a two-line text block"
                    label="Vertical align"
                    number="F-04"
                    stage="surface"
                >
                    <div style={{ display: "grid", width: "440px", padding: "24px", gap: "16px" }}>
                        <FormRow
                            align="center"
                            control={<Badge label="PRO" variant="accent" />}
                            description="align=center keeps the badge on the middle line"
                            label="Plan"
                        />
                        <FormRow
                            align="start"
                            control={<Badge label="ADMIN" variant="success" />}
                            description="align=start pins the badge to the first line"
                            label="Role"
                        />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="rows tile into a settings list — one hairline between each"
                    label="Settings list"
                    number="F-05"
                    stage="surface"
                >
                    <div style={{ display: "grid", width: "480px", padding: "8px 24px 24px" }}>
                        <FormRow
                            control={
                                <Button size="small" variant="secondary">
                                    Manage
                                </Button>
                            }
                            description="Require a code from an authenticator app on sign in"
                            label="Two-factor authentication"
                        />
                        <FormRow
                            control={<Badge icon="check" label="ON" variant="success" />}
                            description="Show a preview of new messages in notifications"
                            label="Message previews"
                        />
                        <FormRow
                            control={
                                <Box
                                    height={24}
                                    style={{
                                        "border-radius": "var(--rg-radius-sm)",
                                        background: "var(--rg-brand-gradient)",
                                    }}
                                    width={24}
                                />
                            }
                            description="Accent color used across the app"
                            label="Theme color"
                        />
                        <FormRow
                            control={
                                <Button size="small" variant="danger">
                                    Sign out
                                </Button>
                            }
                            description="End this session on this device"
                            label="Sessions"
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
