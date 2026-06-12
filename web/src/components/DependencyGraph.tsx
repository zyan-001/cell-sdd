import { useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type ReactFlowInstance,
  MarkerType,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { api } from '../api';
import type { GraphData } from '../types';

interface DependencyGraphProps {
  selectedCellId: string | null;
  onSelectCell: (id: string) => void;
  refreshKey: number;
}

interface CellNodeData {
  label: string;
  version: number;
  kind: string | null;
  entity: string | null;
  tags: string[];
  stale: string[];
  selected?: boolean;
  [key: string]: unknown;
}

function CellNode({ data }: { data: CellNodeData }) {
  const isStale = data.stale && data.stale.length > 0;
  const isSelected = data.selected;
  return (
    <div
      style={{
        padding: '8px 16px',
        borderRadius: 8,
        background: isSelected
          ? '#1a1a2e'
          : isStale
          ? '#fff3cd'
          : '#ffffff',
        border: isSelected
          ? '2px solid #6c63ff'
          : isStale
          ? '2px solid #ffc107'
          : '2px solid #e0e0e0',
        color: isSelected ? '#ffffff' : '#333333',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        minWidth: 100,
        textAlign: 'center',
        position: 'relative',
        boxShadow: isSelected
          ? '0 4px 12px rgba(108,99,255,0.3)'
          : '0 2px 6px rgba(0,0,0,0.08)',
        transition: 'all 0.2s ease',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <div>{String(data.label)}</div>
      {data.kind && (
        <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 400 }}>
          {String(data.kind)}
        </div>
      )}
      {data.entity && (
        <div style={{ fontSize: 10, color: isSelected ? '#74b9ff' : '#0984e3', fontWeight: 400 }}>
          @{String(data.entity)}
        </div>
      )}
      {isStale && (
        <div
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#ffc107',
            border: '2px solid white',
          }}
        />
      )}
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  );
}

const nodeTypes = { cellNode: CellNode };
const NODE_WIDTH = 180;
const NODE_HEIGHT = 84;

function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: 'TB',
    ranksep: 72,
    nodesep: 36,
    marginx: 24,
    marginy: 24,
  });

  nodes.forEach((node) => {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  return nodes.map((node) => {
    const pos = graph.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });
}

export default function DependencyGraph({ selectedCellId, onSelectCell, refreshKey }: DependencyGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null);
  const initialFitDone = useRef(false);

  // Load graph data — only on mount or when refreshKey changes
  const loadGraph = useCallback(async (fitOnLoad: boolean) => {
    try {
      const data: GraphData = await api.getGraphData();

      const reactNodes: Node[] = data.nodes.map((n) => ({
        id: n.id,
        type: 'cellNode',
        position: { x: 0, y: 0 },
        data: {
          ...n.data,
          selected: n.id === selectedCellId,
        },
      }));
      const reactEdges: Edge[] = data.edges.map((e) => {
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          animated: true,
          label: e.depKind || undefined,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#6c63ff' },
          style: { stroke: '#6c63ff', strokeWidth: 2 },
          labelStyle: { fill: '#888', fontSize: 10, fontWeight: 500 },
          labelBgStyle: { fill: '#f8f8f8', fillOpacity: 0.9 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 3,
        };
      });
      setNodes(layoutNodes(reactNodes, reactEdges));
      setEdges(reactEdges);
      initialFitDone.current = fitOnLoad;
    } catch (err) {
      console.error('Failed to load graph:', err);
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]); // intentionally NOT depending on selectedCellId

  // Load on mount
  useEffect(() => {
    loadGraph(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when refreshKey changes (e.g. after cell CRUD)
  useEffect(() => {
    if (refreshKey > 0) {
      loadGraph(true);
    }
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update selected state without reloading graph
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, selected: n.id === selectedCellId },
      }))
    );
  }, [selectedCellId, setNodes]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectCell(node.id);
    },
    [onSelectCell]
  );

  const handleAutoLayout = useCallback(() => {
    setNodes((currentNodes) => layoutNodes(currentNodes, edges));
    setTimeout(() => {
      flowInstance?.fitView({ padding: 0.3 });
    }, 0);
  }, [edges, flowInstance, setNodes]);

  if (loading) {
    return <div style={{ padding: 20, color: '#999' }}>Loading graph...</div>;
  }

  if (nodes.length === 0) {
    return (
      <div style={{ padding: 20, color: '#999', textAlign: 'center' }}>
        No cells yet. Create your first cell!
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <button
        onClick={handleAutoLayout}
        className="btn btn-sm"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 5,
          background: 'var(--surface)',
        }}
      >
        Auto Layout
      </button>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView={initialFitDone.current}
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        onInit={setFlowInstance}
      >
        <Background color="#e0e0e0" gap={20} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => (n.data?.selected ? '#6c63ff' : '#e0e0e0')}
          maskColor="rgba(0,0,0,0.05)"
        />
      </ReactFlow>
    </div>
  );
}
