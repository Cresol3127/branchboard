import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { MaterialSymbol, type MaterialSymbolName } from "./MaterialSymbol";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "filled" | "tonal" | "outlined" | "text";
  tone?: "default" | "error";
  leadingIcon?: MaterialSymbolName;
  trailingIcon?: MaterialSymbolName;
  loading?: boolean;
  children: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "filled",
    tone = "default",
    leadingIcon,
    trailingIcon,
    loading = false,
    className,
    disabled,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      className={[
        "md-button",
        `md-button--${variant}`,
        tone === "error" && "md-button--error",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="md-button__spinner" aria-hidden="true" /> : null}
      {!loading && leadingIcon ? <MaterialSymbol name={leadingIcon} size={20} /> : null}
      <span className="md-button__label">{children}</span>
      {trailingIcon ? <MaterialSymbol name={trailingIcon} size={20} /> : null}
    </button>
  );
});
