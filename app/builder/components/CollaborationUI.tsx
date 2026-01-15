"use client";

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CollaboratorPresence } from "@/hooks/useCanvasCollaboration";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, Wifi, WifiOff } from "lucide-react";

// Cursor SVG component
const CursorIcon = memo(({ color }: { color: string }) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
  >
    <path
      d="M5.5 3.21V20.79C5.5 21.36 6.11 21.71 6.61 21.41L11.5 18.5L14.5 23.5L17.5 21.5L14.5 16.5H20.5C21.06 16.5 21.41 15.89 21.11 15.39L6.61 2.59C6.11 2.29 5.5 2.64 5.5 3.21Z"
      fill={color}
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
));
CursorIcon.displayName = "CursorIcon";

// Remote cursor component
interface RemoteCursorProps {
  presence: CollaboratorPresence;
  viewportTransform: { x: number; y: number; zoom: number };
}

export const RemoteCursor = memo(({ presence, viewportTransform }: RemoteCursorProps) => {
  if (!presence.cursor) return null;

  // Transform canvas coordinates to screen coordinates
  const screenX = presence.cursor.x * viewportTransform.zoom + viewportTransform.x;
  const screenY = presence.cursor.y * viewportTransform.zoom + viewportTransform.y;

  return (
    <motion.div
      key={presence.user_id}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.15 }}
      className="pointer-events-none fixed z-50"
      style={{
        left: screenX,
        top: screenY,
        transform: "translate(-2px, -2px)",
      }}
    >
      <CursorIcon color={presence.color} />
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        className="ml-4 mt-1 px-2 py-0.5 rounded-full text-xs font-medium text-white whitespace-nowrap"
        style={{ backgroundColor: presence.color }}
      >
        {presence.name}
      </motion.div>
    </motion.div>
  );
});
RemoteCursor.displayName = "RemoteCursor";

// Cursors layer component
interface CursorsLayerProps {
  collaborators: CollaboratorPresence[];
  viewportTransform: { x: number; y: number; zoom: number };
}

export const CursorsLayer = memo(({ collaborators, viewportTransform }: CursorsLayerProps) => {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <AnimatePresence>
        {collaborators.map((presence) => (
          <RemoteCursor
            key={presence.user_id}
            presence={presence}
            viewportTransform={viewportTransform}
          />
        ))}
      </AnimatePresence>
    </div>
  );
});
CursorsLayer.displayName = "CursorsLayer";

// Connection status indicator
interface ConnectionStatusProps {
  isConnected: boolean;
  collaboratorCount: number;
  error?: string | null;
}

export const ConnectionStatus = memo(({ isConnected, collaboratorCount, error }: ConnectionStatusProps) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
              isConnected
                ? "bg-emerald-100 text-emerald-700"
                : error
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {isConnected ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {isConnected ? (
              collaboratorCount > 0 ? (
                <>
                  <Users className="h-3 w-3" />
                  <span>{collaboratorCount + 1}</span>
                </>
              ) : (
                <span>Connected</span>
              )
            ) : error ? (
              <span>Disconnected</span>
            ) : (
              <span>Connecting...</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {isConnected ? (
            collaboratorCount > 0 ? (
              <p>{collaboratorCount + 1} people on this canvas</p>
            ) : (
              <p>You&apos;re the only one here</p>
            )
          ) : error ? (
            <p className="text-red-600">{error}</p>
          ) : (
            <p>Connecting to collaboration server...</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
ConnectionStatus.displayName = "ConnectionStatus";

// Collaborators avatars bar
interface CollaboratorsBarProps {
  collaborators: CollaboratorPresence[];
  isConnected: boolean;
}

export const CollaboratorsBar = memo(({ collaborators, isConnected }: CollaboratorsBarProps) => {
  if (!isConnected || collaborators.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <AnimatePresence mode="popLayout">
        {collaborators.slice(0, 5).map((collab) => (
          <TooltipProvider key={collab.user_id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-white"
                  style={{ backgroundColor: collab.color }}
                >
                  {collab.name.charAt(0).toUpperCase()}
                </motion.div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{collab.name}</p>
                <p className="text-xs text-muted-foreground">{collab.email}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </AnimatePresence>
      {collaborators.length > 5 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-bold ring-2 ring-white">
                +{collaborators.length - 5}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="space-y-1">
                {collaborators.slice(5).map((collab) => (
                  <p key={collab.user_id}>{collab.name}</p>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
});
CollaboratorsBar.displayName = "CollaboratorsBar";

// Selection highlight for nodes being edited by others
interface RemoteSelectionProps {
  collaborators: CollaboratorPresence[];
  getNodePosition: (nodeId: string) => { x: number; y: number; width: number; height: number } | null;
  viewportTransform: { x: number; y: number; zoom: number };
}

export const RemoteSelections = memo(({ collaborators, getNodePosition, viewportTransform }: RemoteSelectionProps) => {
  const selections = collaborators
    .filter((c) => c.selectedNodeId)
    .map((c) => {
      const pos = getNodePosition(c.selectedNodeId!);
      if (!pos) return null;
      return { ...c, position: pos };
    })
    .filter(Boolean);

  if (selections.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <AnimatePresence>
        {selections.map((sel) => {
          if (!sel) return null;
          const { position, color, name, user_id } = sel;

          // Transform canvas coordinates to screen coordinates
          const screenX = position.x * viewportTransform.zoom + viewportTransform.x;
          const screenY = position.y * viewportTransform.zoom + viewportTransform.y;
          const screenWidth = position.width * viewportTransform.zoom;
          const screenHeight = position.height * viewportTransform.zoom;

          return (
            <motion.div
              key={user_id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute rounded-lg"
              style={{
                left: screenX - 4,
                top: screenY - 4,
                width: screenWidth + 8,
                height: screenHeight + 8,
                border: `2px solid ${color}`,
                boxShadow: `0 0 0 1px ${color}20`,
              }}
            >
              <div
                className="absolute -top-6 left-0 px-2 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap"
                style={{ backgroundColor: color }}
              >
                {name}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
});
RemoteSelections.displayName = "RemoteSelections";
