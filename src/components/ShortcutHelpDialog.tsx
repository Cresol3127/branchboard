import { SHORTCUTS, formatShortcutBinding } from "../lib/shortcuts";
import { IconButton, MaterialSymbol } from "./material";

type ShortcutHelpDialogProps = {
  onClose: () => void;
};

const CATEGORIES = ["Global", "Workspace", "Canvas", "Selected conversation", "Editor"] as const;

export function ShortcutHelpDialog({ onClose }: ShortcutHelpDialogProps) {
  return (
    <section className="shortcut-dialog">
      <header>
        <div>
          <span className="panel-kicker"><MaterialSymbol name="keyboard" size={20} /> Work faster</span>
          <h2 id="shortcut-dialog-title">Keyboard shortcuts</h2>
        </div>
        <IconButton label="Close keyboard shortcuts" icon="close" onClick={onClose} />
      </header>
      <div className="shortcut-groups">
        {CATEGORIES.map((category) => (
          <section key={category} className="shortcut-group">
            <h3>{category}</h3>
            <dl>
              {SHORTCUTS.filter((shortcut) => shortcut.category === category).map((shortcut) => (
                <div key={shortcut.id}>
                  <dt>
                    <span>{shortcut.label}</span>
                    {shortcut.description && <small>{shortcut.description}</small>}
                  </dt>
                  <dd>
                    {shortcut.bindings.map((binding, index) => (
                      <span key={`${binding.key}-${index}`}>
                        {index > 0 && <i>or</i>}
                        <kbd>{formatShortcutBinding(binding)}</kbd>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="shortcut-dialog-note">Single-key commands pause while you type. Escape closes only the topmost active layer.</p>
    </section>
  );
}
