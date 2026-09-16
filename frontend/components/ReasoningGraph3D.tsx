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
  height = 500,
}: ReasoningGraph3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const nodeMeshesRef = useRef<Map<number, { mesh: THREE.Mesh; label: THREE.Sprite }>>(new Map());
  const onSelectNodeRef = useRef(onSelectNode);

  const [autoRotate, setAutoRotate] = useState(true);
  const [selectedNodeTitle, setSelectedNodeTitle] = useState<string | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    onSelectNodeRef.current = onSelectNode;
  }, [onSelectNode]);

  // Classify nodes
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
      activeCandidateSet: new Set<number>(),
    };
  }, [hopTrace, supportingPassages, graphData.nodes, playbackFrame]);

  // Sync autoRotate state with controlsRef
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // Initialize Three.js Scene ONCE on mount or when graph topology changes
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

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (err) {
      setWebglError(err instanceof Error ? err.message : "WebGL context not available");
      return;
    }

    renderer.setSize(width, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 2. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.8;
    controls.maxDistance = 85;
    controls.minDistance = 8;
    controlsRef.current = controls;

    // 3. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const cyanLight = new THREE.PointLight(0x00f0ff, 2.5, 70);
    cyanLight.position.set(20, 20, 20);
    scene.add(cyanLight);

    const purpleLight = new THREE.PointLight(0xa855f7, 2.5, 70);
    purpleLight.position.set(-20, -15, -20);
    scene.add(purpleLight);

    // 4. Background Star / Cosmic Dust Particles
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

    // Helper to create text sprite
    function createTextSprite(text: string, color: string): THREE.Sprite {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "rgba(4, 6, 12, 0.8)";
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
      texture.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(7, 1.8, 1);
      return sprite;
    }

    // 5. Position Nodes on an 3D Ellipsoid
    const nodes = graphData.nodes;
    const nodeCount = nodes.length || 1;
    const nodeObjects: THREE.Mesh[] = [];
    const nodePositions = new Map<number, THREE.Vector3>();
    const nodeMap = new Map<number, { mesh: THREE.Mesh; label: THREE.Sprite }>();

    nodes.forEach((n, i) => {
      const phi = Math.acos(-1 + (2 * i) / nodeCount);
      const theta = Math.sqrt(nodeCount * Math.PI) * phi;
      const radius = 13.5;

      const pos = new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi) * 0.75,
        radius * Math.sin(phi) * Math.sin(theta)
      );
      nodePositions.set(n.id, pos);

      const sphereGeo = new THREE.SphereGeometry(1.4, 24, 24);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x004455,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.3,
        transparent: false,
        opacity: 1.0,
      });

      const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
      sphereMesh.position.copy(pos);
      sphereMesh.userData = { node: n };
      scene.add(sphereMesh);
      nodeObjects.push(sphereMesh);

      const truncatedTitle = n.title.length > 14 ? `${n.title.slice(0, 12)}…` : n.title;
      const sprite = createTextSprite(`#${n.id} ${truncatedTitle}`, "#00f0ff");
      sprite.position.set(pos.x, pos.y + 2.5, pos.z);
      scene.add(sprite);

      nodeMap.set(n.id, { mesh: sphereMesh, label: sprite });
    });

    nodeMeshesRef.current = nodeMap;

    // 6. Connect Edges
    const edges = graphData.edges;
    const edgeLinePositions: number[] = [];
    const edgeColors: number[] = [];

    edges.forEach((edge) => {
      const p1 = nodePositions.get(edge.source);
      const p2 = nodePositions.get(edge.target);
      if (!p1 || !p2) return;

      edgeLinePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      edgeColors.push(0.0, 0.6, 0.7, 0.0, 0.6, 0.7);
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
          onSelectNodeRef.current?.(targetNode);
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
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
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
  }, [graphData.nodes, graphData.edges, height]);

  // Update node colors & properties smoothly in-place without rebuilding scene
  useEffect(() => {
    nodeMeshesRef.current.forEach(({ mesh }, id) => {
      const isSup = supportingIndices.has(id);
      const isTrav = traversedSet.has(id);
      const isPrune = prunedSet.has(id);
      const isKept = keptSet.has(id);
      const isCand = activeCandidateSet.has(id);

      let color = 0x00f0ff;
      let emissive = 0x004455;
      let scale = 1.0;
      let opacity = 1.0;

      if (isSup) {
        color = 0x10b981; // emerald
        emissive = 0x047857;
        scale = 1.35;
      } else if (isTrav) {
        color = 0xa855f7; // violet
        emissive = 0x6b21a8;
        scale = 1.15;
      } else if (isKept) {
        color = 0x34d399; // bright emerald
        emissive = 0x059669;
        scale = 1.15;
      } else if (isPrune) {
        color = 0xf43f5e; // ruby
        emissive = 0x881337;
        scale = 0.8;
        opacity = 0.4;
      } else if (isCand) {
        color = 0x38bdf8;
        emissive = 0x0284c7;
        scale = 1.1;
      }

      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.color.setHex(color);
        mesh.material.emissive.setHex(emissive);
        mesh.material.opacity = opacity;
        mesh.material.transparent = opacity < 1.0;
        mesh.material.needsUpdate = true;
      }
      mesh.scale.set(scale, scale, scale);
    });
  }, [traversedSet, prunedSet, supportingIndices, keptSet, activeCandidateSet]);

  if (webglError) {
    return (
      <div
        className="relative w-full flex flex-col items-center justify-center p-8 rounded-3xl border border-purple-500/20 bg-[#030508] shadow-2xl text-center space-y-3"
        style={{ height }}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/20 text-purple-400 font-mono text-xl">
          🌌
        </div>
        <h4 className="text-base font-bold text-white">WebGL Hardware Acceleration Unavailable</h4>
        <p className="max-w-md text-xs text-slate-400 leading-relaxed">
          Your current browser environment has WebGL disabled or lacks hardware acceleration. Please switch to the ⚡ 2D Force Physics view above for full interactive knowledge graph simulation.
        </p>
      </div>
    );
  }

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
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Supporting
          </span>
          <span className="flex items-center gap-1.5 text-purple-400">
            <span className="h-2 w-2 rounded-full bg-purple-400" /> Traversed Path
          </span>
          <span className="flex items-center gap-1.5 text-rose-400">
            <span className="h-2 w-2 rounded-full bg-rose-400" /> IsREL Pruned
          </span>
          <span className="flex items-center gap-1.5 text-cyan-400">
            <span className="h-2 w-2 rounded-full bg-cyan-400" /> Candidate
          </span>
        </div>

        {selectedNodeTitle && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-black/80 px-2.5 py-1 text-cyan-300">
            <span>Selected:</span>
            <span className="font-bold text-white max-w-[200px] truncate">{selectedNodeTitle}</span>
          </div>
        )}
      </div>
    </div>
  );
}
