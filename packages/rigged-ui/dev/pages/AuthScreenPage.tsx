import type { JSX } from "solid-js";
import { AuthScreen } from "../../src/AuthScreen";
import { Banner } from "../../src/Banner";
import { Button } from "../../src/Button";
import { Icon } from "../../src/Icon";
import { TextField } from "../../src/TextField";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/*
 * Deterministic, network-free hero fill: a static inline-SVG data URI stands in
 * for the generated background image so the has-image path renders without a
 * network asset. The gradient specimen omits `backgroundUrl` to show the
 * fallback.
 */
const heroDataUri =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'>` +
            `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
            `<stop offset='0' stop-color='%236d28d9'/><stop offset='1' stop-color='%23f472b6'/>` +
            `</linearGradient></defs>` +
            `<rect width='96' height='96' fill='%23131217'/>` +
            `<circle cx='30' cy='66' r='42' fill='url(%23g)' opacity='0.9'/>` +
            `<circle cx='72' cy='26' r='18' fill='%2338bdf8' opacity='0.5'/></svg>`,
    );

function SignInForm(): JSX.Element {
    return (
        <div style={{ display: "flex", "flex-direction": "column", gap: "14px" }}>
            <TextField
                fullWidth
                label="Work email"
                leadingIcon="at"
                placeholder="you@studio.com"
                type="email"
                value="maya@acme.studio"
            />
            <TextField
                fullWidth
                label="Password"
                leadingIcon="shield"
                placeholder="••••••••"
                type="password"
                value="hunter2hunter2"
            />
            <Button fullWidth size="large" variant="primary">
                Sign in
            </Button>
            <Button fullWidth size="large" variant="secondary">
                Continue with SSO
            </Button>
        </div>
    );
}

function window1024(children: JSX.Element) {
    return (
        <div style={{ display: "flex", "flex-direction": "column", gap: "8px", width: "1024px" }}>
            <div style={{ height: "704px", width: "1024px" }}>{children}</div>
            <DimensionRule label="1024px × 704px — minimum window contract" />
        </div>
    );
}

export function AuthScreenPage() {
    return (
        <ComponentPage
            number="C-032"
            summary="Full-window auth / onboarding split — decorative hero panel (generated image, degrading to the brand gradient) beside a fixed 480px form panel on the app surface. Relay dark theme."
            title="Auth screen"
        >
            <Specimen
                detail="hero grows · form panel 480 wide, 48 inset · brand mast · 28px Figtree title · form slot · footer"
                label="Sign in — brand gradient hero"
                number="01"
                stage="chrome"
            >
                {window1024(
                    <AuthScreen
                        brand={{ name: "Relay" }}
                        copy="Sign in to reach your channels, agents, and threads across the workspace."
                        footer={<span>New to Relay? Ask your workspace admin for an invite.</span>}
                        kicker="Welcome back"
                        title="Sign in to Relay"
                    >
                        <SignInForm />
                    </AuthScreen>,
                )}
            </Specimen>

            <Specimen
                detail="backgroundUrl set (static data URI) · custom brand mark · Banner in the form slot"
                label="Onboarding — generated hero image"
                number="02"
                stage="chrome"
            >
                {window1024(
                    <AuthScreen
                        backgroundUrl={heroDataUri}
                        brand={{
                            mark: <Icon color="var(--rg-text-on-accent)" name="zap" size={16} />,
                            name: "Relay",
                        }}
                        copy="Create your account to spin up channels and invite your first agents."
                        footer={<span>By continuing you agree to the workspace policies.</span>}
                        kicker="Get started"
                        title="Create your workspace"
                    >
                        <div style={{ display: "flex", "flex-direction": "column", gap: "14px" }}>
                            <Banner tone="info" title="Invite accepted">
                                You were invited to Acme Studio. Finish setup to join.
                            </Banner>
                            <TextField fullWidth label="Full name" placeholder="Maya Johnson" />
                            <TextField
                                fullWidth
                                label="Work email"
                                leadingIcon="at"
                                placeholder="you@studio.com"
                                type="email"
                            />
                            <Button fullWidth size="large" variant="primary">
                                Create account
                            </Button>
                        </div>
                    </AuthScreen>,
                )}
            </Specimen>

            <Specimen
                detail='state="loading" — deterministic static ring + label replaces the form slot'
                label="Loading state"
                number="03"
                stage="chrome"
            >
                {window1024(
                    <AuthScreen
                        brand={{ name: "Relay" }}
                        copy="Sign in to reach your channels, agents, and threads across the workspace."
                        kicker="Welcome back"
                        loadingLabel="Signing you in…"
                        state="loading"
                        title="Sign in to Relay"
                    >
                        <SignInForm />
                    </AuthScreen>,
                )}
            </Specimen>

            <Specimen
                detail="minimal — no kicker / copy / footer / brand; title + form slot only"
                label="Minimal"
                number="04"
                stage="chrome"
            >
                {window1024(
                    <AuthScreen title="Enter your access code">
                        <div style={{ display: "flex", "flex-direction": "column", gap: "14px" }}>
                            <TextField fullWidth label="Access code" placeholder="XXXX-XXXX" />
                            <Button fullWidth size="large" variant="primary">
                                Continue
                            </Button>
                        </div>
                    </AuthScreen>,
                )}
            </Specimen>
        </ComponentPage>
    );
}
