"use client";

import { useState } from "react";
import {
  Plus,
  FileText,
  Zap,
  Server,
  Wrench,
  Palette,
  Box,
  Upload,
  Play,
  Settings,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { type BlockType, BLOCK_CONFIGS } from "../types";

type BuilderToolbarProps = {
  onAddBlock: (type: BlockType) => void;
  onUploadWhiteboard: () => void;
  onAnalyzeCanvas: () => void;
  onBuildMVP: () => void;
  blockCount: number;
  readinessScore: number;
  isAnalyzing: boolean;
  isBuilding: boolean;
};

const BLOCK_ICONS: Record<BlockType, React.ReactNode> = {
  page: <FileText className="h-4 w-4" />,
  feature: <Zap className="h-4 w-4" />,
  api: <Server className="h-4 w-4" />,
  tool: <Wrench className="h-4 w-4" />,
  design: <Palette className="h-4 w-4" />,
  custom: <Box className="h-4 w-4" />,
};

export function BuilderToolbar({
  onAddBlock,
  onUploadWhiteboard,
  onAnalyzeCanvas,
  onBuildMVP,
  blockCount,
  readinessScore,
  isAnalyzing,
  isBuilding,
}: BuilderToolbarProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-100 text-green-700";
    if (score >= 50) return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg px-2 py-1.5">
          {/* Add Block Dropdown */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2 gap-1">
                    <Plus className="h-4 w-4" />
                    <span className="text-xs">Add Block</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Add a new block to the canvas</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>Block Types</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(BLOCK_CONFIGS) as BlockType[]).map((type) => {
                const config = BLOCK_CONFIGS[type];
                return (
                  <DropdownMenuItem
                    key={type}
                    onClick={() => onAddBlock(type)}
                    className="gap-2"
                  >
                    <span>{config.icon}</span>
                    <span>{config.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Upload Whiteboard */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onUploadWhiteboard}
                className="h-8 px-2 gap-1"
              >
                <Upload className="h-4 w-4" />
                <span className="text-xs">Whiteboard</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Upload a whiteboard photo to auto-generate blocks</p>
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Analyze Canvas */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onAnalyzeCanvas}
                disabled={isAnalyzing || blockCount === 0}
                className="h-8 px-2 gap-1"
              >
                <Settings className={`h-4 w-4 ${isAnalyzing ? "animate-spin" : ""}`} />
                <span className="text-xs">Analyze</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Analyze canvas for completeness</p>
            </TooltipContent>
          </Tooltip>

          {/* Readiness Score */}
          <Badge className={`h-6 text-xs ${getScoreColor(readinessScore)}`}>
            {readinessScore}% Ready
          </Badge>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Build MVP */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                onClick={onBuildMVP}
                disabled={isBuilding || readinessScore < 50}
                className="h-8 px-3 gap-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                <Play className={`h-4 w-4 ${isBuilding ? "animate-pulse" : ""}`} />
                <span className="text-xs font-medium">Build MVP</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>
                {readinessScore < 50
                  ? "Add more blocks to enable building"
                  : "Start building your MVP"}
              </p>
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Block Count */}
          <Badge variant="secondary" className="h-6 text-xs">
            {blockCount} {blockCount === 1 ? "block" : "blocks"}
          </Badge>
        </div>
      </div>
    </TooltipProvider>
  );
}
