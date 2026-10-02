import { applyNodeChanges } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import type { ConversationNode, InkStroke, StickyNote } from "../types";
import {
  applyCollisionSafeNodeChanges,
  createConversationEdge,
  getCanvasSelectionBounds,
  nudgeBoardFlowNode,
  reconcileFlowNodes,
  reconcileStickyNodes,
  screenSelectionToFlowRectangle,
} from "./BoardCanvas";

const callbacks = {
  onSelect: vi.fn(),
  onCreateBranch: vi.fn(),
  onRetry: vi.fn(),
  onStartMerge: vi.fn(),
  onToggleMuted: vi.fn(),
  onStop: vi.fn(),
  onDelete: vi.fn(),
  onResizeStart: vi.fn(),
  onResizeEnd: vi.fn(),
  onResetSize: vi.fn(),
};

const stickyCallbacks = {
  onTextCommit: vi.fn(),
  onColorCommit: vi.fn(),
  onDelete: vi.fn(),
  onResizeStart: vi.fn(),
  onResizeEnd: vi.fn(),
};

function conversation(overrides: Partial<ConversationNode> = {}): ConversationNode {
  return {
    id: "node-1",
    parentIds: [],
    prompt: "Prompt",
    response: "First response",
    muted: false,
    status: "complete",
    position: { x: 10, y: 20 },
    createdAt: 1,
    ...overrides,
  };
}

