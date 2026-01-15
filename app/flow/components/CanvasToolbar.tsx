"use client";

import { useState } from "react";
import {
  GitBranch,
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Focus,
  Layers,
  Eye,
  EyeOff,
  MousePointer2,
  Hand,
  Grid3X3,
  Download,
  Upload,
  Undo2,
  Redo2,
  Settings,
  Info,
  Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

type CanvasToolbarProps = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onCenterNode?: (nodeId: string) => void;
  onToggleContextLens: () => void;
  contextLensOpen: boolean;
  onNewBranch: () => void;
  nodeCount: number;
  selectedCount: number;
  zoom: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
};

export function CanvasToolbar({
  onZoomIn,
  onZoomOut,
  onFitView,
  onToggleContextLens,
  contextLensOpen,
  onNewBranch,
  nodeCount,
  selectedCount,
  zoom,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: CanvasToolbarProps) {
  const [showShortcuts, setShowShortcuts] = useState(false);

  const zoomPercent = Math.round(zoom * 100);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg px-2 py-1.5">
          {/* New Branch */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onNewBranch}
                className="h-8 w-8 p-0"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>New Branch</p>
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Zoom Controls */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onZoomOut}
                  className="h-8 w-8 p-0"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Zoom Out</p>
              </TooltipContent>
            </Tooltip>

            <span className="text-xs font-medium text-gray-600 w-12 text-center tabular-nums">
              {zoomPercent}%
            </span>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onZoomIn}
                  className="h-8 w-8 p-0"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Zoom In</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Fit View */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onFitView}
                className="h-8 w-8 p-0"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Fit to View</p>
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Context Lens Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={contextLensOpen ? "secondary" : "ghost"}
                size="sm"
                onClick={onToggleContextLens}
                className="h-8 px-2 gap-1.5"
              >
                <Eye className="h-4 w-4" />
                <span className="text-xs">Context</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Toggle Context Lens</p>
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Stats */}
          <div className="flex items-center gap-2 px-2">
            <Badge variant="secondary" className="h-6 text-xs">
              <Layers className="h-3 w-3 mr-1" />
              {nodeCount}
            </Badge>
            {selectedCount > 0 && (
              <Badge variant="outline" className="h-6 text-xs">
                <MousePointer2 className="h-3 w-3 mr-1" />
                {selectedCount}
              </Badge>
            )}
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Help/Shortcuts */}
          <DropdownMenu open={showShortcuts} onOpenChange={setShowShortcuts}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Keyboard className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Keyboard Shortcuts</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Navigation</DropdownMenuLabel>
              <DropdownMenuItem>
                <span>Pan canvas</span>
                <DropdownMenuShortcut>Drag</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <span>Zoom</span>
                <DropdownMenuShortcut>Ctrl + Scroll</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <span>Scroll vertical</span>
                <DropdownMenuShortcut>Scroll</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <span>Scroll horizontal</span>
                <DropdownMenuShortcut>Shift + Scroll</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Selection</DropdownMenuLabel>
              <DropdownMenuItem>
                <span>Multi-select</span>
                <DropdownMenuShortcut>Ctrl + Click</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <span>Box select</span>
                <DropdownMenuShortcut>Ctrl + Drag</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Nodes</DropdownMenuLabel>
              <DropdownMenuItem>
                <span>Resize node</span>
                <DropdownMenuShortcut>Drag corner</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <span>Move node</span>
                <DropdownMenuShortcut>Drag node</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </TooltipProvider>
  );
}
