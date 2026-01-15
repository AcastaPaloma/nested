"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Clock,
  Play,
  Download,
  ExternalLink,
  Copy,
  FileCode,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { BuildJob, BuildStatus } from "@/lib/database.types";

type BuildStatusPanelProps = {
  canvasId: string | null;
  onClose: () => void;
  onStartBuild: () => void;
  isReadyToBuild: boolean;
};

export function BuildStatusPanel({
  canvasId,
  onClose,
  onStartBuild,
  isReadyToBuild,
}: BuildStatusPanelProps) {
  const [jobs, setJobs] = useState<BuildJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<BuildJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // Load build jobs for this canvas
  const loadJobs = useCallback(async () => {
    if (!canvasId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/build-mvp?canvas_id=${canvasId}`);
      if (response.ok) {
        const data = await response.json();
        setJobs(data);
        // Auto-select the most recent job
        if (data.length > 0 && !selectedJob) {
          setSelectedJob(data[0]);
        }
      }
    } catch (error) {
      console.error("Failed to load build jobs:", error);
    } finally {
      setIsLoading(false);
    }
  }, [canvasId, selectedJob]);

  // Poll for updates when a job is in progress
  useEffect(() => {
    loadJobs();

    const activeJob = jobs.find(
      (j) => j.status === "queued" || j.status === "analyzing" || j.status === "building"
    );

    if (activeJob) {
      const interval = setInterval(loadJobs, 2000);
      return () => clearInterval(interval);
    }
  }, [loadJobs, jobs]);

  // Get status icon and color
  const getStatusDisplay = (status: BuildStatus) => {
    switch (status) {
      case "queued":
        return { icon: Clock, color: "text-gray-500", bgColor: "bg-gray-100" };
      case "analyzing":
        return { icon: Loader2, color: "text-blue-500", bgColor: "bg-blue-100", animate: true };
      case "building":
        return { icon: Loader2, color: "text-purple-500", bgColor: "bg-purple-100", animate: true };
      case "complete":
        return { icon: CheckCircle, color: "text-green-500", bgColor: "bg-green-100" };
      case "failed":
        return { icon: AlertTriangle, color: "text-red-500", bgColor: "bg-red-100" };
      case "cancelled":
        return { icon: X, color: "text-gray-500", bgColor: "bg-gray-100" };
      default:
        return { icon: Clock, color: "text-gray-500", bgColor: "bg-gray-100" };
    }
  };

  // Copy file content to clipboard
  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  // Download all files as a zip (simulated - in production use JSZip)
  const downloadFiles = () => {
    if (!selectedJob?.artifacts?.files) return;

    // Create a simple download of all files
    selectedJob.artifacts.files.forEach((file) => {
      const blob = new Blob([file.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.path.split("/").pop() || "file.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  // Open in VS Code (uses vscode:// protocol)
  const openInVSCode = (filePath: string, content: string) => {
    // Create a temporary file and open it
    // In production, this would integrate with local file system via a desktop agent
    const encodedContent = encodeURIComponent(content);
    const vscodeUrl = `vscode://file/${filePath}`;
    window.open(vscodeUrl, "_blank");
  };

  const toggleFileExpanded = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="h-full w-96 bg-white border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Build Status</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadJobs}
            className="h-7 w-7 p-0"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Build Button */}
      <div className="px-4 py-3 border-b border-gray-200">
        <Button
          onClick={onStartBuild}
          disabled={!isReadyToBuild || jobs.some((j) => j.status === "building" || j.status === "analyzing")}
          className="w-full"
        >
          <Play className="h-4 w-4 mr-2" />
          {jobs.some((j) => j.status === "building" || j.status === "analyzing")
            ? "Building..."
            : "Launch MVP Build"}
        </Button>
        {!isReadyToBuild && (
          <p className="text-xs text-amber-600 mt-2">
            Canvas needs more detail before building. Check the readiness panel.
          </p>
        )}
      </div>

      <ScrollArea className="flex-1">
        {/* Job History */}
        {jobs.length > 0 && (
          <div className="p-4 border-b border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Build History</h4>
            <div className="space-y-2">
              {jobs.slice(0, 5).map((job) => {
                const status = getStatusDisplay(job.status);
                const Icon = status.icon;
                return (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className={cn(
                      "w-full flex items-center gap-2 p-2 rounded-md transition-colors",
                      selectedJob?.id === job.id
                        ? "bg-gray-100 border border-gray-300"
                        : "hover:bg-gray-50"
                    )}
                  >
                    <div className={cn("p-1 rounded", status.bgColor)}>
                      <Icon
                        className={cn(
                          "h-3 w-3",
                          status.color,
                          status.animate && "animate-spin"
                        )}
                      />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-xs font-medium text-gray-900">
                        {new Date(job.created_at).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">{job.status}</p>
                    </div>
                    {job.progress < 100 && job.status !== "failed" && (
                      <span className="text-xs text-gray-400">{job.progress}%</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Job Details */}
        {selectedJob && (
          <div className="p-4">
            {/* Progress */}
            {selectedJob.status !== "complete" && selectedJob.status !== "failed" && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Progress</span>
                  <span className="text-sm text-gray-500">{selectedJob.progress}%</span>
                </div>
                <Progress value={selectedJob.progress} className="h-2" />
              </div>
            )}

            {/* Error Message */}
            {selectedJob.status === "failed" && selectedJob.error_message && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700">Build Failed</p>
                    <p className="text-xs text-red-600 mt-1">{selectedJob.error_message}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Logs */}
            {selectedJob.logs && selectedJob.logs.length > 0 && (
              <Collapsible defaultOpen={selectedJob.status !== "complete"}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <ChevronDown className="h-4 w-4" />
                  Build Logs
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="bg-gray-900 rounded-md p-3 max-h-40 overflow-auto mb-4">
                    {selectedJob.logs.map((log, i) => (
                      <p
                        key={i}
                        className={cn(
                          "text-xs font-mono",
                          log.level === "error"
                            ? "text-red-400"
                            : log.level === "warn"
                            ? "text-yellow-400"
                            : "text-gray-300"
                        )}
                      >
                        <span className="text-gray-500">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>{" "}
                        {log.message}
                      </p>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            <Separator className="my-4" />

            {/* Generated Files */}
            {selectedJob.status === "complete" && selectedJob.artifacts?.files && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-700">
                    Generated Files ({selectedJob.artifacts.files.length})
                  </h4>
                  <Button variant="outline" size="sm" onClick={downloadFiles}>
                    <Download className="h-3 w-3 mr-1" />
                    Download All
                  </Button>
                </div>

                <div className="space-y-2">
                  {selectedJob.artifacts.files.map((file) => (
                    <Collapsible
                      key={file.path}
                      open={expandedFiles.has(file.path)}
                      onOpenChange={() => toggleFileExpanded(file.path)}
                    >
                      <CollapsibleTrigger className="w-full flex items-center gap-2 p-2 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors">
                        {expandedFiles.has(file.path) ? (
                          <ChevronDown className="h-3 w-3 text-gray-500" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-gray-500" />
                        )}
                        <FileCode className="h-3 w-3 text-gray-500" />
                        <span className="text-xs font-mono text-gray-700 flex-1 text-left truncate">
                          {file.path}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {file.language}
                        </Badge>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-2 relative">
                          <div className="absolute top-2 right-2 flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => copyToClipboard(file.content)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => openInVSCode(file.path, file.content)}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </div>
                          <pre className="bg-gray-900 text-gray-100 rounded-md p-3 text-xs overflow-auto max-h-60">
                            <code>{file.content}</code>
                          </pre>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {selectedJob.status === "complete" && !selectedJob.artifacts?.files?.length && (
              <div className="text-center py-8 text-gray-500">
                <FileCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No files generated</p>
                <p className="text-xs text-gray-400 mt-1">
                  The build completed but no artifacts were produced
                </p>
              </div>
            )}
          </div>
        )}

        {/* No Jobs */}
        {jobs.length === 0 && !isLoading && (
          <div className="text-center py-12 text-gray-500">
            <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No builds yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Click "Launch MVP Build" to generate your app
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
