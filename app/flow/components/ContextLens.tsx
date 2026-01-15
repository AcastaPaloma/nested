"use client";

import { useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  MessageCircle,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Info,
  Zap,
  X,
  Check,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type ContextNode = {
  id: string;
  label: string;
  content: string;
  role: "user" | "assistant";
  isIncluded: boolean;
  treeLabel: string;
  treeIndex: number;
  isRoot: boolean;
};

type ContextLensProps = {
  nodes: ContextNode[];
  onToggleNode: (nodeId: string) => void;
  onIncludeAll: () => void;
  onExcludeAll: () => void;
  onClose: () => void;
  replyingToId: string | null;
  replyingToLabel: string | null;
};

// Estimate tokens (rough: ~4 chars per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const TREE_COLORS = [
  "bg-blue-100 text-blue-700 border-blue-200",
  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-purple-100 text-purple-700 border-purple-200",
  "bg-rose-100 text-rose-700 border-rose-200",
];

export function ContextLens({
  nodes,
  onToggleNode,
  onIncludeAll,
  onExcludeAll,
  onClose,
  replyingToId,
  replyingToLabel,
}: ContextLensProps) {
  const [expandedTrees, setExpandedTrees] = useState<Set<string>>(new Set());

  // Group nodes by tree
  const nodesByTree = useMemo(() => {
    const grouped = new Map<string, ContextNode[]>();
    for (const node of nodes) {
      const treeNodes = grouped.get(node.treeLabel) || [];
      treeNodes.push(node);
      grouped.set(node.treeLabel, treeNodes);
    }
    return grouped;
  }, [nodes]);

  // Calculate stats
  const includedNodes = nodes.filter((n) => n.isIncluded);
  const totalTokens = includedNodes.reduce(
    (sum, n) => sum + estimateTokens(n.content),
    0
  );
  const maxTokens = 8000; // Reasonable context limit
  const tokenPercent = Math.min((totalTokens / maxTokens) * 100, 100);

  const toggleTree = (treeLabel: string) => {
    setExpandedTrees((prev) => {
      const next = new Set(prev);
      if (next.has(treeLabel)) {
        next.delete(treeLabel);
      } else {
        next.add(treeLabel);
      }
      return next;
    });
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-full w-80 bg-white border-l border-gray-200 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-gray-600" />
            <h3 className="font-semibold text-gray-900">Context Lens</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Replying To Indicator */}
        {replyingToId && (
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2 text-sm">
              <MessageCircle className="h-4 w-4 text-gray-500" />
              <span className="text-gray-600">Replying to</span>
              <Badge variant="secondary" className="font-mono text-xs">
                {replyingToLabel}
              </Badge>
            </div>
          </div>
        )}

        {/* Token Estimate */}
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-gray-700">
                Context Size
              </span>
            </div>
            <span className="text-sm text-gray-500">
              ~{totalTokens.toLocaleString()} tokens
            </span>
          </div>
          <Progress
            value={tokenPercent}
            className={cn(
              "h-2",
              tokenPercent > 80 ? "[&>div]:bg-red-500" : tokenPercent > 60 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"
            )}
          />
          {tokenPercent > 80 && (
            <p className="text-xs text-red-600 mt-1">
              ⚠ Context is large. Consider excluding some nodes.
            </p>
          )}
        </div>

        {/* Quick Actions */}
        <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onIncludeAll}
            className="flex-1 h-7 text-xs"
          >
            <Check className="h-3 w-3 mr-1" />
            Include All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExcludeAll}
            className="flex-1 h-7 text-xs"
          >
            <Minus className="h-3 w-3 mr-1" />
            Exclude All
          </Button>
        </div>

        {/* Explanation */}
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              Only <span className="font-semibold">included nodes</span> are sent to the AI.
              Toggle nodes on/off to control exactly what context the agent sees.
            </p>
          </div>
        </div>

        {/* Node List by Tree */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {Array.from(nodesByTree.entries()).map(([treeLabel, treeNodes]) => {
              const treeIndex = treeNodes[0]?.treeIndex ?? 0;
              const colorClass = TREE_COLORS[treeIndex % TREE_COLORS.length];
              const isExpanded = expandedTrees.has(treeLabel);
              const includedInTree = treeNodes.filter((n) => n.isIncluded).length;

              return (
                <div key={treeLabel} className="mb-2">
                  {/* Tree Header */}
                  <button
                    onClick={() => toggleTree(treeLabel)}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-500" />
                      )}
                      <GitBranch className="h-4 w-4 text-gray-500" />
                      <Badge className={cn("font-mono text-xs", colorClass)}>
                        Branch {treeLabel}
                      </Badge>
                    </div>
                    <span className="text-xs text-gray-500">
                      {includedInTree}/{treeNodes.length}
                    </span>
                  </button>

                  {/* Tree Nodes */}
                  {isExpanded && (
                    <div className="ml-6 mt-1 space-y-1">
                      {treeNodes.map((node) => (
                        <div
                          key={node.id}
                          className={cn(
                            "flex items-center justify-between p-2 rounded-md border transition-colors",
                            node.isIncluded
                              ? "bg-white border-gray-200"
                              : "bg-gray-50 border-gray-100 opacity-60"
                          )}
                        >
                          <div className="flex-1 min-w-0 mr-2">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "font-mono text-[10px] px-1.5",
                                  colorClass
                                )}
                              >
                                {node.label}
                              </Badge>
                              <span className="text-xs text-gray-500">
                                {node.role === "user" ? "You" : "Agent"}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 truncate mt-1">
                              {node.content.slice(0, 60)}
                              {node.content.length > 60 && "..."}
                            </p>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Switch
                                checked={node.isIncluded}
                                onCheckedChange={() => onToggleNode(node.id)}
                                className="scale-75"
                              />
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <p>
                                {node.isIncluded
                                  ? "Exclude from context"
                                  : "Include in context"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {nodes.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No messages yet</p>
                <p className="text-xs text-gray-400">
                  Start a conversation to see context here
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer Stats */}
        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {includedNodes.length} of {nodes.length} nodes included
            </span>
            <span>
              {includedNodes.filter((n) => n.role === "user").length} user,{" "}
              {includedNodes.filter((n) => n.role === "assistant").length} agent
            </span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
