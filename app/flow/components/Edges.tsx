"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import type { FlowEdgeData } from "../types";

// Reply Edge - solid line, flows down the tree
export const ReplyEdge = memo(function ReplyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps<Edge<FlowEdgeData>>) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        strokeWidth: 2,
        stroke: "#94a3b8", // slate-400
      }}
    />
  );
});

// Reference Edge - dashed line, can cross trees
export const ReferenceEdge = memo(function ReferenceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}: EdgeProps<Edge<FlowEdgeData>>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  const isCircular = data?.isCircular ?? false;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: 2,
          stroke: isCircular ? "#ef4444" : "#a855f7", // red-500 or purple-500
          strokeDasharray: "6 4",
        }}
      />
      {isCircular && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="px-2 py-1 bg-red-100 border border-red-300 rounded text-xs text-red-600 font-medium"
          >
            ⚠ Circular
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

// Context Edge - an intentional, editable link between two thoughts. It is
// separate from a historical prompt reference: following it is what prepares
// the target's ancestry as context when the source node is continued.
export const ContextEdge = memo(function ContextEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
}: EdgeProps<Edge<FlowEdgeData>>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: 2,
          stroke: "#0f766e",
          strokeDasharray: "3 5",
        }}
      />
      <EdgeLabelRenderer>
        <span
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "none",
          }}
          className="rounded-full border border-teal-200 bg-white px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-teal-700 shadow-sm"
        >
          context
        </span>
      </EdgeLabelRenderer>
    </>
  );
});

export const edgeTypes = {
  reply: ReplyEdge,
  reference: ReferenceEdge,
  context: ContextEdge,
};
