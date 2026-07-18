import { useState } from "react";
import { Button } from "../../src/Button";
import { ChannelHeader } from "../../src/ChannelHeader";
import type { MenuItem } from "../../src/Menu";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
};
const menuItems: MenuItem[] = [
    { kind: "item", id: "details", icon: "eye", label: "Channel details" },
    { kind: "item", id: "copy", icon: "link", label: "Copy link" },
    { kind: "item", id: "star", icon: "star", label: "Star channel" },
    { kind: "separator" },
    { kind: "item", id: "edit", icon: "settings", label: "Edit settings" },
    { kind: "separator" },
    { kind: "item", id: "leave", icon: "close", label: "Leave channel", danger: true },
];
function actions() {
    return (
        <>
            <Button aria-label="Notifications" icon="bell" iconOnly size="small" variant="ghost" />
            <Button aria-label="Search" icon="search" iconOnly size="small" variant="ghost" />
        </>
    );
}
export function ChannelHeaderPage() {
    const [starred, setStarred] = useState(true);
    return (
        <ComponentPage
            number="C-011"
            summary="52px context strip across the top of the main surface, modeled on Slack: star toggle, clickable channel title, truncating topic, a member-count pill, agent chip, actions, and an overflow menu."
            title="ChannelHeader"
        >
            <Specimen
                detail="star · clickable title · topic · member pill · agent chip · actions · ⋮ menu"
                label="Full channel header"
                number="01"
                stage="app"
            >
                <div style={column}>
                    <div style={{ width: "820px" }}>
                        <ChannelHeader
                            actions={actions()}
                            agentCount={3}
                            memberCount={12}
                            menuItems={menuItems}
                            onMembersClick={() => {}}
                            onMenuSelect={() => {}}
                            onStarToggle={() => setStarred((value) => !value)}
                            onTitleClick={() => {}}
                            starred={starred}
                            title="launch-week"
                            topic="Ship mobile v2 by Fri"
                        />
                    </div>
                    <DimensionRule label="52 px high · 16 px x-pad · click title / members / ⋮" />
                </div>
            </Specimen>

            <Specimen
                detail="hash · spark · inbox — 16px muted icon, title 15/700"
                label="Icon variants"
                number="02"
                stage="app"
            >
                <div style={{ ...column, width: "680px" }}>
                    <ChannelHeader
                        agentCount={2}
                        memberCount={24}
                        onMembersClick={() => {}}
                        onTitleClick={() => {}}
                        title="eng-core"
                        topic="Runtime, infra, and the auth stack"
                    />
                    <ChannelHeader
                        icon="spark"
                        title="Agent runs"
                        topic="Every run across the workspace"
                    />
                    <ChannelHeader icon="inbox" memberCount={4} title="Inbox" />
                </div>
            </Specimen>

            <Specimen
                detail="Title only — every star / member / action / menu part is optional"
                label="Minimal"
                number="03"
                stage="app"
            >
                <div style={{ width: "520px" }}>
                    <ChannelHeader title="design" />
                </div>
            </Specimen>

            <Specimen
                detail="Topic truncates with an ellipsis; the meta cluster never shrinks"
                label="Narrow — truncating topic"
                number="04"
                stage="app"
            >
                <div style={column}>
                    <div style={{ width: "440px" }}>
                        <ChannelHeader
                            agentCount={1}
                            memberCount={9}
                            menuItems={menuItems}
                            onMembersClick={() => {}}
                            onMenuSelect={() => {}}
                            onStarToggle={() => {}}
                            onTitleClick={() => {}}
                            title="support-fires"
                            topic="Escalations, refunds, and the weekly pager review that never seems to end"
                        />
                    </div>
                    <DimensionRule label="440 px container" />
                </div>
            </Specimen>

            <Specimen
                detail="Member pill is a button when onMembersClick is set; singular vs plural label"
                label="Member counter"
                number="05"
                stage="app"
            >
                <div style={{ ...column, width: "560px" }}>
                    <ChannelHeader memberCount={1} onMembersClick={() => {}} title="one" />
                    <ChannelHeader memberCount={128} onMembersClick={() => {}} title="crowd" />
                    <ChannelHeader memberCount={31} title="read-only-count" />
                </div>
            </Specimen>

            <Specimen
                detail="Ghost icon buttons compose into the actions slot; ⋮ opens the overflow menu"
                label="Actions + menu"
                number="06"
                stage="app"
            >
                <div style={{ width: "640px" }}>
                    <ChannelHeader
                        actions={actions()}
                        menuItems={menuItems}
                        onMenuSelect={() => {}}
                        onStarToggle={() => {}}
                        title="incidents"
                        topic="Sev-1 war room"
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
