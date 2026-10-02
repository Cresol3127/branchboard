export type NodeStatus = "draft" | "streaming" | "complete" | "error";

export type ProviderId =
  | "gemini"
  | "openai"
  | "anthropic"
  | "ollama-cloud"
  | "local";

export type LocalApiFormat = "ollama" | "openai-compatible";
export type ThemePreference = "system" | "light" | "dark";
export type ReadingFontStyle =
  | "branchboard"
  | "sans"
  | "humanist"
  | "serif"
  | "mono";

export type GenerationMetrics = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs: number;
  tokensEstimated?: boolean;
};

export type AttachmentKind = "image" | "video" | "pdf" | "text" | "file";

export type AttachmentRef = {
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
};

export type StickyColor = "yellow" | "pink" | "blue" | "green" | "neutral";
export type PenColor = "ink" | "acid" | "red" | "blue" | "violet";
export type ConversationColor =
  | "coral"
  | "amber"
  | "green"
  | "cyan"
  | "blue"
  | "violet"
  | "pink";

export type StickyNote = {
  id: string;
  text: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  color: StickyColor;
  createdAt: number;
  updatedAt: number;
};

export type InkPoint = {
  x: number;
  y: number;
  pressure?: number;
};

export type InkStroke = {
  id: string;
  points: InkPoint[];
  color: PenColor;
  width: number;
  createdAt: number;
};

export type BoardViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type ConversationNode = {
  id: string;
  parentIds: string[];
  prompt: string;
  response: string;
  muted: boolean;
  status: NodeStatus;
  error?: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  createdAt: number;
  provider?: ProviderId;
  model?: string;
  metrics?: GenerationMetrics;
  attachments?: AttachmentRef[];
  color?: ConversationColor;
};

export type Workspace = {
  nodes: ConversationNode[];
  notes: StickyNote[];
  strokes: InkStroke[];
  selectedNodeId: string | null;
  viewport?: BoardViewport;
};

export type Whiteboard = Workspace & {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type WhiteboardCollection = {
  version: 1;
  boards: Whiteboard[];
  activeBoardId: string;
};

export type ProviderConfig = {
  apiKey: string;
  model: string;
};

export type LocalProviderConfig = ProviderConfig & {
  apiFormat: LocalApiFormat;
  endpoint: string;
};

export type Settings = {
  version: 2;
  provider: ProviderId;
  providers: {
    gemini: ProviderConfig;
    openai: ProviderConfig;
    anthropic: ProviderConfig;
    "ollama-cloud": ProviderConfig;
    local: LocalProviderConfig;
  };
  theme: ThemePreference;
  readingFontStyle: ReadingFontStyle;
  readingFontSizePx: number;
};

export const DEFAULT_SETTINGS: Settings = {
  version: 2,
  provider: "gemini",
  providers: {
    gemini: { apiKey: "", model: "gemini-2.5-flash" },
    openai: { apiKey: "", model: "gpt-4.1-mini" },
    anthropic: { apiKey: "", model: "claude-sonnet-4-5" },
    "ollama-cloud": { apiKey: "", model: "" },
    local: {
      apiKey: "",
      model: "",
      apiFormat: "ollama",
      endpoint: "http://localhost:11434",
    },
  },
  theme: "system",
  readingFontStyle: "branchboard",
  readingFontSizePx: 12,
};

export const EMPTY_WORKSPACE: Workspace = {
  nodes: [],
  notes: [],
  strokes: [],
  selectedNodeId: null,
};