function sticky(overrides: Partial<StickyNote> = {}): StickyNote {
  return {
    id: "note-1",
    text: "Remember this",
    position: { x: 0, y: 0 },
    size: { width: 240, height: 190 },
    color: "yellow",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("reconcileFlowNodes", () => {
  it("keeps a local drag position when conversation data updates", () => {
    const original = conversation();
    const initial = reconcileFlowNodes([], [original], original.id, callbacks, null);
    const moved = applyNodeChanges(
      [
        {
          id: original.id,
          type: "position",
          position: { x: 320, y: 180 },
          dragging: true,
        },
      ],
      initial,
    );
    const updated = { ...original, response: "Streamed response" };

    const reconciled = reconcileFlowNodes(
      moved,
      [updated],
      original.id,
      callbacks,
      null,
    );

    expect(reconciled[0].position).toEqual({ x: 320, y: 180 });
    expect(reconciled[0].data.conversation).toBe(updated);
  });

  it("defers repainting the dragged card until release", () => {
    const original = conversation();
    const initial = reconcileFlowNodes([], [original], original.id, callbacks, null);
    const moved = applyNodeChanges(
      [
        {
          id: original.id,
          type: "position",
          position: { x: 100, y: 200 },
          dragging: true,
        },
      ],
      initial,
    );
    const updated = { ...original, response: "New streaming text" };

    const whileDragging = reconcileFlowNodes(
      moved,
      [updated],
      original.id,
      callbacks,
      original.id,
    );
    const afterRelease = reconcileFlowNodes(
      whileDragging,
      [updated],
      original.id,
      callbacks,
      null,
    );

    expect(whileDragging).toBe(moved);
    expect(whileDragging[0].data.conversation).toBe(original);
    expect(afterRelease[0].data.conversation).toBe(updated);
    expect(afterRelease[0].position).toEqual({ x: 100, y: 200 });
  });

  it("preserves untouched flow-node identities", () => {
    const first = conversation();
    const second = conversation({
      id: "node-2",
      parentIds: [first.id],
      position: { x: 30, y: 400 },
    });
    const initial = reconcileFlowNodes([], [first, second], first.id, callbacks, null);
    const updatedFirst = { ...first, muted: true };

    const reconciled = reconcileFlowNodes(
      initial,
      [updatedFirst, second],
      first.id,
      callbacks,
      null,
    );

    expect(reconciled[0]).not.toBe(initial[0]);
    expect(reconciled[1]).toBe(initial[1]);
  });

  it("applies persisted manual dimensions", () => {
    const original = conversation({ size: { width: 560, height: 720 } });
    const initial = reconcileFlowNodes([], [original], original.id, callbacks, null);

    expect(initial[0].width).toBe(560);
    expect(initial[0].height).toBe(720);
  });

  it("derives automatic width from conversation content", () => {
    const original = conversation({ response: "r".repeat(1400) });
    const initial = reconcileFlowNodes([], [original], original.id, callbacks, null);

    expect(initial[0].width).toBe(520);
    expect(initial[0].height).toBeUndefined();
  });

  it("preserves local dimensions and content while a node is resizing", () => {
    const original = conversation();
    const initial = reconcileFlowNodes([], [original], original.id, callbacks, null);
    const resized = applyNodeChanges(
      [
        {
          id: original.id,
          type: "dimensions",
          dimensions: { width: 620, height: 760 },
          setAttributes: true,
          resizing: true,
        },
      ],
      initial,
    );
    const updated = { ...original, response: "Streaming update" };

    const reconciled = reconcileFlowNodes(
      resized,
      [updated],
      original.id,
      callbacks,
      original.id,
    );

    expect(reconciled).toBe(resized);
    expect(reconciled[0].width).toBe(620);
    expect(reconciled[0].height).toBe(760);
    expect(reconciled[0].data.conversation).toBe(original);
  });

  it("clears controlled dimensions when returning to automatic sizing", () => {
    const manual = conversation({ size: { width: 560, height: 720 } });
    const initial = reconcileFlowNodes([], [manual], manual.id, callbacks, null);
    const automatic = { ...manual, size: undefined };

    const reconciled = reconcileFlowNodes(
      initial,
      [automatic],
      manual.id,
      callbacks,
      null,
    );

    expect(reconciled[0].width).toBe(340);
    expect(reconciled[0].height).toBeUndefined();
    expect(reconciled[0].measured).toBeUndefined();
    expect(reconciled[0].data.conversation).toBe(automatic);
  });

  it("marks selected, eligible, and blocked drafts in a merge basket", () => {
    const parentA = conversation({ id: "parent-a" });
    const parentB = conversation({ id: "parent-b" });
    const parentC = conversation({ id: "parent-c" });
    const source = conversation({
      id: "source",
      parentIds: [parentA.id],
      status: "draft",
    });
    const eligible = conversation({
      id: "eligible",
      parentIds: [parentB.id],
      status: "draft",
    });
    const sameParent = conversation({
      id: "same-parent",
      parentIds: [parentA.id],
      status: "draft",
    });
    const complete = conversation({
      id: "complete",
      parentIds: [parentC.id],
    });
    const alreadyMerged = conversation({
      id: "already-merged",
      parentIds: [parentB.id, parentC.id],
      status: "draft",
    });

    const reconciled = reconcileFlowNodes(
      [],
      [
        parentA,
        parentB,
        parentC,
        source,
        eligible,
        sameParent,
        complete,
        alreadyMerged,
      ],
      null,
      callbacks,
      null,
      [source.id],
    );
    const states = Object.fromEntries(
      reconciled.map(({ id, data }) => [id, data.mergeState]),
    );

    expect(states).toEqual({
      "parent-a": "blocked",
      "parent-b": "blocked",
      "parent-c": "blocked",
      source: "selected",
      eligible: "eligible",
      "same-parent": "blocked",
      complete: "blocked",
      "already-merged": "eligible",
    });
  });

  it("uses the deepest parent when reconciling a multi-parent node", () => {
    const root = conversation({ id: "root" });
    const shallow = conversation({ id: "shallow", parentIds: [root.id] });
    const middle = conversation({ id: "middle", parentIds: [root.id] });
    const deep = conversation({ id: "deep", parentIds: [middle.id] });
    const merge = conversation({
      id: "merge",
      parentIds: [shallow.id, deep.id],
    });

    const reconciled = reconcileFlowNodes(
      [],
      [root, shallow, middle, deep, merge],
      merge.id,
      callbacks,
      null,
    );

    expect(reconciled.find(({ id }) => id === merge.id)?.data.depth).toBe(4);
  });

  it("applies an intentional domain position change", () => {
    const original = conversation();
    const initial = reconcileFlowNodes([], [original], original.id, callbacks, null);
    const movedByDomain = {
      ...original,
      position: { x: 480, y: 360 },
    };

    const reconciled = reconcileFlowNodes(
      initial,
      [movedByDomain],
      original.id,
      callbacks,
      null,
    );

    expect(reconciled[0].position).toEqual({ x: 480, y: 360 });
  });

  it("keeps token comparison selection separate from active context selection", () => {
    const active = conversation({ id: "active" });
    const compared = conversation({ id: "compared" });
    const reconciled = reconcileFlowNodes(
      [],
      [active, compared],
      active.id,
      callbacks,
      null,
      [],
      new Set([compared.id]),
      true,
    );

    expect(reconciled.find(({ id }) => id === active.id)).toMatchObject({
      selected: false,
      data: { selected: true, tokenSelected: false },
    });
    expect(reconciled.find(({ id }) => id === compared.id)).toMatchObject({
      selected: true,
      data: { selected: false, tokenSelected: true },
    });
  });

  it("preserves React Flow marquee selection while telemetry catches up", () => {
    const original = conversation();
    const initial = reconcileFlowNodes(
      [],
      [original],
      null,
      callbacks,
      null,
      [],
      new Set([original.id]),
      true,
    );
    const liveSelection = applyNodeChanges(
      [{ id: original.id, type: "select", selected: true }],
      initial,
    );

    const reconciled = reconcileFlowNodes(
      liveSelection,
      [original],
      null,
      callbacks,
      null,
      [],
      new Set(),
      true,
    );

    expect(reconciled[0].selected).toBe(true);
    expect(reconciled[0].data.tokenSelected).toBe(false);
  });

  it("keeps canonical context selection out of a selected family", () => {
    const active = conversation({ id: "active" });
    const familyRoot = conversation({ id: "family-root" });
    const familyChild = conversation({
      id: "family-child",
      parentIds: [familyRoot.id],
    });
    const reconciled = reconcileFlowNodes(
      [],
      [active, familyRoot, familyChild],
      active.id,
      callbacks,
      null,
      [],
      new Set(),
      false,
      new Set([familyRoot.id, familyChild.id]),
    );

    expect(reconciled.find(({ id }) => id === active.id)).toMatchObject({
      selected: false,
      data: { selected: true, familySelected: false },
    });
    expect(reconciled.find(({ id }) => id === familyRoot.id)).toMatchObject({
      selected: true,
      data: { selected: false, familySelected: true },
    });
    expect(reconciled.find(({ id }) => id === familyChild.id)).toMatchObject({
      selected: true,
      data: { selected: false, familySelected: true },
    });
  });
});

describe("applyCollisionSafeNodeChanges", () => {
  function measuredNodes() {
    const moving = conversation({ position: { x: 0, y: 20 } });
    const obstacle = conversation({
      id: "obstacle",
      position: { x: 500, y: 20 },
    });
    return reconcileFlowNodes(
      [],
      [moving, obstacle],
      moving.id,
      callbacks,
      null,
    ).map((node) => ({
      ...node,
      measured: { width: 340, height: 300 },
    }));
  }

  it("blocks overlap and fast tunneling during a drag", () => {
    const current = measuredNodes();
    const next = applyCollisionSafeNodeChanges(
      [
        {
          id: "node-1",
          type: "position",
          position: { x: 900, y: 20 },
          dragging: true,
        },
      ],
      current,
    );

    expect(next[0].position.x).toBeCloseTo(128, 1);
    expect(next[0].position.y).toBe(20);
  });

  it("allows clear movement and preserves non-position changes", () => {
    const current = measuredNodes();
    const moved = applyCollisionSafeNodeChanges(
      [
        {
          id: "node-1",
          type: "position",
          position: { x: 0, y: 400 },
          dragging: true,
        },
      ],
      current,
    );
    const selected = applyCollisionSafeNodeChanges(
      [{ id: "obstacle", type: "select", selected: true }],
      moved,
    );

    expect(moved[0].position).toEqual({ x: 0, y: 400 });
    expect(selected[1].selected).toBe(true);
  });

  it("moves a selected family rigidly with one collision-safe delta", () => {
    const root = conversation({ id: "root", position: { x: 0, y: 20 } });
    const child = conversation({
      id: "child",
      parentIds: [root.id],
      position: { x: 0, y: 360 },
    });
    const obstacle = conversation({ id: "obstacle", position: { x: 500, y: 20 } });
    const current = reconcileFlowNodes(
      [],
      [root, child, obstacle],
      root.id,
      callbacks,
      null,
      [],
      new Set(),
      false,
      new Set([root.id, child.id]),
    ).map((node) => ({ ...node, measured: { width: 340, height: 300 } }));

    const next = applyCollisionSafeNodeChanges(
      [{
        id: root.id,
        type: "position",
        position: { x: 900, y: 20 },
        dragging: true,
      }],
      current,
      new Set([root.id, child.id]),
    );

    const rootDelta = next[0].position.x - current[0].position.x;
    const childDelta = next[1].position.x - current[1].position.x;
    expect(rootDelta).toBeCloseTo(128, 1);
    expect(childDelta).toBeCloseTo(rootDelta, 5);
    expect(next[2]).toBe(current[2]);
  });

  it("uses one sticky-constrained delta for a mixed selected group", () => {
    const selectedCard = reconcileFlowNodes(
      [],
      [conversation({ id: "card", position: { x: 0, y: 500 } })],
      null,
      callbacks,
      null,
    )[0];
    const notes = reconcileStickyNodes(
      [],
      [sticky(), sticky({ id: "note-2", position: { x: 400, y: 0 } })],
      stickyCallbacks,
      null,
      null,
    );
    const current = [selectedCard, ...notes];
    const next = applyCollisionSafeNodeChanges(
      [{
        id: selectedCard.id,
        type: "position",
        position: { x: 800, y: 500 },
        dragging: true,
      }],
      current,
      new Set([selectedCard.id]),
      new Set([notes[0].id]),
    );

    const cardDelta = next[0].position.x - current[0].position.x;
    const noteDelta = next[1].position.x - current[1].position.x;
    expect(cardDelta).toBeCloseTo(128, 1);
    expect(noteDelta).toBeCloseTo(cardDelta, 5);
    expect(next[2]).toBe(current[2]);
  });

  it("lets sticky notes overlap conversations without cross-group blocking", () => {
    const card = reconcileFlowNodes(
      [],
      [conversation({ position: { x: 400, y: 0 } })],
      null,
      callbacks,
      null,
    )[0];
    const note = reconcileStickyNodes(
      [],
      [sticky()],
      stickyCallbacks,
      null,
      null,
    )[0];
    const next = applyCollisionSafeNodeChanges(
      [{ id: note.id, type: "position", position: { x: 400, y: 0 }, dragging: true }],
      [card, note],
    );

    expect(next.find(({ id }) => id === note.id)?.position).toEqual({ x: 400, y: 0 });
  });

  it("blocks sticky notes against other sticky notes", () => {
    const notes = reconcileStickyNodes(
      [],
      [sticky(), sticky({ id: "note-2", position: { x: 400, y: 0 } })],
      stickyCallbacks,
      null,
      null,
    );
    const next = applyCollisionSafeNodeChanges(
      [{ id: "note-1", type: "position", position: { x: 800, y: 0 }, dragging: true }],
      notes,
    );

    expect(next[0].position.x).toBeCloseTo(128, 1);
    expect(next[0].position.y).toBe(0);
  });

  it("clamps sticky-note resizing before another note", () => {
    const notes = reconcileStickyNodes(
      [],
      [sticky(), sticky({ id: "note-2", position: { x: 300, y: 0 } })],
      stickyCallbacks,
      null,
      null,
    );
    const next = applyCollisionSafeNodeChanges(
      [
        {
          id: "note-1",
          type: "dimensions",
          dimensions: { width: 500, height: 190 },
          setAttributes: true,
          resizing: true,
        },
      ],
      notes,
    );

    expect(next[0].width).toBeCloseTo(268, 1);
    expect(next[0].height).toBe(190);
  });
});

describe("reconcileStickyNodes", () => {
  it("preserves local geometry while updating note content", () => {
    const original = sticky();
    const initial = reconcileStickyNodes(
      [],
      [original],
      stickyCallbacks,
      null,
      original.id,
    );
    const moved = applyNodeChanges(
      [{ id: original.id, type: "position", position: { x: 220, y: 180 }, dragging: true }],
      initial,
    );
    const updated = { ...original, text: "Updated note" };

    const reconciled = reconcileStickyNodes(
      moved,
      [updated],
      stickyCallbacks,
      original.id,
      null,
    );

    expect(reconciled[0].position).toEqual({ x: 220, y: 180 });
    expect(reconciled[0].data.note).toBe(updated);
  });

  it("reuses untouched sticky flow-node identities", () => {
    const first = sticky();
    const second = sticky({ id: "note-2", position: { x: 400, y: 0 } });
    const initial = reconcileStickyNodes(
      [],
      [first, second],
      stickyCallbacks,
      null,
      null,
    );
    const updated = { ...first, color: "pink" as const };
    const reconciled = reconcileStickyNodes(
      initial,
      [updated, second],
      stickyCallbacks,
      null,
      null,
    );

    expect(reconciled[0]).not.toBe(initial[0]);
    expect(reconciled[1]).toBe(initial[1]);
  });

  it("can exclude sticky notes from box selection", () => {
    const reconciled = reconcileStickyNodes(
      [],
      [sticky()],
      stickyCallbacks,
      null,
      null,
      null,
      false,
    );

    expect(reconciled[0].selectable).toBe(false);
    expect(reconciled[0].selected).toBe(false);
  });

  it("marks directly selected sticky notes as group members", () => {
    const reconciled = reconcileStickyNodes(
      [],
      [sticky(), sticky({ id: "note-2" })],
      stickyCallbacks,
      null,
      null,
      null,
      true,
      new Set(["note-2"]),
      true,
    );

    expect(reconciled[0]).toMatchObject({
      selected: false,
      data: { groupSelected: false },
    });
    expect(reconciled[1]).toMatchObject({
      selected: true,
      data: { groupSelected: true },
    });
  });
});

describe("mixed marquee geometry", () => {
  it("converts a panned and zoomed screen rectangle into board coordinates", () => {
    expect(
      screenSelectionToFlowRectangle(
        { x: 120, y: 80, width: 200, height: 100 },
        [20, -20, 2],
      ),
    ).toEqual({ x: 50, y: 50, width: 100, height: 50 });
  });

  it("unions selected flow nodes and translated ink bounds", () => {
    const note = reconcileStickyNodes(
      [],
      [sticky({ position: { x: 10, y: 20 }, size: { width: 100, height: 80 } })],
      stickyCallbacks,
      null,
      null,
    )[0];
    const stroke: InkStroke = {
      id: "stroke-1",
      points: [{ x: 200, y: 220 }, { x: 240, y: 260 }],
      color: "ink",
      width: 4,
      createdAt: 1,
    };

    expect(
      getCanvasSelectionBounds(
        [note],
        [stroke],
        {
          conversationIds: new Set(),
          noteIds: new Set([note.id]),
          strokeIds: new Set([stroke.id]),
        },
        { x: 10, y: -10 },
      ),
    ).toEqual({ x: 10, y: 20, width: 242, height: 232 });
  });
});

describe("nudgeBoardFlowNode", () => {
  it("moves a selection by the requested keyboard delta", () => {
    const original = conversation();
    const nodes = reconcileFlowNodes([], [original], original.id, callbacks, null);
    const next = nudgeBoardFlowNode(nodes, original.id, { x: 8, y: -8 });

    expect(next[0].position).toEqual({ x: 18, y: 12 });
  });

  it("clamps a keyboard nudge before another conversation", () => {
    const first = conversation({ position: { x: 0, y: 0 } });
    const second = conversation({ id: "node-2", position: { x: 380, y: 0 } });
    const nodes = reconcileFlowNodes(
      [],
      [first, second],
      first.id,
      callbacks,
      null,
    );
    const next = nudgeBoardFlowNode(nodes, first.id, { x: 32, y: 0 });

    expect(next[0].position.x).toBeCloseTo(7.99, 4);
    expect(next[1]).toBe(nodes[1]);
  });
});

describe("createConversationEdge", () => {
  it("uses floating geometry while preserving animated edge state", () => {
    const edge = createConversationEdge(
      conversation({
        id: "streaming-child",
        parentIds: ["parent"],
        status: "streaming",
      }),
      "parent",
    );

    expect(edge).toMatchObject({
      id: "parent-streaming-child",
      source: "parent",
      target: "streaming-child",
      type: "floating",
      animated: true,
      selectable: false,
      className: "",
    });
  });

  it("retains muted, draft, and merge classes", () => {
    const edge = createConversationEdge(
      conversation({
        id: "merged-draft",
        parentIds: ["parent-a", "parent-b"],
        muted: true,
        status: "draft",
      }),
      "parent-a",
    );

    expect(edge.type).toBe("floating");
    expect(edge.animated).toBe(false);
    expect(edge.className).toBe("muted-edge draft-edge merge-edge");
  });

  it("adds the target node color without losing other edge states", () => {
    const edge = createConversationEdge(
      conversation({
        id: "colored-child",
        parentIds: ["parent"],
        color: "cyan",
        muted: true,
      }),
      "parent",
    );

    expect(edge.className).toBe("muted-edge conversation-color-cyan");
  });
});
