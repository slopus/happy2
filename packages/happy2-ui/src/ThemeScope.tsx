import { type ReactNode } from "react";

export type ThemeMode = "dark" | "light" | "system";

export type ThemeScopeProps = {
    children: ReactNode;
    mode: ThemeMode;
};

/**
 * Applies one user-selected appearance to a stable product subtree while
 * retaining the system palette when no explicit override is selected.
 */
export function ThemeScope(props: ThemeScopeProps) {
    return (
        <div
            className={
                props.mode === "system"
                    ? "happy2-theme-scope"
                    : `happy2-theme-scope happy2-theme-${props.mode}`
            }
            data-happy2-ui="theme-scope"
        >
            {props.children}
        </div>
    );
}
