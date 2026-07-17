import { Button } from "../../src/Button";
import { MemberList, type MemberItem } from "../../src/MemberList";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const roster: MemberItem[] = [
    {
        id: "ada",
        initials: "AL",
        name: "Ada Lovelace",
        presence: "online",
        role: "owner",
        title: "Founder & CEO",
        tone: "violet",
    },
    {
        id: "grace",
        initials: "GH",
        name: "Grace Hopper",
        presence: "offline",
        role: "admin",
        title: "Systems Lead",
        tone: "ocean",
    },
    {
        id: "linus",
        initials: "LT",
        name: "Linus Torvalds",
        presence: "online",
        role: "member",
        tone: "amber",
        username: "linus",
    },
    {
        id: "katherine",
        initials: "KJ",
        name: "Katherine Johnson",
        presence: "offline",
        role: "member",
        title: "Mathematician",
        tone: "mint",
    },
];

const roles: MemberItem[] = [
    {
        id: "owner",
        initials: "OW",
        name: "Nadia Owner",
        presence: "online",
        role: "owner",
        title: "Owner",
        tone: "brand",
    },
    {
        id: "admin",
        initials: "AD",
        name: "Omar Admin",
        presence: "online",
        role: "admin",
        title: "Administrator",
        tone: "ocean",
    },
    {
        id: "member",
        initials: "ME",
        name: "Priya Member",
        presence: "offline",
        role: "member",
        title: "Member",
        tone: "slate",
    },
];

const withService: MemberItem[] = [
    {
        agent: true,
        id: "happy",
        initials: "H",
        name: "Happy",
        role: "member",
        systemRole: "service",
        tone: "brand",
        username: "happy",
    },
    {
        id: "ada",
        initials: "AL",
        name: "Ada Lovelace",
        presence: "online",
        role: "owner",
        title: "Founder & CEO",
        tone: "violet",
    },
    {
        id: "grace",
        initials: "GH",
        name: "Grace Hopper",
        presence: "offline",
        role: "member",
        tone: "ocean",
        username: "grace",
    },
];

const minimal: MemberItem[] = [
    {
        id: "solo",
        initials: "SB",
        name: "Sam Bright",
        presence: "online",
        role: "member",
        tone: "rose",
    },
    {
        id: "handle",
        initials: "JD",
        name: "Jesse Dee",
        presence: "offline",
        role: "member",
        tone: "amber",
        username: "jesse",
    },
];

export function MemberListPage() {
    return (
        <ComponentPage
            number="C-039"
            summary="Chat roster rows: 36px presence avatar, name/title identity, role badge, and a trailing action or menu on a 56px grid."
            title="Member list"
        >
            <div class="specimen-grid">
                <Specimen
                    detail="56px rows · avatar 36 · role badge · trailing action"
                    label="Roster"
                    number="C-039·A"
                    stage="surface"
                >
                    <div style={{ display: "grid", gap: "6px", width: "360px", padding: "24px" }}>
                        <DimensionRule label="row 56 · width 360" />
                        <MemberList actionLabel="Message" members={roster} onAction={() => {}} />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid specimen-grid--sizes">
                <Specimen
                    detail="owner accent · admin info · member neutral"
                    label="Role badges"
                    number="C-039·B"
                    stage="surface"
                >
                    <div style={{ width: "300px", padding: "24px" }}>
                        <MemberList actionLabel="Message" members={roles} onAction={() => {}} />
                    </div>
                </Specimen>

                <Specimen
                    detail="rowMenu — trailing kebab button"
                    label="Row menu"
                    number="C-039·C"
                    stage="surface"
                >
                    <div style={{ width: "300px", padding: "24px" }}>
                        <MemberList
                            members={roster.slice(0, 3)}
                            rowMenu={(member) => (
                                <Button
                                    aria-label={`Manage ${member.name}`}
                                    icon="more"
                                    iconOnly
                                    size="small"
                                    variant="ghost"
                                />
                            )}
                        />
                    </div>
                </Specimen>

                <Specimen
                    detail="single-line name · @handle · no trailing"
                    label="Minimal"
                    number="C-039·D"
                    stage="surface"
                >
                    <div style={{ width: "300px", padding: "24px" }}>
                        <MemberList members={minimal} />
                    </div>
                </Specimen>

                <Specimen
                    detail="service agent — agent avatar (no presence dot) · accent Service badge outranks org role"
                    label="Service member"
                    number="C-039·E"
                    stage="surface"
                >
                    <div style={{ width: "300px", padding: "24px" }}>
                        <MemberList members={withService} />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
