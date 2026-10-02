import {
  BaseEdge,
  getBezierPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";
import { memo } from "react";
import {
  getFloatingConnection,
  type FloatingNodeRect,
} from "../lib/floating-edge";
import type { ConversationFlowNode } from "./ConversationCard";

export type FloatingConversationEdge = Edge<Record<string, never>, "floating">;

function rectFromInternalNode(
  node: InternalNode<ConversationFlowNode> | undefined,
): FloatingNodeRect | null {
  const width = node?.measured.width ?? node?.width;
  const height = node?.measured.height ?? node?.height;
  if (!node || !width || !height) return null;

  return {
    ...node.internals.positionAbsolute,
    width,
    height,
  };
}

function FloatingEdgeView({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  style,
  interactionWidth,
}: EdgeProps<FloatingConversationEdge>) {
  const sourceNode = useInternalNode<ConversationFlowNode>(source);
  const targetNode = useInternalNode<ConversationFlowNode>(target);
  const sourceRect = rectFromInternalNode(sourceNode);
  const targetRect = rectFromInternalNode(targetNode);
  const connection =
    sourceRect && targetRect
      ? getFloatingConnection(sourceRect, targetRect)
      : null;
  const [path] = getBezierPath({
    sourceX: connection?.source.x ?? sourceX,
    sourceY: connection?.source.y ?? sourceY,
    sourcePosition: connection?.source.position ?? sourcePosition,
    targetX: connection?.target.x ?? targetX,
    targetY: connection?.target.y ?? targetY,
    targetPosition: connection?.target.position ?? targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      markerStart={markerStart}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={interactionWidth}
    />
  );
}

export const FloatingEdge = memo(FloatingEdgeView);
