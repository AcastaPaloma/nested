// Types for the No-Code Builder Canvas

export type BlockType =
  | "page"
  | "feature"
  | "api"
  | "tool"
  | "design"
  | "custom";

export type BlockStatus = "draft" | "ready" | "building" | "complete";

export interface BuilderBlock {
  id: string;
  type: BlockType;
  title: string;
  description: string;
  properties: Record<string, string | boolean | number>;
  status: BlockStatus;
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

export interface BuilderEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface BuilderCanvas {
  id: string;
  name: string;
  description?: string;
  blocks: BuilderBlock[];
  edges: BuilderEdge[];
  createdAt: number;
  updatedAt: number;
}

// Block type configurations
export const BLOCK_CONFIGS: Record<BlockType, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  defaultProperties: Record<string, string | boolean | number>;
}> = {
  page: {
    label: "Page",
    icon: "📄",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    defaultProperties: {
      route: "/",
      layout: "default",
      auth: false,
    },
  },
  feature: {
    label: "Feature",
    icon: "⚡",
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    defaultProperties: {
      priority: "medium",
      complexity: "medium",
    },
  },
  api: {
    label: "API / Backend",
    icon: "🔌",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    defaultProperties: {
      method: "GET",
      endpoint: "/api/",
      auth: true,
    },
  },
  tool: {
    label: "Tool / Integration",
    icon: "🔧",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    defaultProperties: {
      service: "",
      apiKey: false,
    },
  },
  design: {
    label: "Design Note",
    icon: "🎨",
    color: "text-pink-700",
    bgColor: "bg-pink-50",
    borderColor: "border-pink-200",
    defaultProperties: {
      style: "",
      component: "",
    },
  },
  custom: {
    label: "Custom Block",
    icon: "📦",
    color: "text-gray-700",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    defaultProperties: {},
  },
};

// Agent evaluation types
export type CanvasReadiness = {
  isReady: boolean;
  score: number; // 0-100
  missingItems: string[];
  suggestions: string[];
  blockAnalysis: {
    blockId: string;
    issues: string[];
    suggestions: string[];
  }[];
};

// Whiteboard analysis types
export type WhiteboardAnalysis = {
  detectedBlocks: {
    text: string;
    type: BlockType;
    position: { x: number; y: number };
    confidence: number;
  }[];
  detectedConnections: {
    from: number;
    to: number;
    label?: string;
  }[];
  rawText: string[];
};
