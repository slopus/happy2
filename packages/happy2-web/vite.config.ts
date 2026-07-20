import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";

/** Cookie the backend accepts for every browser authentication, matching the web gateway. */
const AUTHENTICATION_COOKIE = "happy2_auth_token";
/** 400 days in seconds — the browser ceiling for a persistent cookie (34_560_000). */
const AUTHENTICATION_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
/** Only a token-safe Bearer value from a successful backend request becomes a cookie. */
const AUTHORIZATION_BEARER = /^Bearer ([A-Za-z0-9._-]{1,4096})$/;

/**
 * The `/v0` dev proxy mirrors the packaged web proxy: after any non-Cloudflare
 * auth flow issues a bearer, the app presents it exactly once to the dedicated
 * `/v0/auth/web/session` verification endpoint. A successful response becomes
 * an HttpOnly `happy2_auth_token` cookie, and every later product request relies
 * only on that browser cookie. Cloudflare Access never takes this path because
 * its own cookies already authenticate the request. Local dev omits `Secure`.
 */
function authenticationCookieProxy(target: string, cookieDomain: string | undefined): ProxyOptions {
    return {
        target,
        changeOrigin: true,
        configure(proxy) {
            proxy.on("proxyRes", (proxyRes, req) => {
                if ((req.method ?? "GET").toUpperCase() !== "GET") return;
                if ((req.url ?? "").split("?")[0] !== "/v0/auth/web/session") return;
                if (proxyRes.statusCode !== 200) return;
                const authorization = req.headers.authorization;
                const match =
                    typeof authorization === "string"
                        ? AUTHORIZATION_BEARER.exec(authorization)
                        : null;
                if (!match) return;
                const cookie =
                    `${AUTHENTICATION_COOKIE}=${match[1]}; HttpOnly; Path=/; ` +
                    `SameSite=Strict; Max-Age=${AUTHENTICATION_COOKIE_MAX_AGE_SECONDS}` +
                    (cookieDomain ? `; Domain=${cookieDomain}` : "");
                const existing = proxyRes.headers["set-cookie"];
                proxyRes.headers["set-cookie"] = existing ? [...existing, cookie] : [cookie];
            });
        },
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const backendUrl = env.VITE_HAPPY2_SERVER_URL ?? "http://127.0.0.1:3000";
    return {
        plugins: [
            // The Rig terminal protocol (@slopus/ghostty-web) decodes compressed wire
            // frames with node:zlib and node Buffer; these polyfills make them real in
            // the browser instead of empty externals that would throw at runtime.
            nodePolyfills({
                include: ["buffer", "zlib", "crypto", "stream", "util"],
                globals: { Buffer: true },
            }),
            tailwindcss(),
            react(),
            babel({ presets: [reactCompilerPreset()] }),
        ],
        server: {
            proxy: {
                "/v0/auth/web/session": {
                    ...authenticationCookieProxy(backendUrl, env.HAPPY2_WEB_AUTH_COOKIE_DOMAIN),
                },
                "/v0": { target: backendUrl, changeOrigin: true, ws: true },
            },
        },
    };
});
