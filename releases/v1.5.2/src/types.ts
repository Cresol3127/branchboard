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
  autoSize?: boolean;
  error?: string;
  provider?: ProviderId;
  model?: string;
  contextInclude?: string[];
  contextExclude?: string[];
  contextTokenLimit?: number;
  portPositions?: { source?: { x: number; y: number }; target?: { x: number; y: number } };
};
export type BoardNode = Node<NodeData, 'chat' | 'note' | 'group'>;
export type AnnotationLayer = { id: string; name: string; visible: boolean; locked: boolean };
export type Annotation = {
  id: string;
  layerId: string;
  kind: 'pen' | 'rectangle' | 'ellipse' | 'arrow' | 'highlight';
  points: { x: number; y: number }[];
  color: string;
  width: number;
};
export type AnnotationState = { layers: AnnotationLayer[]; items: Annotation[] };
export type Board = {
  id: string;
  name: string;
  nodes: BoardNode[];
  edges: Edge[];
  updatedAt: number;
  viewport?: Viewport;
  annotations?: AnnotationState;
};

export type Snapshot = { id: string; name: string; createdAt: number; board: Board };
export type WorkspaceFolder = { id: string; name: string; parentId?: string };
export type CanvasTemplate = { id: string; name: string; createdAt: number; board: Board };
export type WorkspaceOrganization = {
  folders: WorkspaceFolder[];
  boardFolders: Record<string, string>;
  favoriteBoardIds: string[];
  templates: CanvasTemplate[];
};
export type WorkspaceBackup = {
  version: 1;
  kind: 'workspace';
  boards: Board[];
  currentId: string;
  snapshots: Snapshot[];
  organization: WorkspaceOrganization;
};
