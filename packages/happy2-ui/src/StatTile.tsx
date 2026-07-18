import { splitProps } from "./reactProps";
import { type CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";
export type StatTrend = "up" | "down" | "flat";
export type StatTone = "neutral" | "accent" | "success" | "warning" | "danger";
export type StatDelta = {
    value: string;
    trend: StatTrend;
};
export type StatTileProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    label: string;
    value: string;
    delta?: StatDelta;
    icon?: IconName;
    tone?: StatTone;
    hint?: string;
};
/*
 * Trend markers are component-owned artwork (the shared Icon set carries no
 * up/down glyph). Each is drawn on a 12-unit grid and is bilaterally symmetric
 * about x = 6, so its alpha centroid lands on the box center horizontally; the
 * up/down triangles are intentionally directional on the vertical axis.
 */
const trendArrows: Record<StatTrend, string> = {
    up: "M6 2.4 10.6 9.6 1.4 9.6Z",
    down: "M1.4 2.4 10.6 2.4 6 9.6Z",
    flat: "M1.8 4.8 10.2 4.8 10.2 7.2 1.8 7.2Z",
};
/**
 * C-031 StatTile — metric card. A muted label + tone icon chip header, a large
 * tabular value, and an optional trend delta with a hint. `tone` colours the
 * icon chip; `delta.trend` colours the delta (up success, down danger, flat
 * muted) and selects its arrow.
 */
export function StatTile(props: StatTileProps) {
    const [local] = splitProps(props, [
        "className",
        "data-testid",
        "style",
        "label",
        "value",
        "delta",
        "icon",
        "tone",
        "hint",
    ]);
    const tone = () => local.tone ?? "neutral";
    const hasFooter = () => Boolean(local.delta || local.hint);
    return (
        <div
            className={["happy2-stat-tile", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="stat-tile"
            data-testid={local["data-testid"]}
            data-tone={tone()}
            style={local.style}
        >
            <div className="happy2-stat-tile__header" data-happy2-ui="stat-tile-header">
                <span className="happy2-stat-tile__label" data-happy2-ui="stat-tile-label">
                    {local.label}
                </span>
                {local.icon
                    ? ((name) => (
                          <span className="happy2-stat-tile__icon" data-happy2-ui="stat-tile-icon">
                              <Icon name={name} size={16} />
                          </span>
                      ))(local.icon)
                    : null}
            </div>

            <div className="happy2-stat-tile__value" data-happy2-ui="stat-tile-value">
                {local.value}
            </div>

            {hasFooter() ? (
                <div className="happy2-stat-tile__footer" data-happy2-ui="stat-tile-footer">
                    {local.delta
                        ? ((delta) => (
                              <span
                                  className="happy2-stat-tile__delta"
                                  data-happy2-ui="stat-tile-delta"
                                  data-trend={delta.trend}
                              >
                                  <svg
                                      aria-hidden="true"
                                      className="happy2-stat-tile__delta-arrow"
                                      data-happy2-ui="stat-tile-delta-arrow"
                                      data-trend={delta.trend}
                                      fill="currentColor"
                                      height="12"
                                      viewBox="0 0 12 12"
                                      width="12"
                                  >
                                      <path d={trendArrows[delta.trend]} />
                                  </svg>
                                  <span
                                      className="happy2-stat-tile__delta-value"
                                      data-happy2-ui="stat-tile-delta-value"
                                  >
                                      {delta.value}
                                  </span>
                              </span>
                          ))(local.delta)
                        : null}
                    {local.hint ? (
                        <span className="happy2-stat-tile__hint" data-happy2-ui="stat-tile-hint">
                            {local.hint}
                        </span>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
