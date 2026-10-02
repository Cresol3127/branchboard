// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Button,
  ConnectedButtonGroup,
  IconButton,
  Menu,
  MenuItem,
  SideSheet,
  TooltipProvider,
} from ".";

describe("Material primitives", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.replaceChildren();
  });

  it("renders labelled actions with native button semantics", () => {
    act(() => {
      root.render(
        <TooltipProvider>
          <Button variant="filled" leadingIcon="add">New root</Button>
          <IconButton label="Open settings" icon="settings" />
        </TooltipProvider>,
      );
    });

    expect(host.querySelector(".md-button")?.textContent).toContain("New root");
    expect(host.querySelector(".md-icon-button")?.getAttribute("aria-label"))
      .toBe("Open settings");
  });

  it("uses radio semantics and arrow navigation for connected groups", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <ConnectedButtonGroup
          value="node"
          ariaLabel="Color scope"
          options={[
            { value: "node", label: "Node" },
            { value: "family", label: "Family" },
          ]}
          onChange={onChange}
        />,
      );
    });

    const radios = [...host.querySelectorAll<HTMLButtonElement>("[role='radio']")];
    expect(radios.map((radio) => radio.tabIndex)).toEqual([0, -1]);
    act(() => radios[0].dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
    })));
    expect(onChange).toHaveBeenCalledWith("family");
  });

  it("focuses the first menu item and restores its trigger on Escape", async () => {
    const triggerRef = { current: document.createElement("button") };
    document.body.append(triggerRef.current);
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <Menu open anchorRef={triggerRef} label="Board actions" onRequestClose={onClose}>
          <MenuItem onSelect={() => undefined}>First action</MenuItem>
          <MenuItem onSelect={() => undefined}>Second action</MenuItem>
        </Menu>,
      );
      await Promise.resolve();
    });

    const menu = document.querySelector<HTMLElement>("[role='menu']")!;
    expect(document.activeElement?.textContent).toBe("First action");
    act(() => menu.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    })));
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(triggerRef.current);
  });

  it("contains modal side-sheet focus and restores the opener", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <SideSheet open modal labelledBy="sheet-title" onRequestClose={onClose}>
          <h2 id="sheet-title">Settings</h2>
          <button type="button">First</button>
          <button type="button">Last</button>
        </SideSheet>,
      );
      await Promise.resolve();
    });

    const sheet = host.querySelector<HTMLElement>(".md-side-sheet")!;
    const buttons = [...sheet.querySelectorAll<HTMLButtonElement>("button")];
    expect(document.activeElement).toBe(buttons[0]);
    buttons[1].focus();
    act(() => sheet.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
    })));
    expect(document.activeElement).toBe(buttons[0]);

    await act(async () => {
      root.render(
        <SideSheet open={false} modal labelledBy="sheet-title" onRequestClose={onClose}>
          <h2 id="sheet-title">Settings</h2>
        </SideSheet>,
      );
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(opener);
  });
});
