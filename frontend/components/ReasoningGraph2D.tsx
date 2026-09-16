"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { GraphData, GraphNode } from "@/lib/api";
import type { PlaybackFrame } from "./ReasoningPlayback";

type SimNode = GraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  glowColor: string;
  isSupporting: boolean;
  isTraversed: boolean;
  isPruned: boolean;
  isKept: boolean;
  isCandidate: boolean;
  hopNumber: number | null;
};

type ReasoningGraph2DProps = {
  graphData: GraphData;
  hopTrace?: Array<Record<string, unknown>>;
  supportingPassages?: string[];
  playbackFrame?: PlaybackFrame;
  onSelectNode?: (node: GraphNode) => void;
  activeHop?: number | null;
  height?: number;
};

export default function ReasoningGraph2D({
  graphData,
  hopTrace = [],
  supportingPassages = [],
  playbackFrame,
  onSelectNode,
  activeHop,
  height = 520,
}: ReasoningGraph2DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const isDraggingNodeRef = useRef<SimNode | null>(null);
  const isPanningRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);

  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [pulseTime, setPulseTime] = useState(0);

  // Pre-calculate node classifications
  const { traversedSet, prunedSet, hopMap, supportingIndices, keptSet, activeCandidateSet } = useMemo(() => {
    if (playbackFrame) {
      return {
        traversedSet: new Set<number>(playbackFrame.traversedNodeIds),
        prunedSet: new Set<number>(playbackFrame.prunedNodeIds),
        hopMap: new Map<number, number>(),
        supportingIndices: new Set<number>(playbackFrame.supportingNodeIds),
        keptSet: new Set<number>(playbackFrame.keptNodeIds),
        activeCandidateSet: new Set<number>(playbackFrame.activeCandidateIds),
      };
    }

    const traversed = new Set<number>();
    const pruned = new Set<number>();
    const hopM = new Map<number, number>();

    hopTrace.forEach((h, hIdx) => {
      const hopNum = (typeof h.hop === "number" ? h.hop : hIdx + 1);
      const selected = Array.isArray(h.selected_passages) ? h.selected_passages : [];
      selected.forEach((idx) => {
        const num = Number(idx);
        traversed.add(num);
        hopM.set(num, hopNum);
      });

      const decisions = (h.isrel_decisions && typeof h.isrel_decisions === "object")
        ? (h.isrel_decisions as Record<string, boolean>)
        : {};
      Object.entries(decisions).forEach(([k, isRel]) => {
        if (!isRel) {
          pruned.add(Number(k));
        }
      });
    });

    const supIndices = new Set<number>();
    graphData.nodes.forEach((n) => {
      const matchesSupporting = supportingPassages.some((sp) =>
        sp.includes(n.title) || n.text.includes(sp) || sp.includes(n.text.slice(0, 40))
      );
      if (matchesSupporting) {
        supIndices.add(n.id);
      }
    });

    return {
      traversedSet: traversed,
      prunedSet: pruned,
      hopMap: hopM,
      supportingIndices: supIndices,
      keptSet: new Set<number>(),
      activeCandidateSet: new Set<number>(),
    };
  }, [hopTrace, supportingPassages, graphData.nodes, playbackFrame]);

  // Build simulation nodes
  useEffect(() => {
    const width = canvasRef.current?.parentElement?.clientWidth || 800;
    const heightLocal = height;
    const count = graphData.nodes.length || 1;
    const radius = Math.min(width, heightLocal) * 0.35;

    const existingMap = new Map(nodesRef.current.map((n) => [n.id, n]));

    const simNodes: SimNode[] = graphData.nodes.map((n, i) => {
      const angle = (i / count) * 2 * Math.PI;
      const initialX = width / 2 + radius * Math.cos(angle) + (Math.random() - 0.5) * 40;
      const initialY = heightLocal / 2 + radius * Math.sin(angle) + (Math.random() - 0.5) * 40;

      const prev = existingMap.get(n.id);
      const isSup = supportingIndices.has(n.id);
      const isTrav = traversedSet.has(n.id);
      const isPrune = prunedSet.has(n.id);
      const isKept = keptSet.has(n.id);
      const isCand = activeCandidateSet.has(n.id);
      const hopNum = hopMap.get(n.id) ?? null;

      let color = "#64748b"; // neutral slate
      let glowColor = "rgba(100, 116, 139, 0.3)";
      let nodeRadius = 17;

      if (isSup) {
        color = "#10b981"; // emerald
        glowColor = "rgba(16, 185, 129, 0.8)";
        nodeRadius = 24;
      } else if (isTrav) {
        color = "#a855f7"; // violet
        glowColor = "rgba(168, 85, 247, 0.7)";
        nodeRadius = 21;
      } else if (isKept) {
        color = "#34d399"; // bright emerald
        glowColor = "rgba(52, 211, 153, 0.7)";
        nodeRadius = 20;
      } else if (isPrune) {
        color = "#f43f5e"; // ruby
        glowColor = "rgba(244, 63, 94, 0.3)";
        nodeRadius = 14;
      } else if (isCand || !playbackFrame) {
        color = "#00f0ff"; // cyan candidate
        glowColor = "rgba(0, 240, 255, 0.5)";
        nodeRadius = 18;
      }

      return {
        ...n,
        x: prev ? prev.x : initialX,
        y: prev ? prev.y : initialY,
        vx: prev ? prev.vx : 0,
        vy: prev ? prev.vy : 0,
        radius: nodeRadius,
        color,
        glowColor,
        isSupporting: isSup,
        isTraversed: isTrav,
        isPruned: isPrune,
        isKept,
        isCandidate: isCand,
        hopNumber: hopNum,
      };
    });

    nodesRef.current = simNodes;
  }, [graphData.nodes, supportingIndices, traversedSet, prunedSet, hopMap, height]);

  // Main Canvas Simulation & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let localPulse = 0;

    function resize() {
      if (!canvas || !canvas.parentElement) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.parentElement.clientWidth;
      const h = height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx?.scale(dpr, dpr);
    }

    resize();
    window.addEventListener("resize", resize);

    function tick() {
      if (!canvas || !ctx) return;
      const w = canvas.parentElement?.clientWidth || 800;
      const h = height;
      localPulse += 0.04;

      const nodes = nodesRef.current;
      const edges = graphData.edges;

      // 1. Force Physics Simulation
      const kRepel = 2400;
      const springLength = 110;
      const kSpring = 0.025;
      const centerGravity = 0.003;
      const damping = 0.88;

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const distSq = dx * dx + dy * dy + 100;
          const dist = Math.sqrt(distSq);
          const force = kRepel / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // Spring forces along semantic edges
      const nodeIndexMap = new Map<number, SimNode>();
      nodes.forEach((n) => nodeIndexMap.set(n.id, n));

      for (const edge of edges) {
        const source = nodeIndexMap.get(edge.source);
        const target = nodeIndexMap.get(edge.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const displacement = dist - springLength;
        const force = displacement * kSpring;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        source.vx += fx;
        source.vy += fy;
        target.vx -= fx;
        target.vy -= fy;
      }

      // Center gravity & update positions
      const cx = w / 2;
      const cy = h / 2;

      for (const node of nodes) {
        if (node === isDraggingNodeRef.current) {
          node.vx = 0;
          node.vy = 0;
          continue;
        }

        node.vx += (cx - node.x) * centerGravity;
        node.vy += (cy - node.y) * centerGravity;

        node.vx *= damping;
        node.vy *= damping;

        node.x += node.vx;
        node.y += node.vy;

        // Boundary constraint
        const pad = node.radius + 10;
        if (node.x < pad) node.x = pad;
        if (node.x > w - pad) node.x = w - pad;
        if (node.y < pad) node.y = pad;
        if (node.y > h - pad) node.y = h - pad;
      }

      // 2. Clear and Render
      ctx.clearRect(0, 0, w, h);

      ctx.save();
      const { x: tx, y: ty, scale } = transformRef.current;
      ctx.translate(tx, ty);
      ctx.scale(scale, scale);

      // Draw subtle background grid lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = -w; x < w * 2; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, -h);
        ctx.lineTo(x, h * 2);
        ctx.stroke();
      }
      for (let y = -h; y < h * 2; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(-w, y);
        ctx.lineTo(w * 2, y);
        ctx.stroke();
      }

      // Draw Edges
      for (const edge of edges) {
        const source = nodeIndexMap.get(edge.source);
        const target = nodeIndexMap.get(edge.target);
        if (!source || !target) continue;

        const isBothTraversed = source.isTraversed && target.isTraversed;
        const isSupportingLink = source.isSupporting && target.isSupporting;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);

        if (isSupportingLink) {
          ctx.strokeStyle = "rgba(16, 185, 129, 0.7)";
          ctx.lineWidth = 2.5;
          ctx.shadowColor = "rgba(16, 185, 129, 0.8)";
          ctx.shadowBlur = 8;
        } else if (isBothTraversed) {
          ctx.strokeStyle = "rgba(168, 85, 247, 0.7)";
          ctx.lineWidth = 2;
          ctx.shadowColor = "rgba(168, 85, 247, 0.8)";
          ctx.shadowBlur = 6;
        } else {
          ctx.strokeStyle = "rgba(0, 240, 255, 0.15)";
          ctx.lineWidth = 1;
          ctx.shadowBlur = 0;
        }

        ctx.stroke();

        // Traveling photon pulse along traversed edges
        if (isBothTraversed || isSupportingLink) {
          const t = (localPulse * 0.8) % 1;
          const px = source.x + (target.x - source.x) * t;
          const py = source.y + (target.y - source.y) * t;

          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fillStyle = isSupportingLink ? "#10b981" : "#c084fc";
          ctx.shadowColor = isSupportingLink ? "#10b981" : "#c084fc";
          ctx.shadowBlur = 10;
          ctx.fill();
        }
      }

      // Draw Nodes
      for (const node of nodes) {
        const isHovered = hoveredNode?.id === node.id;
        const radius = node.radius + (isHovered ? 4 : 0);

        ctx.save();

        // Glowing outer halo
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.shadowColor = node.glowColor;
        ctx.shadowBlur = node.isSupporting ? 18 : node.isTraversed ? 14 : 8;

        // Node fill
        const grad = ctx.createRadialGradient(
          node.x - radius * 0.3,
          node.y - radius * 0.3,
          radius * 0.1,
          node.x,
          node.y,
          radius
        );

        if (node.isSupporting) {
          grad.addColorStop(0, "#34d399");
          grad.addColorStop(1, "#065f46");
        } else if (node.isTraversed) {
          grad.addColorStop(0, "#c084fc");
          grad.addColorStop(1, "#581c87");
        } else if (node.isPruned) {
          grad.addColorStop(0, "rgba(244, 63, 94, 0.4)");
          grad.addColorStop(1, "rgba(76, 5, 25, 0.6)");
        } else {
          grad.addColorStop(0, "#22d3ee");
          grad.addColorStop(1, "#0e7490");
        }

        ctx.fillStyle = grad;
        ctx.fill();

        // Node border
        ctx.lineWidth = node.isSupporting ? 2.5 : 1.5;
        ctx.strokeStyle = node.isSupporting
          ? "#6ee7b7"
          : node.isTraversed
          ? "#e9d5ff"
          : node.isPruned
          ? "#fca5a5"
          : "#67e8f9";

        if (node.isPruned) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke();
        ctx.restore();

        // Node ID text in center
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.round(radius * 0.85)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(node.id), node.x, node.y);

        // Title label underneath
        ctx.font = "10px sans-serif";
        ctx.fillStyle = isHovered ? "#38bdf8" : "rgba(226, 232, 240, 0.85)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        const titleText = node.title.length > 18 ? `${node.title.slice(0, 16)}…` : node.title;
        ctx.fillText(titleText, node.x, node.y + radius + 4);

        // Hop badge
        if (node.hopNumber) {
          ctx.fillStyle = "#a855f7";
          ctx.font = "bold 9px monospace";
          ctx.fillText(`HOP ${node.hopNumber}`, node.x, node.y - radius - 12);
        }
      }

      ctx.restore();
      animFrameIdRef.current = requestAnimationFrame(tick);
    }

    animFrameIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [graphData.edges, height, hoveredNode]);

  // Coordinate conversion helpers
  function getCanvasCoords(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const rawX = clientX - rect.left;
    const rawY = clientY - rect.top;
    const { x: tx, y: ty, scale } = transformRef.current;
    return {
      x: (rawX - tx) / scale,
      y: (rawY - ty) / scale,
    };
  }

  function findNodeAt(x: number, y: number): SimNode | null {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const dx = x - node.x;
      const dy = y - node.y;
      if (dx * dx + dy * dy <= (node.radius + 6) * (node.radius + 6)) {
        return node;
      }
    }
    return null;
  }

  function handleMouseDown(e: React.MouseEvent) {
    const coords = getCanvasCoords(e.clientX, e.clientY);
    const hit = findNodeAt(coords.x, coords.y);
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    hasMovedRef.current = false;

    if (hit) {
      isDraggingNodeRef.current = hit;
    } else {
      isPanningRef.current = true;
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMovedRef.current = true;
    }

    if (isDraggingNodeRef.current) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      isDraggingNodeRef.current.x = coords.x;
      isDraggingNodeRef.current.y = coords.y;
    } else if (isPanningRef.current) {
      transformRef.current.x += dx;
      transformRef.current.y += dy;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    } else {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      const hit = findNodeAt(coords.x, coords.y);
      setHoveredNode(hit);
    }
  }

  function handleMouseUp() {
    if (!hasMovedRef.current && isDraggingNodeRef.current) {
      onSelectNode?.(isDraggingNodeRef.current);
    }
    isDraggingNodeRef.current = null;
    isPanningRef.current = false;
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const current = transformRef.current;
    const newScale = Math.min(Math.max(current.scale * zoomFactor, 0.4), 3.0);

    current.x = mouseX - (mouseX - current.x) * (newScale / current.scale);
    current.y = mouseY - (mouseY - current.y) * (newScale / current.scale);
    current.scale = newScale;
  }

  function handleResetView() {
    transformRef.current = { x: 0, y: 0, scale: 1 };
    const width = canvasRef.current?.parentElement?.clientWidth || 800;
    const count = nodesRef.current.length || 1;
    const radius = Math.min(width, height) * 0.35;

    nodesRef.current.forEach((n, i) => {
      const angle = (i / count) * 2 * Math.PI;
      n.x = width / 2 + radius * Math.cos(angle);
      n.y = height / 2 + radius * Math.sin(angle);
      n.vx = 0;
      n.vy = 0;
    });
  }

  function handleZoom(direction: "in" | "out") {
    const factor = direction === "in" ? 1.2 : 0.8;
    const current = transformRef.current;
    const width = canvasRef.current?.parentElement?.clientWidth || 800;
    const cx = width / 2;
    const cy = height / 2;
    const newScale = Math.min(Math.max(current.scale * factor, 0.4), 3.0);
    current.x = cx - (cx - current.x) * (newScale / current.scale);
    current.y = cy - (cy - current.y) * (newScale / current.scale);
    current.scale = newScale;
  }

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-cyan-500/20 bg-[#04060b] shadow-2xl">
      {/* Top HUD Controls Overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-[11px] font-mono font-semibold uppercase tracking-wider text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            2D Force-Directed Graph
          </span>
          <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] font-mono text-slate-400">
            {graphData.nodes.length} nodes · {graphData.edges.length} edges
          </span>
        </div>

        {/* Zoom & Reset Buttons */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={() => handleZoom("in")}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-xs font-bold text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300"
            title="Zoom In"
          >
            +
          </button>
          <button
            onClick={() => handleZoom("out")}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-xs font-bold text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300"
            title="Zoom Out"
          >
            −
          </button>
          <button
            onClick={handleResetView}
            className="rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-[11px] font-mono text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300"
            title="Reset View"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Main Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="cursor-grab active:cursor-grabbing block w-full select-none"
      />

      {/* Bottom Interactive Legend */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 p-4 bg-gradient-to-t from-black/90 to-transparent text-[11px] font-mono text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
            <span className="text-slate-200">Supporting Evidence</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-400 shadow-sm shadow-purple-400" />
            <span className="text-slate-200">Traversed Hop</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400 opacity-60" />
            <span className="text-slate-200">Pruned by IsREL</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
            <span className="text-slate-200">Candidate Neighbor</span>
          </div>
        </div>

        <div className="text-slate-400">
          Click node to inspect · Drag to reposition · Scroll to zoom
        </div>
      </div>
    </div>
  );
}
