import { forwardRef, type ButtonHTMLAttributes } from "react";
import { MaterialSymbol, type MaterialSymbolName } from "./MaterialSymbol";
import { Tooltip } from "./Tooltip";

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  label: string;
  icon: MaterialSymbolName;
  selected?: boolean;
  variant?: "standard" | "filled" | "tonal" | "outlined";
  tooltipPlacement?: "above" | "below";
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      icon,
      selected = false,
      variant = "standard",
      tooltipPlacement,
      className,
      ...props
    },
    ref,
  ) {
    return (
      <Tooltip label={label} placement={tooltipPlacement}>
        <button
          {...props}
          ref={ref}
          type={props.type ?? "button"}
          aria-label={label}
          aria-pressed={props["aria-pressed"] ?? (selected || undefined)}
          className={[
            "md-icon-button",
            `md-icon-button--${variant}`,
            selected && "is-selected",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <MaterialSymbol name={icon} filled={selected} />
        </button>
      </Tooltip>
    );
  },
);
