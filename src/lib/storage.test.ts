import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WhiteboardCollection, Workspace } from "../types";
import {
  loadSettings,
  loadWhiteboards,
  removeWhiteboard,
  saveSettings,
  saveWhiteboards,
} from "./storage";

describe("browser storage fallback", () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  const workspace: Workspace = {
    selectedNodeId: "root",
    notes: [
      {
        id: "note-1",
        text: "Remember this",
        position: { x: 20, y: 30 },
        size: { width: 240, height: 190 },
        color: "yellow",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    strokes: [
      {
        id: "stroke-1",
        points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
        color: "ink",
        width: 3,
        createdAt: 1,
      },
    ],
    viewport: { x: 40, y: 50, zoom: 0.8 },
    nodes: [
      {
        id: "root",
        parentIds: [],
        prompt: "Question",
        response: "Answer",
        muted: false,
        status: "complete",
        position: { x: 10, y: 20 },
        size: { width: 520, height: 680 },
        createdAt: 1,
        provider: "gemini",
        model: "gemini-test",
        color: "cyan",
        metrics: {
          inputTokens: 12,
          outputTokens: 8,
          totalTokens: 20,
          durationMs: 500,
        },
        attachments: [
          {
            id: "asset-1",
            kind: "pdf",
            name: "brief.pdf",
            mimeType: "application/pdf",
            size: 2048,
            createdAt: 1,
          },
        ],
      },
      {
        id: "left-draft",
        parentIds: ["root"],
        prompt: "Left draft",
        response: "",
        muted: false,
        status: "draft",
        position: { x: 0, y: 100 },
        createdAt: 2,
      },
      {
        id: "right-draft",
        parentIds: ["root"],
        prompt: "Right draft",
        response: "",
        muted: false,
        status: "draft",
        position: { x: 400, y: 100 },
        createdAt: 3,
      },
      {
        id: "merged-draft",
        parentIds: ["left-draft", "right-draft"],
        prompt: "Merged draft",
        response: "",
        muted: false,
        status: "draft",
        position: { x: 200, y: 200 },
        createdAt: 4,
      },
    ],
  };

  it("round-trips multiple whiteboards", async () => {
    const collection: WhiteboardCollection = {
      version: 1,
      activeBoardId: "second",
      boards: [
        {
          ...workspace,
          id: "first",
          name: "Research",
          createdAt: 1,
          updatedAt: 2,
        },
        {
          nodes: [],
          notes: [],
          strokes: [],
          selectedNodeId: null,
          id: "second",
          name: "Writing",
          createdAt: 3,
          updatedAt: 4,
        },
      ],
    };

    await saveWhiteboards(collection);
    expect(await loadWhiteboards()).toEqual(collection);
  });

  it("migrates the original single workspace", async () => {
    localStorage.setItem("branchboard.workspace", JSON.stringify(workspace));

    const collection = await loadWhiteboards();

    expect(collection.activeBoardId).toBe("default-board");
    expect(collection.version).toBe(1);
    expect(collection.boards).toHaveLength(1);
    expect(collection.boards[0]).toMatchObject({
      id: "default-board",
      name: "Board 1",
      ...workspace,
    });
  });

  it("migrates and rewrites legacy whiteboard nodes using parentId", async () => {
    const legacyCollection = {
      activeBoardId: "legacy-board",
      boards: [
        {
          id: "legacy-board",
          name: "Legacy",
          selectedNodeId: "child",
          createdAt: 1,
          updatedAt: 2,
          nodes: [
            {
              id: "root",
              parentId: null,
              prompt: "Root",
              response: "Answer",
              muted: false,
              highlighted: false,
              status: "complete",
              position: { x: 0, y: 0 },
              createdAt: 1,
            },
            {
              id: "child",
              parentId: "root",
              prompt: "Child",
              response: "Answer",
              muted: false,
              highlighted: false,
              status: "complete",
              position: { x: 0, y: 100 },
              createdAt: 2,
            },
          ],
        },
      ],
    };
    localStorage.setItem("branchboard.whiteboards", JSON.stringify(legacyCollection));

    const loaded = await loadWhiteboards();
    const persisted = JSON.parse(values.get("branchboard.whiteboards") as string);

    expect(loaded.boards[0].nodes.map(({ parentIds }) => parentIds)).toEqual([
      [],
      ["root"],
    ]);
    expect(loaded.boards[0].nodes.every((node) => !("parentId" in node))).toBe(true);
    expect(loaded.boards[0].nodes.every((node) => !("highlighted" in node))).toBe(true);
    expect(persisted.boards[0].nodes.map((node: Record<string, unknown>) => node.parentIds)).toEqual([
      [],
      ["root"],
    ]);
    expect(
      persisted.boards[0].nodes.every(
        (node: Record<string, unknown>) => !("parentId" in node),
      ),
    ).toBe(true);
    expect(
      persisted.boards[0].nodes.every(
        (node: Record<string, unknown>) => !("highlighted" in node),
      ),
    ).toBe(true);
    expect(loaded.version).toBe(1);
    expect(loaded.boards[0].notes).toEqual([]);
    expect(loaded.boards[0].strokes).toEqual([]);
    expect(persisted.version).toBe(1);
  });

  it("normalizes malformed annotations and viewport data", async () => {
    const stored = {
      version: 1,
      activeBoardId: "board",
      boards: [
        {
          id: "board",
          name: "Board",
          selectedNodeId: null,
          createdAt: 1,
          updatedAt: 1,
          nodes: [],
          notes: [
            {
              id: "valid-note",
              text: "Note",
              position: { x: 1, y: 2 },
              size: { width: 20, height: 900 },
              color: "yellow",
              createdAt: 1,
              updatedAt: 1,
            },
            { id: "bad-note" },
          ],
          strokes: [
            {
              id: "valid-stroke",
              points: [{ x: 0, y: 0 }, { x: 5, y: 8 }],
              color: "blue",
              width: 50,
              createdAt: 1,
            },
            { id: "bad-stroke", points: [] },
          ],
          viewport: { x: 10, y: 20, zoom: 9 },
        },
      ],
    };
    localStorage.setItem("branchboard.whiteboards", JSON.stringify(stored));

    const loaded = await loadWhiteboards();

    expect(loaded.boards[0].notes).toHaveLength(1);
    expect(loaded.boards[0].notes[0].size).toEqual({ width: 180, height: 600 });
    expect(loaded.boards[0].strokes).toHaveLength(1);
    expect(loaded.boards[0].strokes[0].width).toBe(24);
    expect(loaded.boards[0].viewport).toEqual({ x: 10, y: 20, zoom: 1.5 });
  });

  it("removes unsupported persisted conversation colors", async () => {
    const stored = {
      version: 1,
      activeBoardId: "board",
      boards: [
        {
          id: "board",
          name: "Board",
          selectedNodeId: "node",
          createdAt: 1,
          updatedAt: 1,
          notes: [],
          strokes: [],
          nodes: [
            {
              id: "node",
              parentIds: [],
              prompt: "Question",
              response: "Answer",
              muted: false,
              status: "complete",
              position: { x: 0, y: 0 },
              createdAt: 1,
              color: "neon-chartreuse",
            },
          ],
        },
      ],
    };
    localStorage.setItem("branchboard.whiteboards", JSON.stringify(stored));

    const loaded = await loadWhiteboards();
    const persisted = JSON.parse(values.get("branchboard.whiteboards") as string);

    expect(loaded.boards[0].nodes[0]).not.toHaveProperty("color");
    expect(persisted.boards[0].nodes[0]).not.toHaveProperty("color");
  });

  it("removes the active whiteboard and selects its adjacent board", () => {
    const boards = ["first", "second", "third"].map((id, index) => ({
      ...workspace,
      id,
      name: `Board ${index + 1}`,
      createdAt: index + 1,
      updatedAt: index + 1,
    }));
    const next = removeWhiteboard(
      { version: 1, boards, activeBoardId: "second" },
      "second",
    );

    expect(next.boards.map(({ id }) => id)).toEqual(["first", "third"]);
    expect(next.activeBoardId).toBe("third");
  });

  it("replaces the last whiteboard with a fresh Board 1", () => {
    const onlyBoard = {
      ...workspace,
      id: "only",
      name: "Only",
      createdAt: 1,
      updatedAt: 1,
    };
    const next = removeWhiteboard(
      { version: 1, boards: [onlyBoard], activeBoardId: "only" },
      "only",
    );

    expect(next.boards).toHaveLength(1);
    expect(next.boards[0]).toMatchObject({
      name: "Board 1",
      nodes: [],
      notes: [],
      strokes: [],
      selectedNodeId: null,
    });
    expect(next.boards[0].id).not.toBe("only");
    expect(next.activeBoardId).toBe(next.boards[0].id);
  });

  it("keeps the current active board when another whiteboard is removed", () => {
    const boards = ["first", "second"].map((id, index) => ({
      ...workspace,
      id,
      name: `Board ${index + 1}`,
      createdAt: index + 1,
      updatedAt: index + 1,
    }));
    const next = removeWhiteboard(
      { version: 1, boards, activeBoardId: "second" },
      "first",
    );

    expect(next.boards.map(({ id }) => id)).toEqual(["second"]);
    expect(next.activeBoardId).toBe("second");
  });

  it("merges stored settings with defaults", async () => {
    const settings = await loadSettings();
    settings.provider = "anthropic";
    settings.providers.anthropic = { apiKey: "key", model: "claude-custom" };
    settings.theme = "light";
    settings.readingFontStyle = "serif";
    settings.readingFontSizePx = 18;
    await saveSettings(settings);
    expect(await loadSettings()).toEqual(settings);
  });

  it("defaults missing typography and normalizes invalid stored values", async () => {
    const stored = await loadSettings();
    const withoutTypography = { ...stored } as Record<string, unknown>;
    delete withoutTypography.readingFontStyle;
    delete withoutTypography.readingFontSizePx;
    localStorage.setItem("branchboard.settings", JSON.stringify(withoutTypography));

    await expect(loadSettings()).resolves.toMatchObject({
      readingFontStyle: "branchboard",
      readingFontSizePx: 12,
    });

    localStorage.setItem(
      "branchboard.settings",
      JSON.stringify({
        ...stored,
        readingFontStyle: "unknown",
        readingFontSizePx: 100,
      }),
    );
    await expect(loadSettings()).resolves.toMatchObject({
      readingFontStyle: "branchboard",
      readingFontSizePx: 24,
    });
  });

  it("migrates legacy Gemini settings and defaults to the system theme", async () => {
    localStorage.setItem(
      "branchboard.settings",
      JSON.stringify({ apiKey: "legacy-key", model: "gemini-legacy" }),
    );

    const settings = await loadSettings();
    expect(settings.provider).toBe("gemini");
    expect(settings.theme).toBe("system");
    expect(settings.readingFontStyle).toBe("branchboard");
    expect(settings.readingFontSizePx).toBe(12);
    expect(settings.providers.gemini).toEqual({
      apiKey: "legacy-key",
      model: "gemini-legacy",
    });
    expect(settings.providers.local.endpoint).toBe("http://localhost:11434");
  });
});
