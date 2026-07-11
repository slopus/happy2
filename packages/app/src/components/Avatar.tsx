export type AvatarType = "bot" | "human";

type AvatarSize = "md" | "sm" | "xs";

type AvatarProps = {
  backgroundClass: string;
  initials: string;
  online?: boolean;
  size?: AvatarSize;
  type?: AvatarType;
};

const sizeClasses: Record<AvatarSize, string> = {
  xs: "h-[18px] w-[18px] text-[0.45rem]",
  sm: "h-9 w-9 text-[0.62rem]",
  md: "h-10 w-10 text-[0.65rem]"
};

export function Avatar(props: AvatarProps) {
  const type = () => props.type ?? "human";
  const size = () => props.size ?? "sm";

  return (
    <span
      class={`relative grid shrink-0 place-items-center font-black text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_28%)] ${sizeClasses[size()]} ${props.backgroundClass} ${type() === "human" ? "rounded-full border border-white/55" : "rounded-[7px] border border-black/15"}`}
      data-avatar-type={type()}
      aria-hidden="true"
    >
      {props.initials}
      {props.online && (
        <span class="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white bg-[#36ae5f]" />
      )}
    </span>
  );
}
