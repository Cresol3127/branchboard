import { type KeyboardEvent, useRef } from "react";
import { MaterialSymbol, type MaterialSymbolName } from "./MaterialSymbol";

export type ConnectedButtonOption<T extends string> = {
  value: T;
  label: string;
  icon?: MaterialSymbolName;
  disabled?: boolean;
};

export function ConnectedButtonGroup<T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
}: {
  value: T;
  options: readonly ConnectedButtonOption<T>[];
  ariaLabel: string;
  onChange(value: T): void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (event: KeyboardEvent<HTMLButtonElement>, direction: -1 | 1) => {
    event.preventDefault();
    const start = options.findIndex((option) => option.value === value);
    for (let step = 1; step <= options.length; step += 1) {
      const index = (start + direction * step + options.length) % options.length;
      if (!options[index].disabled) {
        onChange(options[index].value);
        refs.current[index]?.focus();
        return;
      }
    }
  };

  return (
    <div className="md-connected-group" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled}
            className="md-connected-group__button"
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") move(event, 1);
              if (event.key === "ArrowLeft" || event.key === "ArrowUp") move(event, -1);
            }}
          >
            {selected ? <MaterialSymbol name="check" size={20} /> : option.icon ? <MaterialSymbol name={option.icon} size={20} /> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
