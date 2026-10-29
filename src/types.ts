import type { Edge, Node, Viewport } from '@xyflow/react';
import type { ProviderId } from './providers';

export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  generation?: {
    provider: ProviderId;
    model: string;
    usage: TokenUsage;
    status: 'completed' | 'cancelled' | 'failed';
  };
};
export type AttachmentKind = 'image' | 'pdf' | 'audio' | 'video' | 'text' | 'document' | 'code';
export type AttachmentExtraction = {
  status: 'pending' | 'ready' | 'unsupported' | 'error';
  characters?: number;
  pages?: number;
  engine?: string;
  truncated?: boolean;
  error?: string;
};
/** Workspace metadata only. File bytes and extracted text live in IndexedDB. */
export type Attachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  hash: string;
  createdAt: number;
  enabled: boolean;
  extraction: AttachmentExtraction;
};
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
  maxOutputTokens?: number;
  portPositions?: { source?: { x: number; y: number }; target?: { x: number; y: number } };
  /** Stable conversation-family root; inherited through the DAG and remapped only for copies. */
  familyId?: string;
  familyColor?: string;
  /** Manual chat color. An absent value means inherit the family color. */
  colorOverride?: string;
  attachments?: Attachment[];
  ragCollectionId?: string;
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
  createdAt?: number;
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

/** Normalized usage. `source` says whether the provider reported it or we estimated it. */
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  source: 'provider' | 'estimated';
  detail?: string;
};
export type GenerationRecord = {
  id: string;
  boardId: string;
  nodeId: string;
  provider: ProviderId;
  model: string;
  kind: 'chat' | 'comparison' | 'summary' | 'workflow' | 'embedding';
  startedAt: number;
  endedAt: number;
  status: 'completed' | 'cancelled' | 'failed';
  usage: TokenUsage;
  cost: number | null;
  currency: string;
  priceId?: string;
  error?: string;
};
export type ModelPrice = {
  id: string;
  provider: ProviderId;
  model: string;
  currency: string;
  inputPerMillion: number;
  outputPerMillion: number;
  updatedAt: number;
};
export type BudgetScope = 'workspace' | 'provider' | 'board' | 'node';
export type BudgetPeriod = 'total' | 'day' | 'month';
export type Budget = {
  id: string;
  name: string;
  scope: BudgetScope;
  targetId?: string;
  period: BudgetPeriod;
  limit: number;
  currency: string;
  /** With strict enabled, a request is blocked when its cost cannot be priced. */
  strict: boolean;
};
export type UsageState = {
  records: GenerationRecord[];
  prices: ModelPrice[];
  budgets: Budget[];
};

export type PromptTemplate = {
  id: string;
  name: string;
  description: string;
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

export type WorkflowStep = {
  id: string;
  name: string;
  prompt: string;
  provider?: ProviderId;
  model?: string;
  maxOutputTokens?: number;
};
export type Workflow = {
  id: string;
  name: string;
  boardId: string;
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
};
export type WorkflowRunStep = {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  output: string;
  error?: string;
};
export type WorkflowRun = {
  id: string;
  workflowId: string;
  boardId: string;
  startedAt: number;
  endedAt?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  steps: WorkflowRunStep[];
};

export type RagSource = { nodeId: string; attachmentId?: string; label: string };
export type RagCollection = {
  id: string;
  name: string;
  boardId: string;
  provider: ProviderId;
  model: string;
  dimensions: number;
  sources: RagSource[];
  createdAt: number;
  updatedAt: number;
  chunkCount: number;
  status: 'ready' | 'stale';
};
export type RagState = {
  collections: RagCollection[];
  error: string;
};
export type OnboardingState = {
  completed: boolean;
  dismissed: boolean;
  completedAt?: number;
};

export type WorkspaceBackup = {
  version: 1;
  kind: 'workspace';
  boards: Board[];
  currentId: string;
  snapshots: Snapshot[];
  organization: WorkspaceOrganization;
  usage?: UsageState;
  prompts?: PromptTemplate[];
  workflows?: Workflow[];
  rag?: RagState;
  onboarding?: OnboardingState;
};
