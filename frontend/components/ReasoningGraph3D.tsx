"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GraphData, GraphNode } from "@/lib/api";
import type { PlaybackFrame } from "./ReasoningPlayback";

type ReasoningGraph3DProps = {
  graphData: GraphData;
  hopTrace?: Array<Record<string, unknown>>;
  supportingPassages?: string[];
  playbackFrame?: PlaybackFrame;
  onSelectNode?: (node: GraphNode) => void;
  height?: number;
};

export default function ReasoningGraph3D({
  graphData,
  hopTrace = [],
  supportingPassages = [],
  playbackFrame,
  onSelectNode,
  height = 540,
}: ReasoningGraph3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [selectedNodeTitle, setSelectedNodeTitle] = useState<string | null>(null);

  // Classify nodes
  const { traversedSet, prunedSet, hopMap, supportingIndices, keptSet } = useMemo(() => {
    if (playbackFrame) {
      return {
        traversedSet: new Set<number>(playbackFrame.traversedNodeIds),
        prunedSet: new Set<number>(playbackFrame.prunedNodeIds),
        hopMap: new Map<number, number>(),
        supportingIndices: new Set<number>(playbackFrame.supportingNodeIds),
        keptSet: new Set<number>(playbackFrame.keptNodeIds),
      };
    }

    const traversed = new Set<number>();
    const pruned = new Set<number>();
    const hopM = new Map<number, number>();

    hopTrace.forEach((h, hIdx) => {
      const hopNum = typeof h.hop === "number" ? h.hop : hIdx + 1;
      const selected = Array.isArray(h.selected_passages) ? h.selected_passages : [];
      selected.forEach((idx) => {
        const num = Number(idx);
        traversed.add(num);
        hopM.set(num, hopNum);
      });

      const decisions =
        h.isrel_decisions && typeof h.isrel_decisions === "object"
          ? (h.isrel_decisions as Record<string, boolean>)
          : {};
      Object.entries(decisions).forEach(([k, isRel]) => {
        if (!isRel) pruned.add(Number(k));
      });
    });

    const supIndices = new Set<number>();
    graphData.nodes.forEach((n) => {
      const matchesSupporting = supportingPassages.some(
        (sp) => sp.includes(n.title) || n.text.includes(sp) || sp.includes(n.text.slice(0, 40))
      );
      if (matchesSupporting) supIndices.add(n.id);
    });

    return {
      traversedSet: traversed,
      prunedSet: pruned,
      hopMap: hopM,
      supportingIndices: supIndices,
      keptSet: new Set<number>(),
    };
  }, [hopTrace, supportingPassages, graphData.nodes, playbackFrame]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const h = height;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060a);
    scene.fog = new THREE.FogExp2(0x04060a, 0.015);

    const camera = new THREE.PerspectiveCamera(50, width / h, 0.1, 1000);
    camera.position.set(0, 15, 38);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 2. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.8;
    controls.maxDistance = 80;
    controls.minDistance = 10;

    // 3. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const cyanLight = new THREE.PointLight(0x00f0ff, 2.5, 60);
    cyanLight.position.set(20, 20, 20);
    scene.add(cyanLight);

    const purpleLight = new THREE.PointLight(0xa855f7, 2.5, 60);
    purpleLight.position.set(-20, -15, -20);
    scene.add(purpleLight);

    // 4. Background Star/Cosmic Dust Particles
    const particleCount = 450;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 90;
      positions[i + 1] = (Math.random() - 0.5) * 90;
      positions[i + 2] = (Math.random() - 0.5) * 90;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.25,
      transparent: true,
      opacity: 0.4,
    });
    const starField = new THREE.Points(particleGeo, particleMat);
    scene.add(starField);

    // 5. Position Nodes on an 3D Ellipsoid
    const nodes = graphData.nodes;
    const nodeCount = nodes.length || 1;
    const nodeObjects: THREE.Mesh[] = [];
    const nodePositions = new Map<number, THREE.Vector3>();

    // Helper to create text sprite
    function createTextSprite(text: string, color: string): THREE.Sprite {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "rgba(4, 6, 12, 0.75)";
        ctx.roundRect(4, 4, 248, 56, 12);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 20px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, 128, 32);
      }
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(4, 1, 1);
      return sprite;
    }

    nodes.forEach((n, i) => {
      // Golden spiral distribution on sphere
      const phi = Math.acos(1 - (2 * (i + 0.5)) / nodeCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
      const radius = 13 + (i % 3) * 1.5;

      const pos = new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi) * 0.75,
        radius * Math.sin(phi) * Math.sin(theta)
      );
      nodePositions.set(n.id, pos);

      const isSup = supportingIndices.has(n.id);
      const isTrav = traversedSet.has(n.id);
      const isPrune = prunedSet.has(n.id);

      let sphereRadius = 1.2;
      let nodeColor = 0x00f0ff;
      let emissiveColor = 0x005566;
      let labelColor = "#00f0ff";

      if (isSup) {
        sphereRadius = 1.8;
        nodeColor = 0x10b981;
        emissiveColor = 0x047857;
        labelColor = "#10b981";
      } else if (isTrav) {
        sphereRadius = 1.5;
        nodeColor = 0xa855f7;
        emissiveColor = 0x6b21a8;
        labelColor = "#c084fc";
      } else if (isPrune) {
        sphereRadius = 0.9;
        nodeColor = 0xf43f5e;
        emissiveColor = 0x881337;
        labelColor = "#f87171";
      }

      const sphereGeo = new THREE.SphereGeometry(sphereRadius, 24, 24);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: nodeColor,
        emissive: emissiveColor,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.3,
        transparent: isPrune,
        opacity: isPrune ? 0.45 : 1.0,
      });

      const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
      sphereMesh.position.copy(pos);
      sphereMesh.userData = { node: n };
      scene.add(sphereMesh);
      nodeObjects.push(sphereMesh);

      // Label sprite
      const truncatedTitle = n.title.length > 14 ? `${n.title.slice(0, 12)}…` : n.title;
      const sprite = createTextSprite(`#${n.id} ${truncatedTitle}`, labelColor);
      sprite.position.set(pos.x, pos.y + sphereRadius + 1.2, pos.z);
      scene.add(sprite);
    });

    // 6. Connect Edges
    const edges = graphData.edges;
    const edgeLinePositions: number[] = [];
    const edgeColors: number[] = [];

    edges.forEach((edge) => {
      const p1 = nodePositions.get(edge.source);
      const p2 = nodePositions.get(edge.target);
      if (!p1 || !p2) return;

      edgeLinePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);

      const isBothTrav = traversedSet.has(edge.source) && traversedSet.has(edge.target);
      const isBothSup = supportingIndices.has(edge.source) && supportingIndices.has(edge.target);

      if (isBothSup) {
        edgeColors.push(0.06, 0.72, 0.5, 0.06, 0.72, 0.5);
      } else if (isBothTrav) {
        edgeColors.push(0.65, 0.33, 0.96, 0.65, 0.33, 0.96);
      } else {
        edgeColors.push(0.0, 0.6, 0.7, 0.0, 0.6, 0.7);
      }
    });

    if (edgeLinePositions.length > 0) {
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(edgeLinePositions, 3));
      edgeGeo.setAttribute("color", new THREE.Float32BufferAttribute(edgeColors, 3));
      const edgeMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.35,
        linewidth: 1,
      });
      const lines = new THREE.LineSegments(edgeGeo, edgeMat);
      scene.add(lines);
    }

    // 7. Raycaster for Selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function handleClick(e: MouseEvent) {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(nodeObjects);

      if (intersects.length > 0) {
        const clickedMesh = intersects[0].object as THREE.Mesh;
        const targetNode = clickedMesh.userData.node as GraphNode;
        if (targetNode) {
          setSelectedNodeTitle(targetNode.title);
          onSelectNode?.(targetNode);
        }
      }
    }

    renderer.domElement.addEventListener("click", handleClick);

    // 8. Animation Loop
    let animId: number;
    function animate() {
      animId = requestAnimationFrame(animate);
      starField.rotation.y += 0.0003;
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    function handleResize() {
      if (!container) return;
      const w = container.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("click", handleClick);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [graphData, traversedSet, prunedSet, supportingIndices, autoRotate, height, onSelectNode]);

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-purple-500/20 bg-[#030508] shadow-2xl">
      {/* Top HUD Controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/40 bg-purple-400/10 px-3 py-1 text-[11px] font-mono font-semibold uppercase tracking-wider text-purple-300">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
            3D Knowledge Nebula (Three.js)
          </span>
          <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] font-mono text-slate-400">
            WebGL Spatial Orbit
          </span>
        </div>

        {/* Orbit Auto-Rotate Toggle */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-mono transition ${
              autoRotate
                ? "border-purple-400/50 bg-purple-500/20 text-purple-300"
                : "border-white/10 bg-black/60 text-slate-400 hover:text-white"
            }`}
          >
            {autoRotate ? "↻ Orbit: ON" : "⏸ Orbit: OFF"}
          </button>
        </div>
      </div>

      {/* 3D WebGL Canvas Container */}
      <div ref={containerRef} className="cursor-grab active:cursor-grabbing block w-full select-none" />

      {/* Bottom HUD Legend */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 p-4 bg-gradient-to-t from-black/90 to-transparent text-[11px] font-mono text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="text-slate-200">Supporting Node</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-400" />
            <span className="text-slate-200">Traversed Hop</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400 opacity-60" />
            <span className="text-slate-200">Pruned Node</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
            <span className="text-slate-200">Candidate</span>
          </div>
        </div>

        <div className="text-slate-400">
          Left Click + Drag to rotate · Right Click to pan · Scroll to zoom
        </div>
      </div>
    </div>
  );
}
