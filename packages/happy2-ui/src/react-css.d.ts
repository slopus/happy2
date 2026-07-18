import "react";

declare module "react" {
    interface CSSProperties {
        [name: `--${string}`]: string | number | undefined;
    }
}
