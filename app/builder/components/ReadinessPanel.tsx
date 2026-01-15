"use client";

import {
  X,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { CanvasReadiness } from "../types";

type ReadinessPanelProps = {
  readiness: CanvasReadiness | null;
  onClose: () => void;
  onFocusBlock?: (blockId: string) => void;
  isLoading: boolean;
};

export function ReadinessPanel({
  readiness,
  onClose,
  onFocusBlock,
  isLoading,
}: ReadinessPanelProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 50) return "text-amber-600";
    return "text-red-600";
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return "[&>div]:bg-green-500";
    if (score >= 50) return "[&>div]:bg-amber-500";
    return "[&>div]:bg-red-500";
  };

  return (
    <div className="h-full w-80 bg-white border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Canvas Analysis</h3>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-gray-600 rounded-full mx-auto" />
            <p className="text-sm text-gray-600">Analyzing your canvas...</p>
          </div>
        </div>
      ) : readiness ? (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* Score */}
            <div className="text-center">
              <div className={cn("text-5xl font-bold", getScoreColor(readiness.score))}>
                {readiness.score}%
              </div>
              <p className="text-sm text-gray-500 mt-1">Readiness Score</p>
              <Progress
                value={readiness.score}
                className={cn("h-2 mt-3", getProgressColor(readiness.score))}
              />
            </div>

            <Separator />

            {/* Status */}
            <div className="flex items-center gap-2">
              {readiness.isReady ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="font-medium text-green-700">Ready to build!</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <span className="font-medium text-amber-700">
                    Needs more detail
                  </span>
                </>
              )}
            </div>

            {/* Missing Items */}
            {readiness.missingItems.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Missing
                </h4>
                <ul className="space-y-1">
                  {readiness.missingItems.map((item, i) => (
                    <li
                      key={i}
                      className="text-sm text-red-600 flex items-start gap-2"
                    >
                      <span className="text-red-400">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggestions */}
            {readiness.suggestions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  Suggestions
                </h4>
                <ul className="space-y-2">
                  {readiness.suggestions.map((suggestion, i) => (
                    <li
                      key={i}
                      className="text-sm text-gray-600 bg-amber-50 p-2 rounded-md flex items-start gap-2"
                    >
                      <ArrowRight className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Block Analysis */}
            {readiness.blockAnalysis.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">
                  Block Issues
                </h4>
                <div className="space-y-2">
                  {readiness.blockAnalysis.map((block) => (
                    <button
                      key={block.blockId}
                      onClick={() => onFocusBlock?.(block.blockId)}
                      className="w-full text-left p-2 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-xs">
                          Block
                        </Badge>
                        <span className="text-xs text-gray-400">Click to focus</span>
                      </div>
                      {block.issues.map((issue, i) => (
                        <p key={i} className="text-xs text-red-600">
                          • {issue}
                        </p>
                      ))}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center p-4">
          <div>
            <AlertTriangle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              Click "Analyze" to check your canvas readiness
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
