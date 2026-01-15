"use client";

import { memo } from "react";
import { Handle, Position, NodeResizer, type NodeProps, type Node } from "@xyflow/react";
import { BLOCK_CONFIGS, type BlockType, type BlockStatus } from "../types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type BuilderNodeData = {
  id: string;
  type: BlockType;
  title: string;
  description: string;
  status: BlockStatus;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
};

const STATUS_STYLES: Record<BlockStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-600" },
  ready: { label: "Ready", className: "bg-green-100 text-green-700" },
  building: { label: "Building...", className: "bg-amber-100 text-amber-700 animate-pulse" },
  complete: { label: "Complete", className: "bg-blue-100 text-blue-700" },
};

export const BuilderNode = memo(function BuilderNode({
  data,
  selected,
}: NodeProps<Node<BuilderNodeData>>) {
  const config = BLOCK_CONFIGS[data.type];
  const statusStyle = STATUS_STYLES[data.status];

  return (
    <div
      className={cn(
        "rounded-xl border-2 shadow-sm transition-all duration-200 flex flex-col w-full h-full",
        config.bgColor,
        config.borderColor,
        selected && "ring-2 ring-offset-2 ring-blue-500"
      )}
      style={{ minWidth: 200, minHeight: 120 }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={120}
        isVisible={true}
        lineClassName="border-transparent"
        handleClassName="opacity-0"
      />

      {/* Target handle - top */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3! h-3! bg-gray-400! border-2! border-white!"
      />

      {/* Header */}
      <div className={cn("flex items-center justify-between px-3 py-2 border-b", config.borderColor)}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <Badge variant="secondary" className={cn("text-[10px] font-medium", config.color)}>
            {config.label}
          </Badge>
        </div>
        <Badge className={cn("text-[10px]", statusStyle.className)}>
          {statusStyle.label}
        </Badge>
      </div>

      {/* Content */}
      <div className="flex-1 px-3 py-2 overflow-hidden">
        <h3 className={cn("font-semibold text-sm mb-1 truncate", config.color)}>
          {data.title || "Untitled"}
        </h3>
        <p className="text-xs text-gray-600 line-clamp-2">
          {data.description || "No description"}
        </p>
      </div>

      {/* Actions */}
      <div className={cn("flex items-center gap-2 px-3 py-2 border-t", config.borderColor)}>
        {data.onEdit && (
          <button
            onClick={() => data.onEdit?.(data.id)}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Edit
          </button>
        )}
        {data.onDelete && (
          <button
            onClick={() => data.onDelete?.(data.id)}
            className="text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            Delete
          </button>
        )}
      </div>

      {/* Source handle - bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3! h-3! bg-gray-400! border-2! border-white!"
      />
    </div>
  );
});

export const builderNodeTypes = {
  builder: BuilderNode,
};
