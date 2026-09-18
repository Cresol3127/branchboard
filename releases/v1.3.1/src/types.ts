import type { Edge, Node, Viewport } from '@xyflow/react';
import type { ProviderId } from './providers';

export type Message = { id: string; role: 'user' | 'assistant' | 'system'; content: string };
export type NodeData = {
  title: string;
  color: string;
  note: string;
  messages: Message[];
  collapsed?: boolean;
  expandedHeight?: number;
  error?: string;
  provider?: ProviderId;
  model?: string;
  contextInclude?: string[];
  contextExclude?: string[];
  contextTokenLimit?: number;
  portPositions?: { source?: { x: number; y: number }; target?: { x: number; y: number } };
};
export type BoardNode = Node<NodeData, 'chat' | 'note' | 'group'>;
export type Board = {
  id: string;
  name: string;
  nodes: BoardNode[];
  edges: Edge[];
  updatedAt: number;
  viewport?: Viewport;
};
