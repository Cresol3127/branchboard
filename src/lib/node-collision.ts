import type { XYPosition } from "@xyflow/react";
import type { ConversationNode } from "../types";
import { getConversationNodeWidth, NODE_HORIZONTAL_GAP } from "./node-sizing";

export const NODE_COLLISION_GAP = 32;
export const ESTIMATED_NODE_HEIGHT = 300;

export type NodeSize = {
  width: number;
  height: number;
};

export type NodeBounds = NodeSize & XYPosition & {
  id: string;
};

export type CollisionChannel = {
  moving: readonly NodeBounds[];
  obstacles: readonly NodeBounds[];
};

export type VisualNodeGeometry = {
  id: string;
  position: XYPosition;
  width?: number;
  height?: number;
  measured?: {
    width?: number;
    height?: number;
  };
};

type PlacementDirection = "nearest" | "right";

function positiveDimension(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

export function estimateConversationNodeHeight(
  node: Pick<ConversationNode, "prompt" | "response" | "status"> &
    Partial<Pick<ConversationNode, "attachments">>,
  width: number,
): number {
  if (node.status === "draft") return 230;

  const charactersPerLine = Math.max(24, Math.floor((width - 32) / 7));
  const textLength = node.prompt.length + node.response.length;
  const textHeight = Math.ceil(textLength / charactersPerLine) * 20;
  const attachments = node.attachments ?? [];
  const hasMedia = attachments.some(
    (attachment) => attachment.kind === "image" || attachment.kind === "video",
  );
  const attachmentHeight = hasMedia
    ? 320
    : attachments.length
      ? Math.ceil(attachments.length / 2) * 72
      : 0;

  return Math.min(900, Math.max(ESTIMATED_NODE_HEIGHT, 190 + textHeight + attachmentHeight));
}

export function getConversationNodeBounds(
  conversations: ConversationNode[],
  visualNodes: readonly VisualNodeGeometry[] = [],
): NodeBounds[] {
  const visualById = new Map(visualNodes.map((node) => [node.id, node]));

  return conversations.map((conversation) => {
    const visual = visualById.get(conversation.id);
    const width =
      positiveDimension(visual?.measured?.width) ??
      positiveDimension(visual?.width) ??
      getConversationNodeWidth(conversation);
    const height =
      positiveDimension(visual?.measured?.height) ??
      positiveDimension(visual?.height) ??
      positiveDimension(conversation.size?.height) ??
      estimateConversationNodeHeight(conversation, width);

    return {
      id: conversation.id,
      x: visual?.position.x ?? conversation.position.x,
      y: visual?.position.y ?? conversation.position.y,
      width,
      height,
    };
  });
}

export function boundsOverlap(
  first: Omit<NodeBounds, "id">,
  second: Omit<NodeBounds, "id">,
  gap = NODE_COLLISION_GAP,
): boolean {
  return (
    first.x < second.x + second.width + gap &&
    first.x + first.width + gap > second.x &&
    first.y < second.y + second.height + gap &&
    first.y + first.height + gap > second.y
  );
}

export function hasNodeCollision(
  position: XYPosition,
  size: NodeSize,
  obstacles: readonly NodeBounds[],
  gap = NODE_COLLISION_GAP,
): boolean {
  const candidate = { ...position, ...size };
  return obstacles.some((obstacle) => boundsOverlap(candidate, obstacle, gap));
}

export function findCollisionFreePosition(
  preferred: XYPosition,
  size: NodeSize,
  obstacles: readonly NodeBounds[],
  direction: PlacementDirection = "nearest",
  gap = NODE_COLLISION_GAP,
): XYPosition {
  if (!hasNodeCollision(preferred, size, obstacles, gap)) return preferred;

  const candidates = new Set<number>([preferred.x]);
  for (const obstacle of obstacles) {
    candidates.add(obstacle.x - gap - size.width);
    candidates.add(obstacle.x + obstacle.width + gap);
  }

  const ordered = [...candidates]
    .filter((x) => direction !== "right" || x >= preferred.x)
    .sort((first, second) => {
      const distance = Math.abs(first - preferred.x) - Math.abs(second - preferred.x);
      if (distance !== 0) return distance;
      return second - first;
    });

  for (const x of ordered) {
    const candidate = { x, y: preferred.y };
    if (!hasNodeCollision(candidate, size, obstacles, gap)) return candidate;
  }

  const rightmost = obstacles.reduce(
    (edge, obstacle) => Math.max(edge, obstacle.x + obstacle.width),
    preferred.x,
  );
  return { x: rightmost + gap, y: preferred.y };
}

export function findPositionForNewNode(
  conversations: ConversationNode[],
  bounds: readonly NodeBounds[],
  sourceId: string | null,
  size: NodeSize,
): XYPosition {
  const boundsById = new Map(bounds.map((node) => [node.id, node]));

  if (!sourceId) {
    const roots = conversations
      .filter((node) => node.parentIds.length === 0)
      .map((node) => boundsById.get(node.id))
      .filter((node): node is NodeBounds => Boolean(node));
    const rightEdge = roots.reduce(
      (rightmost, node) => Math.max(rightmost, node.x + node.width),
      -NODE_HORIZONTAL_GAP,
    );
    const preferred = {
      x: roots.length ? rightEdge + NODE_HORIZONTAL_GAP : 0,
      y: 20,
    };
    return findCollisionFreePosition(preferred, size, bounds, "right");
  }

  const parent = boundsById.get(sourceId);
  if (!parent) {
    return findCollisionFreePosition({ x: 0, y: 20 }, size, bounds, "right");
  }
  const siblings = conversations
    .filter((node) => node.parentIds.includes(sourceId))
    .map((node) => boundsById.get(node.id))
    .filter((node): node is NodeBounds => Boolean(node));
  const direction = siblings.length % 2 === 1 ? 1 : -1;
  const centeredX = parent.x + (parent.width - size.width) / 2;
  let x = centeredX;

  if (siblings.length > 0 && direction > 0) {
    x = Math.max(...siblings.map((node) => node.x + node.width)) + NODE_HORIZONTAL_GAP;
  } else if (siblings.length > 0) {
    x = Math.min(...siblings.map((node) => node.x)) - size.width - NODE_HORIZONTAL_GAP;
  }

  const preferred = {
    x,
    y: parent.y + Math.max(440, parent.height + 100),
  };
  return findCollisionFreePosition(preferred, size, bounds);
}

export function findPositionForSiblingNode(
  bounds: readonly NodeBounds[],
  sourceId: string,
  size: NodeSize,
): XYPosition {
  const source = bounds.find((node) => node.id === sourceId);
  if (!source) {
    return findCollisionFreePosition({ x: 0, y: 20 }, size, bounds, "right");
  }

  return findCollisionFreePosition(
    {
      x: source.x + source.width + NODE_HORIZONTAL_GAP,
      y: source.y,
    },
    size,
    bounds,
  );
}

function sweptCollisionTime(
  start: Omit<NodeBounds, "id">,
  delta: XYPosition,
  obstacle: NodeBounds,
  gap: number,
): number | null {
  const left = obstacle.x - gap;
  const right = obstacle.x + obstacle.width + gap;
  const top = obstacle.y - gap;
  const bottom = obstacle.y + obstacle.height + gap;

  let xEntry: number;
  let xExit: number;
  if (delta.x > 0) {
    xEntry = (left - (start.x + start.width)) / delta.x;
    xExit = (right - start.x) / delta.x;
  } else if (delta.x < 0) {
    xEntry = (right - start.x) / delta.x;
    xExit = (left - (start.x + start.width)) / delta.x;
  } else if (start.x + start.width <= left || start.x >= right) {
    return null;
  } else {
    xEntry = Number.NEGATIVE_INFINITY;
    xExit = Number.POSITIVE_INFINITY;
  }

  let yEntry: number;
  let yExit: number;
  if (delta.y > 0) {
    yEntry = (top - (start.y + start.height)) / delta.y;
    yExit = (bottom - start.y) / delta.y;
  } else if (delta.y < 0) {
    yEntry = (bottom - start.y) / delta.y;
    yExit = (top - (start.y + start.height)) / delta.y;
  } else if (start.y + start.height <= top || start.y >= bottom) {
    return null;
  } else {
    yEntry = Number.NEGATIVE_INFINITY;
    yExit = Number.POSITIVE_INFINITY;
  }

  const entry = Math.max(xEntry, yEntry);
  const exit = Math.min(xExit, yExit);
  return entry <= exit && exit >= 0 && entry >= 0 && entry <= 1
    ? entry
    : null;
}

export function clampPositionBeforeCollision(
  previous: XYPosition,
  requested: XYPosition,
  size: NodeSize,
  obstacles: readonly NodeBounds[],
  gap = NODE_COLLISION_GAP,
): XYPosition {
  const start = { ...previous, ...size };
  const requestedCollides = hasNodeCollision(requested, size, obstacles, gap);
  if (hasNodeCollision(previous, size, obstacles, gap)) {
    return requestedCollides ? previous : requested;
  }

  const delta = {
    x: requested.x - previous.x,
    y: requested.y - previous.y,
  };
  if (delta.x === 0 && delta.y === 0) return previous;

  let earliest = Number.POSITIVE_INFINITY;
  for (const obstacle of obstacles) {
    const collision = sweptCollisionTime(start, delta, obstacle, gap);
    if (collision !== null) earliest = Math.min(earliest, collision);
  }
  if (!Number.isFinite(earliest)) return requested;

  const movement = Math.max(Math.abs(delta.x), Math.abs(delta.y), 1);
  const safeTime = Math.max(0, earliest - 0.01 / movement);
  return {
    x: previous.x + delta.x * safeTime,
    y: previous.y + delta.y * safeTime,
  };
}

export function clampGroupDeltaBeforeCollision(
  moving: readonly NodeBounds[],
  requestedDelta: XYPosition,
  obstacles: readonly NodeBounds[],
  gap = NODE_COLLISION_GAP,
): XYPosition {
  if ((!requestedDelta.x && !requestedDelta.y) || !moving.length) {
    return { x: 0, y: 0 };
  }

  const startsOverlapping = moving.some((member) =>
    obstacles.some((obstacle) => boundsOverlap(member, obstacle, gap)),
  );
  if (startsOverlapping) {
    const requestedOverlaps = moving.some((member) =>
      obstacles.some((obstacle) =>
        boundsOverlap(
          {
            ...member,
            x: member.x + requestedDelta.x,
            y: member.y + requestedDelta.y,
          },
          obstacle,
          gap,
        ),
      ),
    );
    return requestedOverlaps ? { x: 0, y: 0 } : requestedDelta;
  }

  let earliest = Number.POSITIVE_INFINITY;
  for (const member of moving) {
    for (const obstacle of obstacles) {
      const collision = sweptCollisionTime(member, requestedDelta, obstacle, gap);
      if (collision !== null) earliest = Math.min(earliest, collision);
    }
  }
  if (!Number.isFinite(earliest)) return requestedDelta;

  const movement = Math.max(
    Math.abs(requestedDelta.x),
    Math.abs(requestedDelta.y),
    1,
  );
  const safeTime = Math.max(0, earliest - 0.01 / movement);
  return {
    x: requestedDelta.x * safeTime,
    y: requestedDelta.y * safeTime,
  };
}

export function clampSharedDeltaBeforeCollision(
  channels: readonly CollisionChannel[],
  requestedDelta: XYPosition,
  gap = NODE_COLLISION_GAP,
): XYPosition {
  if (!requestedDelta.x && !requestedDelta.y) return { x: 0, y: 0 };

  const requestedDistanceSquared =
    requestedDelta.x ** 2 + requestedDelta.y ** 2;
  let safeProgress = 1;

  for (const channel of channels) {
    if (!channel.moving.length) continue;

    const safeDelta = clampGroupDeltaBeforeCollision(
      channel.moving,
      requestedDelta,
      channel.obstacles,
      gap,
    );
    const progress =
      (safeDelta.x * requestedDelta.x + safeDelta.y * requestedDelta.y) /
      requestedDistanceSquared;
    safeProgress = Math.min(safeProgress, Math.max(0, progress));
  }

  return {
    x: requestedDelta.x * safeProgress,
    y: requestedDelta.y * safeProgress,
  };
}

export function clampSizeBeforeCollision(
  position: XYPosition,
  previous: NodeSize,
  requested: NodeSize,
  obstacles: readonly NodeBounds[],
  gap = NODE_COLLISION_GAP,
): NodeSize {
  if (!hasNodeCollision(position, requested, obstacles, gap)) return requested;
  if (hasNodeCollision(position, previous, obstacles, gap)) return previous;

  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const ratio = (low + high) / 2;
    const candidate = {
      width: previous.width + (requested.width - previous.width) * ratio,
      height: previous.height + (requested.height - previous.height) * ratio,
    };
    if (hasNodeCollision(position, candidate, obstacles, gap)) high = ratio;
    else low = ratio;
  }

  return {
    width: previous.width + (requested.width - previous.width) * low,
    height: previous.height + (requested.height - previous.height) * low,
  };
}
