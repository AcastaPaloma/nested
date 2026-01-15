"use client";

import { useState, useRef } from "react";
import {
  Upload,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type WhiteboardUploadProps = {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
  isProcessing: boolean;
  progress: number;
  status: "idle" | "uploading" | "analyzing" | "complete" | "error";
  error?: string;
};

export function WhiteboardUpload({
  open,
  onClose,
  onUpload,
  isProcessing,
  progress,
  status,
  error,
}: WhiteboardUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (selectedFile) {
      await onUpload(selectedFile);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setPreview(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Import from Whiteboard
          </DialogTitle>
          <DialogDescription>
            Upload a photo of your whiteboard, and we'll extract the structure
            to create blocks on your canvas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload Area */}
          {!preview && status === "idle" && (
            <div
              className={cn(
                "relative border-2 border-dashed rounded-lg p-8 transition-colors",
                dragActive
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400"
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={handleChange}
                className="hidden"
              />
              <div className="flex flex-col items-center justify-center gap-3">
                <Upload className="h-10 w-10 text-gray-400" />
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Click to upload
                  </button>
                  <span className="text-gray-500"> or drag and drop</span>
                </div>
                <p className="text-xs text-gray-400">PNG, JPG, HEIC up to 10MB</p>
              </div>
            </div>
          )}

          {/* Preview */}
          {preview && status === "idle" && (
            <div className="relative rounded-lg overflow-hidden border border-gray-200">
              <img
                src={preview}
                alt="Whiteboard preview"
                className="w-full h-48 object-cover"
              />
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setPreview(null);
                }}
                className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Processing State */}
          {(status === "uploading" || status === "analyzing") && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                <span className="text-sm font-medium text-gray-700">
                  {status === "uploading"
                    ? "Uploading image..."
                    : "Analyzing whiteboard..."}
                </span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-gray-500 text-center">
                {status === "analyzing" &&
                  "Detecting boxes, arrows, and text clusters..."}
              </p>
            </div>
          )}

          {/* Complete State */}
          {status === "complete" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <div className="text-center">
                <p className="font-medium text-gray-900">
                  Whiteboard imported successfully!
                </p>
                <p className="text-sm text-gray-500">
                  Blocks have been added to your canvas
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {status === "error" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <div className="text-center">
                <p className="font-medium text-gray-900">Import failed</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {status === "idle" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={!selectedFile}>
                Analyze Whiteboard
              </Button>
            </>
          )}
          {status === "complete" && (
            <Button onClick={handleClose}>Done</Button>
          )}
          {status === "error" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setSelectedFile(null);
                  setPreview(null);
                }}
              >
                Try Again
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
