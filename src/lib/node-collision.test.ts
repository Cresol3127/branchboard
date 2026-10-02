import { describe, expect, it } from "vitest";
import type { ConversationNode } from "../types";
import {
  clampGroupDeltaBeforeCollision,
  clampPositionBeforeCollision,
  clampSharedDeltaBeforeCollision,
  clampSizeBeforeCollision,
  estimateConversationNodeHeight,
  findCollisionFreePosition,
  findPositionForNewNode,
  findPositionForSiblingNode,
  getConversationNodeBounds,
  hasNodeCollision,
  type NodeBounds,
} from "./node-collision";

const obstacle: NodeBounds = {
  id: "obstacle",
  x: 400,
  y: 100,
  width: 340,
  height: 300,
};

function conversation(overrides: Partial<ConversationNode> = {}): ConversationNode {
  return {
    id: "node",
    parentIds: [],
    prompt: "Prompt",
    response: "Response",
    muted: false,
    status: "complete",
    position: { x: 10, y: 20 },
    createdAt: 1,
    ...overrides,
  };
}

describe("node collision geometry", () => {
  it("keeps a preferred clear position unchanged", () => {
    expect(
      findCollisionFreePosition(
        { x: 0, y: 100 },
        { width: 300, height: 240 },
        [obstacle],
      ),
    ).toEqual({ x: 0, y: 100 });
  });

  it("finds the nearest clear horizontal slot around crowded nodes", () => {
    const position = findCollisionFreePosition(
      { x: 420, y: 100 },
      { width: 340, height: 300 },
      [
        obstacle,
        { id: "right", x: 772, y: 100, width: 340, height: 300 },
      ],
    );

    expect(position).toEqual({ x: 28, y: 100 });
    expect(hasNodeCollision(position, { width: 340, height: 300 }, [obstacle])).toBe(false);
  });

  it("places right-biased roots beyond every obstacle", () => {
    expect(
      findCollisionFreePosition(
        { x: 400, y: 20 },
        { width: 340, height: 300 },
        [
          { ...obstacle, y: 20 },
          { id: "moved-child", x: 772, y: 0, width: 520, height: 500 },
        ],
        "right",
      ),
    ).toEqual({ x: 1324, y: 20 });
  });

  it("checks new roots against non-root nodes on the root row", () => {
    const root = conversation({ id: "root", position: { x: 0, y: 20 } });
    const movedChild = conversation({
      id: "child",
      parentIds: [root.id],
      position: { x: 420, y: 20 },
    });
    const bounds = [
      { id: root.id, x: 0, y: 20, width: 340, height: 300 },
      { id: movedChild.id, x: 420, y: 20, width: 520, height: 400 },
    ];

    expect(
      findPositionForNewNode(
        [root, movedChild],
        bounds,
        null,
        { width: 340, height: 300 },
      ),
    ).toEqual({ x: 972, y: 20 });
  });

  it("moves a new child away from an unrelated branch obstacle", () => {
    const parent = conversation({ id: "parent", position: { x: 0, y: 0 } });
    const unrelated = conversation({ id: "unrelated", position: { x: 0, y: 440 } });
    const bounds = [
      { id: parent.id, x: 0, y: 0, width: 340, height: 300 },
      { id: unrelated.id, x: 0, y: 440, width: 340, height: 300 },
    ];
    const position = findPositionForNewNode(
      [parent, unrelated],
      bounds,
      parent.id,
      { width: 340, height: 300 },
    );

    expect(position).toEqual({ x: 372, y: 440 });
  });

  it("places a retry beside its source without changing graph depth", () => {
    const bounds = [
      { id: "source", x: 100, y: 440, width: 340, height: 300 },
      { id: "occupied", x: 472, y: 440, width: 340, height: 300 },
    ];

    expect(
      findPositionForSiblingNode(
        bounds,
        "source",
        { width: 340, height: 300 },
      ),
    ).toEqual({ x: 844, y: 440 });
  });

  it("uses measured visual dimensions and positions over persisted fallbacks", () => {
    const node = conversation({ size: { width: 500, height: 600 } });
    expect(
      getConversationNodeBounds(
        [node],
        [
          {
            id: node.id,
            position: { x: 90, y: 120 },
            width: 500,
            measured: { width: 510, height: 610 },
          },
        ],
      ),
    ).toEqual([{ id: node.id, x: 90, y: 120, width: 510, height: 610 }]);
  });

  it("estimates drafts and media prompts conservatively", () => {
    expect(
      estimateConversationNodeHeight(
        { prompt: "", response: "", status: "draft" },
        340,
      ),
    ).toBe(230);
    expect(
      estimateConversationNodeHeight(
        {
          prompt: "Inspect this",
          response: "",
          status: "streaming",
          attachments: [
            {
              id: "image",
              kind: "image",
              name: "photo.png",
              mimeType: "image/png",
              size: 10,
              createdAt: 1,
            },
          ],
        },
        520,
      ),
    ).toBeGreaterThanOrEqual(500);
  });

  it("clamps a drag at the first obstacle instead of tunneling through it", () => {
    const position = clampPositionBeforeCollision(
      { x: 0, y: 100 },
      { x: 900, y: 100 },
      { width: 300, height: 240 },
      [obstacle],
    );

    expect(position.x).toBeCloseTo(68, 1);
    expect(position.y).toBe(100);
    expect(hasNodeCollision(position, { width: 300, height: 240 }, [obstacle])).toBe(false);
  });

  it("allows a legacy overlapping node to be dragged directly into clear space", () => {
    expect(
      clampPositionBeforeCollision(
        { x: 420, y: 120 },
        { x: 0, y: 500 },
        { width: 300, height: 240 },
        [obstacle],
      ),
    ).toEqual({ x: 0, y: 500 });
  });

  it("clamps a rigid group with one shared collision-safe delta", () => {
    const delta = clampGroupDeltaBeforeCollision(
      [
        { id: "a", x: 0, y: 0, width: 100, height: 100 },
        { id: "b", x: 140, y: 0, width: 100, height: 100 },
      ],
      { x: 200, y: 0 },
      [{ id: "wall", x: 300, y: 0, width: 100, height: 100 }],
      0,
    );

    expect(delta.x).toBeCloseTo(60, 1);
    expect(delta.y).toBe(0);
  });

  it("keeps a clear rigid-group movement unchanged", () => {
    expect(
      clampGroupDeltaBeforeCollision(
        [{ id: "a", x: 0, y: 0, width: 100, height: 100 }],
        { x: 25, y: 40 },
        [{ id: "far", x: 500, y: 500, width: 100, height: 100 }],
      ),
    ).toEqual({ x: 25, y: 40 });
  });

  it("lets a legacy overlapping rigid group move only into clear space", () => {
    const moving = [{ id: "a", x: 420, y: 120, width: 100, height: 100 }];

    expect(
      clampGroupDeltaBeforeCollision(
        moving,
        { x: -420, y: 380 },
        [obstacle],
      ),
    ).toEqual({ x: -420, y: 380 });
    expect(
      clampGroupDeltaBeforeCollision(
        moving,
        { x: 10, y: 0 },
        [obstacle],
      ),
    ).toEqual({ x: 0, y: 0 });
  });

  it("keeps clear movement unchanged across collision channels", () => {
    expect(
      clampSharedDeltaBeforeCollision(
        [
          {
            moving: [
              { id: "conversation", x: 0, y: 0, width: 100, height: 100 },
            ],
            obstacles: [
              { id: "conversation-far", x: 500, y: 500, width: 100, height: 100 },
            ],
          },
          {
            moving: [{ id: "sticky", x: 0, y: 200, width: 100, height: 100 }],
            obstacles: [
              { id: "sticky-far", x: 600, y: 600, width: 100, height: 100 },
            ],
          },
        ],
        { x: 40, y: 20 },
        0,
      ),
    ).toEqual({ x: 40, y: 20 });
  });

  it("uses a conversation channel's shorter safe progress for every channel", () => {
    const delta = clampSharedDeltaBeforeCollision(
      [
        {
          moving: [
            { id: "conversation", x: 0, y: 0, width: 100, height: 100 },
          ],
          obstacles: [
            { id: "conversation-wall", x: 300, y: 0, width: 100, height: 300 },
          ],
        },
        {
          moving: [{ id: "sticky", x: 0, y: 0, width: 100, height: 100 }],
          obstacles: [
            { id: "sticky-wall", x: 400, y: 0, width: 100, height: 300 },
          ],
        },
      ],
      { x: 400, y: 200 },
      0,
    );

    expect(delta.x).toBeCloseTo(200, 1);
    expect(delta.y).toBeCloseTo(100, 1);
  });

  it("uses a sticky channel's shorter safe progress for every channel", () => {
    const delta = clampSharedDeltaBeforeCollision(
      [
        {
          moving: [
            { id: "conversation", x: 0, y: 0, width: 100, height: 100 },
          ],
          obstacles: [
            { id: "conversation-wall", x: 300, y: 0, width: 100, height: 300 },
          ],
        },
        {
          moving: [{ id: "sticky", x: 0, y: 0, width: 100, height: 100 }],
          obstacles: [
            { id: "sticky-wall", x: 200, y: 0, width: 100, height: 300 },
          ],
        },
      ],
      { x: 400, y: 200 },
      0,
    );

    expect(delta.x).toBeCloseTo(100, 1);
    expect(delta.y).toBeCloseTo(50, 1);
  });

  it("does not constrain ink-only movement or channels without moving bounds", () => {
    const requested = { x: -80, y: 30 };

    expect(clampSharedDeltaBeforeCollision([], requested)).toEqual(requested);
    expect(
      clampSharedDeltaBeforeCollision(
        [{ moving: [], obstacles: [obstacle] }],
        requested,
      ),
    ).toEqual(requested);
  });

  it("preserves zero and legacy-overlap group behavior across channels", () => {
    const channel = {
      moving: [{ id: "legacy", x: 100, y: 100, width: 100, height: 100 }],
      obstacles: [
        { id: "legacy-wall", x: 100, y: 100, width: 100, height: 100 },
      ],
    };

    expect(clampSharedDeltaBeforeCollision([channel], { x: 0, y: 0 }, 0)).toEqual({
      x: 0,
      y: 0,
    });
    expect(
      clampSharedDeltaBeforeCollision([channel], { x: -300, y: 0 }, 0),
    ).toEqual({ x: -300, y: 0 });
    expect(
      clampSharedDeltaBeforeCollision([channel], { x: 10, y: 0 }, 0),
    ).toEqual({ x: 0, y: 0 });
  });

  it("clamps a resize to the largest collision-free size", () => {
    const size = clampSizeBeforeCollision(
      { x: 0, y: 100 },
      { width: 200, height: 200 },
      { width: 600, height: 200 },
      [obstacle],
    );

    expect(size.width).toBeCloseTo(368, 1);
    expect(size.height).toBe(200);
    expect(
      hasNodeCollision(
        { x: 0, y: 100 },
        size,
        [obstacle],
      ),
    ).toBe(false);
  });
});
