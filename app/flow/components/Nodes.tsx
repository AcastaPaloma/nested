"use client";

import { memo, useState } from "react";
import {
  Handle,
  Position,
  NodeResizer,
  useViewport,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { FlowNodeData, TreePalette } from "../types";

// Markdown renderer component with proper styling and LaTeX support
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none break-words" style={{ fontFamily: 'var(--font-dotgothic16)' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Style code blocks
          pre: ({ children }) => (
            <pre className="bg-gray-800 text-gray-100 rounded-md p-3 overflow-x-auto text-xs my-2">
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code className="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-xs font-mono">
                {children}
              </code>
            ) : (
              <code className="text-xs font-mono">{children}</code>
            );
          },
          // Style headers
          h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
          // Style lists
          ul: ({ children }) => <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-sm">{children}</li>,
          // Style paragraphs
          p: ({ children }) => <p className="text-sm leading-relaxed my-1">{children}</p>,
          // Style links
          a: ({ children, href }) => (
            <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          // Style blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-300 pl-3 italic text-gray-600 my-2">
              {children}
            </blockquote>
          ),
          // Style tables
          table: ({ children }) => (
            <table className="border-collapse border border-gray-300 my-2 text-xs w-full">
              {children}
            </table>
          ),
          th: ({ children }) => (
            <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-300 px-2 py-1">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Collapsed node summary
function CollapsedContent({
  content,
  palette,
}: {
  content: string;
  palette: TreePalette;
}) {
  const summary = content.length > 40 ? content.slice(0, 40) + "..." : content;
  return (
    <div className={`px-3 py-2 ${palette.accent} rounded-b-lg`}>
      <p className={`text-xs ${palette.text} italic`}>{summary}</p>
    </div>
  );
}

// Tree hover preview (shown on root nodes when NOT zoomed in too much)
// Uses fixed screen size by scaling inversely with zoom
function TreePreview({
  treeSummary,
  treeLabel,
  palette,
  zoom,
}: {
  treeSummary: string;
  treeLabel: string;
  palette: TreePalette;
  zoom: number;
}) {
  // Scale inversely with zoom to maintain consistent screen size
  const scale = 1 / zoom;

  return (
    <div
      className={`absolute z-50 px-3 py-2 rounded-lg shadow-lg border ${palette.bg} ${palette.border}`}
      style={{
        top: -16 * scale,
        left: "50%",
        transform: `translateX(-50%) scale(${scale})`,
        transformOrigin: "bottom center",
        width: 250,
        maxWidth: 300,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`text-xs font-bold ${palette.accent} ${palette.text} px-2 py-0.5 rounded`}
        >
          Branch {treeLabel}
        </span>
      </div>
      <p className="text-xs text-gray-600">{treeSummary}</p>
    </div>
  );
}

// User Node with resizing and collapse
export const UserNode = memo(function UserNode({
  data,
  selected,
}: NodeProps<Node<FlowNodeData>>) {
  const {
    message,
    onEdit,
    onToggleCollapse,
    isLastInBranch,
    shortLabel,
    treeLabel,
    isRoot,
    treeSummary,
    palette,
  } = data;
  const [showPreview, setShowPreview] = useState(false);
  const isCollapsed = message.isCollapsed ?? false;
  const { zoom } = useViewport();

  // Don't show hover preview when zoomed in (zoom > 0.8)
  const shouldShowPreview = isRoot && showPreview && treeSummary && zoom <= 0.8;

  return (
    <div
      className={`rounded-lg border shadow-sm transition-all duration-200 ${palette.bg} ${palette.border} ${
        selected ? `ring-2 ${palette.ring}` : ""
      } w-full h-full flex flex-col`}
      style={{ minWidth: 280, maxWidth: 350, minHeight: isCollapsed ? 60 : 100, maxHeight: isCollapsed ? 80 : 250 }}
      onMouseEnter={() => isRoot && setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
    >
      {/* Always visible resize handle at bottom-right corner */}
      <NodeResizer
        minWidth={220}
        minHeight={isCollapsed ? 60 : 100}
        isVisible={true}
        lineClassName="border-transparent"
        handleClassName="opacity-0"
      />
      {/* Visual resize indicator - bottom right triangle */}
      <div
        className="absolute bottom-0 right-0 w-0 h-0 cursor-se-resize pointer-events-none"
        style={{
          borderLeft: '12px solid transparent',
          borderBottom: `12px solid ${palette.handle}`,
          opacity: 0.6,
        }}
      />

      {/* Tree preview on hover for root nodes (only when zoomed out) */}
      {shouldShowPreview && (
        <TreePreview
          treeSummary={treeSummary}
          treeLabel={treeLabel}
          palette={palette}
          zoom={zoom}
        />
      )}

      {/* Target handle - top (not shown on root) */}
      {!isRoot && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: palette.handle }}
          className="w-3! h-3! border-2! border-white!"
        />
      )}

      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b ${palette.border}`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-mono ${palette.accent} ${palette.text} px-1.5 py-0.5 rounded font-bold`}
          >
            {shortLabel}
          </span>
          <span className={`text-xs font-medium ${palette.text}`}>You</span>
          {isRoot && (
            <span className={`text-[10px] ${palette.text} opacity-60`}>
              (root)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleCollapse?.(message.id)}
            className={`text-xs ${palette.text} hover:opacity-70 px-1`}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? "▶" : "▼"}
          </button>
        </div>
      </div>

      {/* Content */}
      {isCollapsed ? (
        <CollapsedContent content={message.content} palette={palette} />
      ) : (
        <div className="px-3 py-2 overflow-auto flex-1">
          <MarkdownContent content={message.content} />
          {message.branchReferences.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {message.branchReferences.map((_, idx) => (
                <span
                  key={idx}
                  className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded"
                >
                  @branch
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!isCollapsed && isLastInBranch && onEdit && (
        <div className={`px-3 py-2 border-t ${palette.border}`}>
          <button
            onClick={() => onEdit(message.id)}
            className={`text-xs ${palette.text} hover:opacity-70 transition-colors`}
          >
            Edit
          </button>
        </div>
      )}

      {/* Source handle - bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: palette.handle }}
        className="w-3! h-3! border-2! border-white!"
      />
    </div>
  );
});

// Agent Node with resizing and collapse
export const AgentNode = memo(function AgentNode({
  data,
  selected,
}: NodeProps<Node<FlowNodeData>>) {
  const { message, onReply, onToggleCollapse, shortLabel, palette } = data;
  const isCollapsed = message.isCollapsed ?? false;

  // Streaming state - show thinking animation
  if (message.isStreaming && !message.content) {
    return (
      <div
        className={`rounded-lg border shadow-sm ${palette.bg} ${palette.border} ${
          selected ? `ring-2 ${palette.ring}` : ""
        }`}
        style={{ minWidth: 220, minHeight: 80 }}
      >
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: palette.handle }}
          className="w-3! h-3! border-2! border-white!"
        />

        <div
          className={`flex items-center justify-between px-3 py-2 border-b ${palette.border}`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-mono ${palette.accent} ${palette.text} px-1.5 py-0.5 rounded`}
            >
              {shortLabel}
            </span>
            <span className={`text-xs font-medium ${palette.text}`}>Agent</span>
          </div>
        </div>

        <div className="px-3 py-4 flex items-center gap-2">
          <div className="flex gap-1">
            <span
              className="w-2 h-2 rounded-full animate-bounce"
              style={{ background: palette.handle, animationDelay: "-0.3s" }}
            />
            <span
              className="w-2 h-2 rounded-full animate-bounce"
              style={{ background: palette.handle, animationDelay: "-0.15s" }}
            />
            <span
              className="w-2 h-2 rounded-full animate-bounce"
              style={{ background: palette.handle }}
            />
          </div>
          <span className="text-sm text-gray-500">Thinking...</span>
        </div>

        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: palette.handle }}
          className="w-3! h-3! border-2! border-white!"
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border shadow-sm transition-all duration-200 ${palette.bg} ${palette.border} ${
        selected ? `ring-2 ${palette.ring}` : ""
      } w-full h-full flex flex-col`}
      style={{ minWidth: 280, maxWidth: 350, minHeight: isCollapsed ? 60 : 100, maxHeight: isCollapsed ? 80 : 300 }}
    >
      {/* Always visible resize handle */}
      <NodeResizer
        minWidth={220}
        minHeight={isCollapsed ? 60 : 100}
        isVisible={true}
        lineClassName="border-transparent"
        handleClassName="opacity-0"
      />
      {/* Visual resize indicator - bottom right triangle */}
      <div
        className="absolute bottom-0 right-0 w-0 h-0 cursor-se-resize pointer-events-none"
        style={{
          borderLeft: '12px solid transparent',
          borderBottom: '12px solid #9ca3af',
          opacity: 0.6,
        }}
      />

      {/* Target handle - top */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: palette.handle }}
        className="w-3! h-3! border-2! border-white!"
      />

      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b ${palette.border}`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-mono ${palette.accent} ${palette.text} px-1.5 py-0.5 rounded`}
          >
            {shortLabel}
          </span>
          <span className={`text-xs font-medium ${palette.text}`}>Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleCollapse?.(message.id)}
            className={`text-xs ${palette.text} hover:opacity-70 px-1`}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? "▶" : "▼"}
          </button>
        </div>
      </div>

      {/* Content */}
      {isCollapsed ? (
        <CollapsedContent content={message.content} palette={palette} />
      ) : (
        <div className="px-3 py-2 overflow-auto flex-1">
          <MarkdownContent content={message.content} />
        </div>
      )}

      {/* Actions - only agents can be replied to */}
      {!isCollapsed && onReply && (
        <div className={`px-3 py-2 border-t ${palette.border}`}>
          <button
            onClick={() => onReply(message.id)}
            className={`text-xs ${palette.text} hover:opacity-70 transition-colors`}
          >
            Reply
          </button>
        </div>
      )}

      {/* Source handle - bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: palette.handle }}
        className="w-3! h-3! border-2! border-white!"
      />
    </div>
  );
});

export const nodeTypes = {
  user: UserNode,
  agent: AgentNode,
};
