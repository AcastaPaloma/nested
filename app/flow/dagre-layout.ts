import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData, FlowEdgeData } from "./types";

const NODE_WIDTH = 280;
const NODE_HEIGHT = 120;
const HORIZONTAL_SPACING = 100; // Space between trees

export type LayoutDirection = "TB" | "LR";

export function getLayoutedElements(
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[],
  direction: LayoutDirection = "TB"
): { nodes: Node<FlowNodeData>[]; edges: Edge<FlowEdgeData>[] } {
  if (nodes.length === 0) return { nodes, edges };

  // Find roots (nodes without incoming reply edges)
  const replyEdges = edges.filter((e) => e.type === "reply");
  const nodesWithParent = new Set(replyEdges.map((e) => e.target));
  const roots = nodes.filter((n) => !nodesWithParent.has(n.id));

  // Group nodes by their root tree
  const nodesByTree = new Map<string, Node<FlowNodeData>[]>();
  const nodeToTree = new Map<string, string>();

  const assignToTree = (nodeId: string, treeId: string) => {
    if (nodeToTree.has(nodeId)) return;
    nodeToTree.set(nodeId, treeId);

    const treeNodes = nodesByTree.get(treeId) ?? [];
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      treeNodes.push(node);
      nodesByTree.set(treeId, treeNodes);
    }

    // Find children via reply edges
    const childEdges = replyEdges.filter((e) => e.source === nodeId);
    for (const edge of childEdges) {
      assignToTree(edge.target, treeId);
    }
  };

  // Assign nodes to trees
  for (const root of roots) {
    assignToTree(root.id, root.id);
  }

  // Layout each tree separately
  const layoutedNodes: Node<FlowNodeData>[] = [];
  let currentX = 0;

  for (const [treeId, treeNodes] of nodesByTree.entries()) {
    const treeEdges = replyEdges.filter(
      (e) => nodeToTree.get(e.source) === treeId
    );

    // Create dagre graph for this tree
    const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
      rankdir: direction,
      nodesep: 50,
      ranksep: 80,
      marginx: 20,
      marginy: 20,
    });

    // Add nodes
    for (const node of treeNodes) {
      dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    // Add edges
    for (const edge of treeEdges) {
      dagreGraph.setEdge(edge.source, edge.target);
    }

    // Run layout
    dagre.layout(dagreGraph);

    // Get tree bounds
    let minX = Infinity;
    let maxX = -Infinity;

    for (const node of treeNodes) {
      const nodeWithPosition = dagreGraph.node(node.id);
      if (nodeWithPosition) {
        minX = Math.min(minX, nodeWithPosition.x - NODE_WIDTH / 2);
        maxX = Math.max(maxX, nodeWithPosition.x + NODE_WIDTH / 2);
      }
    }

    // Offset to position tree
    const treeWidth = maxX - minX;
    const offsetX = currentX - minX;

    // Apply positions
    for (const node of treeNodes) {
      const nodeWithPosition = dagreGraph.node(node.id);
      if (nodeWithPosition) {
        layoutedNodes.push({
          ...node,
          position: {
            x: nodeWithPosition.x - NODE_WIDTH / 2 + offsetX,
            y: nodeWithPosition.y - NODE_HEIGHT / 2,
          },
        });
      }
    }

    // Move X cursor for next tree
    currentX += treeWidth + HORIZONTAL_SPACING;
  }

  return { nodes: layoutedNodes, edges };
}

// Get the position to zoom to for a new node
export function getZoomPosition(
  nodes: Node<FlowNodeData>[],
  nodeId: string
): { x: number; y: number; zoom: number } | null {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  return {
    x: node.position.x + NODE_WIDTH / 2,
    y: node.position.y + NODE_HEIGHT / 2,
    zoom: 1,
  };
}
