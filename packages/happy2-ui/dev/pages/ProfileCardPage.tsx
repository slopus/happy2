import { Button } from "../../src/Button";
import { ProfileCard } from "../../src/ProfileCard";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

function CardActions() {
    return (
        <>
            <Button aria-label="Message" icon="send" iconOnly size="small" variant="ghost" />
            <Button aria-label="More" icon="more" iconOnly size="small" variant="ghost" />
        </>
    );
}

export function ProfileCardPage() {
    return (
        <ComponentPage
            number="C-033"
            summary="Profile header: avatar + presence, name, @username, title, status pill, actions."
            title="Profile card"
        >
            <div className="specimen-grid specimen-grid--sizes">
                <Specimen
                    detail="lg avatar · 16px padding · 16px gap"
                    label="Full"
                    number="P-01"
                    stage="app"
                >
                    <div style={{ display: "grid", gap: "6px", width: "360px" }}>
                        <DimensionRule label="width 360 · avatar 44" />
                        <ProfileCard
                            actions={<CardActions />}
                            initials="AL"
                            name="Ada Lovelace"
                            presence="online"
                            size="full"
                            status={{ emoji: "🛠️", text: "Shipping the compiler" }}
                            title="Founding engineer · Analytical Engine"
                            tone="violet"
                            username="ada"
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="md avatar · 12px padding · 12px gap"
                    label="Compact"
                    number="P-02"
                    stage="app"
                >
                    <div style={{ display: "grid", gap: "6px", width: "320px" }}>
                        <DimensionRule label="width 320 · avatar 36" />
                        <ProfileCard
                            actions={<CardActions />}
                            initials="GH"
                            name="Grace Hopper"
                            presence="online"
                            size="compact"
                            status={{ emoji: "☕", text: "Debugging" }}
                            title="Rear Admiral"
                            tone="ocean"
                            username="grace"
                        />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="online dot · offline (no dot) · image avatar"
                    label="Presence and identity"
                    number="P-03"
                    stage="surface"
                >
                    <div style={{ display: "grid", gap: "16px", padding: "24px", width: "384px" }}>
                        <ProfileCard
                            initials="MB"
                            name="Mary Blair"
                            presence="online"
                            status={{ emoji: "🎨", text: "In the studio" }}
                            title="Art director"
                            tone="rose"
                            username="mary"
                        />
                        <ProfileCard
                            initials="KJ"
                            name="Katherine Johnson"
                            presence="offline"
                            title="Research mathematician"
                            tone="amber"
                            username="katherine"
                        />
                        <ProfileCard
                            imageUrl="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2244%22%20height%3D%2244%22%3E%3Crect%20width%3D%2244%22%20height%3D%2244%22%20fill%3D%22%238b7cf7%22%2F%3E%3Ccircle%20cx%3D%2222%22%20cy%3D%2216%22%20r%3D%228%22%20fill%3D%22%23fff%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%2228%22%20width%3D%2228%22%20height%3D%2216%22%20rx%3D%228%22%20fill%3D%22%23fff%22%2F%3E%3C%2Fsvg%3E"
                            initials="AT"
                            name="Alan Turing"
                            presence="online"
                            status={{ text: "Heads-down" }}
                            title="Cryptanalyst"
                            username="alan"
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="name + @username only · title, no status · actions"
                    label="Content states"
                    number="P-04"
                    stage="surface"
                >
                    <div style={{ display: "grid", gap: "16px", padding: "24px", width: "384px" }}>
                        <ProfileCard
                            initials="RC"
                            name="Radia Perlman"
                            presence="online"
                            tone="mint"
                            username="radia"
                        />
                        <ProfileCard
                            initials="BL"
                            name="Barbara Liskov"
                            presence="offline"
                            title="Institute professor"
                            tone="slate"
                            username="barbara"
                        />
                        <ProfileCard
                            actions={
                                <Button size="small" variant="secondary">
                                    Message
                                </Button>
                            }
                            initials="HL"
                            name="Hedy Lamarr"
                            presence="online"
                            status={{ emoji: "📡", text: "Spread spectrum" }}
                            title="Inventor"
                            tone="ember"
                            username="hedy"
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
