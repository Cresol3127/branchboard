import type { CSSProperties } from "react";

export type MaterialSymbolName =
  | "account_tree"
  | "add"
  | "arrow_drop_down"
  | "attach_file"
  | "check"
  | "check_circle"
  | "chevron_left"
  | "chevron_right"
  | "close"
  | "compare"
  | "dark_mode"
  | "delete"
  | "description"
  | "draw"
  | "edit_note"
  | "fit_screen"
  | "help"
  | "image"
  | "ink_eraser"
  | "keyboard"
  | "light_mode"
  | "map"
  | "merge_type"
  | "more_vert"
  | "movie"
  | "note_add"
  | "palette"
  | "redo"
  | "refresh"
  | "remove"
  | "replay"
  | "science"
  | "send"
  | "select_all"
  | "settings"
  | "stop"
  | "undo"
  | "visibility"
  | "visibility_off"
  | "volume_off"
  | "volume_up"
  | "zoom_in"
  | "zoom_out";

export type MaterialSymbolProps = {
  name: MaterialSymbolName;
  filled?: boolean;
  size?: 20 | 24 | 40 | 48;
  weight?: number;
  className?: string;
};

export function MaterialSymbol({
  name,
  filled = false,
  size = 24,
  weight = 400,
  className,
}: MaterialSymbolProps) {
  const style = {
    "--md-symbol-fill": filled ? 1 : 0,
    "--md-symbol-size": size,
    "--md-symbol-weight": weight,
    fontSize: size,
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={["material-symbol", className].filter(Boolean).join(" ")}
      style={style}
    >
      {name}
    </span>
  );
}
