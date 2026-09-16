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

  // Build simulation nodes only when graph topology changes
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
      return {
        ...n,
        x: prev ? prev.x : initialX,
        y: prev ? prev.y : initialY,
        vx: prev ? prev.vx : 0,
        vy: prev ? prev.vy : 0,
        radius: prev ? prev.radius : 18,
        color: prev ? prev.color : "#00f0ff",
        glowColor: prev ? prev.glowColor : "rgba(0, 240, 255, 0.5)",
        isSupporting: false,
        isTraversed: false,
        isPruned: false,
        isKept: false,
        isCandidate: true,
        hopNumber: null,
      };
    });

    nodesRef.current = simNodes;
  }, [graphData.nodes, height]);

  // Update visual styles on existing nodes smoothly in-place without touching physics positions
  useEffect(() => {
    if (nodesRef.current.length === 0) return;

    nodesRef.current.forEach((node) => {
      const isSup = supportingIndices.has(node.id);
      const isTrav = traversedSet.has(node.id);
      const isPrune = prunedSet.has(node.id);
      const isKept = keptSet.has(node.id);
      const isCand = activeCandidateSet.has(node.id);
      const hopNum = hopMap.get(node.id) ?? null;

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

      node.color = color;
      node.glowColor = glowColor;
      node.radius = nodeRadius;
      node.isSupporting = isSup;
      node.isTraversed = isTrav;
      node.isPruned = isPrune;
      node.isKept = isKept;
      node.isCandidate = isCand;
      node.hopNumber = hopNum;
    });
  }, [supportingIndices, traversedSet, prunedSet, keptSet, activeCandidateSet, hopMap, playbackFrame]);

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

      // Collect explicit traversal edges from playbackFrame or consecutive traversed nodes
      const activeTraversalEdges: Array<{ source: number; target: number; stepNum?: number }> = [];
      if (playbackFrame?.traversalEdges && playbackFrame.traversalEdges.length > 0) {
        playbackFrame.traversalEdges.forEach((e, idx) => {
          activeTraversalEdges.push({ ...e, stepNum: idx + 1 });
        });
      } else if (traversedSet.size >= 2) {
        const travArr = Array.from(traversedSet);
        for (let i = 0; i < travArr.length - 1; i++) {
          activeTraversalEdges.push({ source: travArr[i], target: travArr[i + 1], stepNum: i + 1 });
        }
      }

      const traversalEdgeKeySet = new Set(
        activeTraversalEdges.map((e) => `${Math.min(e.source, e.target)}-${Math.max(e.source, e.target)}`)
      );

      // 1. Draw Base Semantic Similarity Edges
      for (const edge of edges) {
        const source = nodeIndexMap.get(edge.source);
        const target = nodeIndexMap.get(edge.target);
        if (!source || !target) continue;

        const key = `${Math.min(edge.source, edge.target)}-${Math.max(edge.source, edge.target)}`;
        if (traversalEdgeKeySet.has(key)) continue; // Traversal edges rendered in dedicated high-energy pass

        const isSupportingLink = source.isSupporting && target.isSupporting;
        const isCandidateLink =
          (source.isTraversed && target.isCandidate) || (target.isTraversed && source.isCandidate);

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);

        if (isSupportingLink) {
          ctx.strokeStyle = "rgba(16, 185, 129, 0.75)";
          ctx.lineWidth = 2.5;
          ctx.shadowColor = "rgba(16, 185, 129, 0.8)";
          ctx.shadowBlur = 8;
          ctx.setLineDash([]);
        } else if (isCandidateLink) {
          ctx.strokeStyle = "rgba(0, 240, 255, 0.45)";
          ctx.lineWidth = 1.6;
          ctx.shadowColor = "rgba(0, 240, 255, 0.6)";
          ctx.shadowBlur = 6;
          ctx.setLineDash([5, 4]);
          ctx.lineDashOffset = -localPulse * 16;
        } else {
          ctx.strokeStyle = "rgba(0, 240, 255, 0.12)";
          ctx.lineWidth = 1;
          ctx.shadowBlur = 0;
          ctx.setLineDash([]);
        }

        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        // Flowing green photons along supporting evidence links
        if (isSupportingLink) {
          const t = (localPulse * 0.7) % 1;
          const px = source.x + (target.x - source.x) * t;
          const py = source.y + (target.y - source.y) * t;

          ctx.beginPath();
          ctx.arc(px, py, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = "#34d399";
          ctx.shadowColor = "#10b981";
          ctx.shadowBlur = 10;
          ctx.fill();
        }
      }

      // 2. Dedicated High-Energy Traversal Laser Beams Pass
      for (const tEdge of activeTraversalEdges) {
        const source = nodeIndexMap.get(tEdge.source);
        const target = nodeIndexMap.get(tEdge.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;

        // Start and end points slightly offset by node radii
        const startX = source.x + ux * source.radius;
        const startY = source.y + uy * source.radius;
        const endX = target.x - ux * target.radius;
        const endY = target.y - uy * target.radius;

        // Outer Neon Glow Halo
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = "rgba(192, 132, 252, 0.35)";
        ctx.lineWidth = 9;
        ctx.shadowColor = "#a855f7";
        ctx.shadowBlur = 18;
        ctx.stroke();

        // High-Energy Core Laser Beam
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = "#c084fc";
        ctx.lineWidth = 3.5;
        ctx.shadowColor = "#d946ef";
        ctx.shadowBlur = 8;
        ctx.stroke();

        // Hyper-bright Central White Filament
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.2;
        ctx.shadowBlur = 0;
        ctx.stroke();
        ctx.restore();

        // Flowing Tri-Photon Packets with Energy Trails
        for (let p = 0; p < 3; p++) {
          const t = ((localPulse * 0.75 + p * 0.33) % 1);
          const px = startX + (endX - startX) * t;
          const py = startY + (endY - startY) * t;

          // Photon Head
          ctx.beginPath();
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = p === 0 ? "#ffffff" : "#e879f9";
          ctx.shadowColor = "#c084fc";
          ctx.shadowBlur = 12;
          ctx.fill();

          // Photon Comet Tail
          const tailLen = 14;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - ux * tailLen, py - uy * tailLen);
          ctx.strokeStyle = "rgba(232, 121, 249, 0.6)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Directional Chevron Arrow (pointing from source to target)
        const midT = 0.55;
        const arrowX = startX + (endX - startX) * midT;
        const arrowY = startY + (endY - startY) * midT;
        const arrowSize = 7;
        const perpX = -uy * arrowSize;
        const perpY = ux * arrowSize;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(arrowX - ux * arrowSize + perpX, arrowY - uy * arrowSize + perpY);
        ctx.lineTo(arrowX, arrowY);
        ctx.lineTo(arrowX - ux * arrowSize - perpX, arrowY - uy * arrowSize - perpY);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.2;
        ctx.shadowColor = "#a855f7";
        ctx.shadowBlur = 8;
        ctx.stroke();

        // Hop Transition Badge on Edge
        const badgeX = startX + (endX - startX) * 0.35;
        const badgeY = startY + (endY - startY) * 0.35;
        const badgeText = tEdge.stepNum ? `Hop ${tEdge.stepNum}➔${tEdge.stepNum + 1}` : "Traversal";

        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const txtWidth = ctx.measureText(badgeText).width + 8;

        ctx.fillStyle = "rgba(10, 6, 20, 0.85)";
        ctx.strokeStyle = "rgba(192, 132, 252, 0.7)";
        ctx.lineWidth = 1;
        ctx.roundRect(badgeX - txtWidth / 2, badgeY - 7, txtWidth, 14, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#e9d5ff";
        ctx.fillText(badgeText, badgeX, badgeY);
        ctx.restore();
      }

      // Draw Nodes
      for (const node of nodes) {
        const isHovered = hoveredNode?.id === node.id;
        const radius = node.radius + (isHovered ? 4 : 0);

        // Radar ping sonar ripples for active candidates
        if (node.isCandidate) {
          ctx.save();
          const ripple1 = (localPulse * 22) % 32;
          const alpha1 = Math.max(0, 1 - ripple1 / 32);
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + ripple1, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(0, 240, 255, ${alpha1 * 0.75})`;
          ctx.lineWidth = 1.8;
          ctx.stroke();

          const ripple2 = (localPulse * 22 + 16) % 32;
          const alpha2 = Math.max(0, 1 - ripple2 / 32);
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + ripple2, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(0, 240, 255, ${alpha2 * 0.75})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.restore();
        }

        ctx.save();

        // Glowing outer halo
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.shadowColor = node.glowColor;
        ctx.shadowBlur = node.isSupporting ? 20 : node.isTraversed ? 16 : node.isCandidate ? 12 : 6;

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
        } else if (node.isKept) {
          grad.addColorStop(0, "#34d399");
          grad.addColorStop(1, "#047857");
        } else {
          grad.addColorStop(0, "#22d3ee");
          grad.addColorStop(1, "#0e7490");
        }

        ctx.fillStyle = grad;
        ctx.fill();

        // Node border
        ctx.lineWidth = node.isSupporting ? 2.8 : isHovered ? 2.5 : 1.5;
        ctx.strokeStyle = node.isSupporting
          ? "#6ee7b7"
          : node.isTraversed
          ? "#e9d5ff"
          : node.isPruned
          ? "#fca5a5"
          : node.isKept
          ? "#a7f3d0"
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

        // Status Badge at top right of node
        ctx.save();
        if (node.isSupporting) {
          ctx.font = "bold 11px sans-serif";
          ctx.fillStyle = "#fef08a";
          ctx.shadowColor = "#eab308";
          ctx.shadowBlur = 6;
          ctx.fillText("★", node.x + radius * 0.7, node.y - radius * 0.7);
        } else if (node.isPruned) {
          ctx.font = "bold 11px sans-serif";
          ctx.fillStyle = "#f43f5e";
          ctx.shadowColor = "#881337";
          ctx.shadowBlur = 6;
          ctx.fillText("✕", node.x + radius * 0.7, node.y - radius * 0.7);
        } else if (node.isKept) {
          ctx.font = "bold 11px sans-serif";
          ctx.fillStyle = "#34d399";
          ctx.shadowColor = "#059669";
          ctx.shadowBlur = 6;
          ctx.fillText("✓", node.x + radius * 0.7, node.y - radius * 0.7);
        }
        ctx.restore();

        // Title label underneath
        ctx.font = "10px sans-serif";
        ctx.fillStyle = isHovered ? "#38bdf8" : "rgba(226, 232, 240, 0.85)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        const titleText = node.title.length > 18 ? `${node.title.slice(0, 16)}…` : node.title;
        ctx.fillText(titleText, node.x, node.y + radius + 5);

        // Hop / Candidate tag badge above node
        if (node.hopNumber) {
          ctx.fillStyle = "#c084fc";
          ctx.font = "bold 9px monospace";
          ctx.fillText(`HOP ${node.hopNumber}`, node.x, node.y - radius - 12);
        } else if (node.isCandidate) {
          ctx.fillStyle = "#38bdf8";
          ctx.font = "bold 8px monospace";
          ctx.fillText("SCANNING", node.x, node.y - radius - 11);
        }
      }

      // Draw Tooltip Card for hovered node
      if (hoveredNode) {
        ctx.save();
        const cardW = 220;
        const cardH = 74;
        let cardX = hoveredNode.x + hoveredNode.radius + 14;
        let cardY = hoveredNode.y - cardH / 2;

        if (cardX + cardW > w - 20) {
          cardX = hoveredNode.x - hoveredNode.radius - cardW - 14;
        }
        if (cardY < 10) cardY = 10;
        if (cardY + cardH > h - 10) cardY = h - cardH - 10;

        ctx.fillStyle = "rgba(4, 7, 15, 0.92)";
        ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
        ctx.lineWidth = 1;
        ctx.shadowColor = "rgba(56, 189, 248, 0.3)";
        ctx.shadowBlur = 12;
        ctx.roundRect(cardX, cardY, cardW, cardH, 10);
        ctx.fill();
        ctx.stroke();

        // Card Title
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        const titleLine = hoveredNode.title.length > 26 ? `${hoveredNode.title.slice(0, 24)}...` : hoveredNode.title;
        ctx.fillText(titleLine, cardX + 10, cardY + 10);

        // Card Status
        ctx.font = "9px monospace";
        let statusColor = "#38bdf8";
        let statusText = "● Candidate Node";
        if (hoveredNode.isSupporting) {
          statusColor = "#34d399";
          statusText = "★ Supporting Evidence";
        } else if (hoveredNode.isTraversed) {
          statusColor = "#c084fc";
          statusText = `● Traversed Hop ${hoveredNode.hopNumber ?? ""}`;
        } else if (hoveredNode.isPruned) {
          statusColor = "#f43f5e";
          statusText = "✕ Pruned by IsREL";
        } else if (hoveredNode.isKept) {
          statusColor = "#34d399";
          statusText = "✓ Kept by IsREL";
        }

        ctx.fillStyle = statusColor;
        ctx.fillText(statusText, cardX + 10, cardY + 27);

        // Snippet snippet
        ctx.font = "9px sans-serif";
        ctx.fillStyle = "#94a3b8";
        const snip = (hoveredNode.snippet || hoveredNode.text || "").slice(0, 48);
        ctx.fillText(`${snip}...`, cardX + 10, cardY + 44);

        ctx.fillStyle = "#0284c7";
        ctx.font = "8px monospace";
        ctx.fillText("Click to inspect full passage", cardX + 10, cardY + 58);
        ctx.restore();
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

  // Native non-passive wheel zoom handler prevents page jumping/scrolling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleNativeWheel(e: WheelEvent) {
      e.preventDefault();
      if (!canvas) return;
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const current = transformRef.current;
      const newScale = Math.min(Math.max(current.scale * zoomFactor, 0.35), 3.5);

      current.x = mouseX - (mouseX - current.x) * (newScale / current.scale);
      current.y = mouseY - (mouseY - current.y) * (newScale / current.scale);
      current.scale = newScale;
    }

    canvas.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleNativeWheel);
    };
  }, []);

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
