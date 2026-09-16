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

  const nodeMeshesRef = useRef<
    Map<number, { mesh: THREE.Mesh; label: THREE.Sprite; auraMesh: THREE.Mesh }>
  >(new Map());
  const nodeBasePositionsRef = useRef<Map<number, THREE.Vector3>>(new Map());
  const nodePositionsRef = useRef<Map<number, THREE.Vector3>>(new Map());
  const baseLinesAttrRef = useRef<THREE.BufferAttribute | null>(null);

  const traversalGroupRef = useRef<THREE.Group | null>(null);
  const traversalMeshesRef = useRef<
    Array<{ mesh: THREE.Mesh; auraMesh: THREE.Mesh; source: number; target: number }>
  >([]);
  const photonsRef = useRef<
    Array<{ source: number; target: number; mesh: THREE.Mesh; offset: number }>
  >([]);

  const candidateRingsGroupRef = useRef<THREE.Group | null>(null);
  const candidateRingsDataRef = useRef<Array<{ group: THREE.Group; nodeId: number }>>([]);

  const pointerDownPosRef = useRef({ x: 0, y: 0 });
  const onSelectNodeRef = useRef(onSelectNode);

  const [autoRotate, setAutoRotate] = useState(true);
  const [selectedNodeTitle, setSelectedNodeTitle] = useState<string | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    onSelectNodeRef.current = onSelectNode;
  }, [onSelectNode]);

  // Classify nodes based on playback frame or full hop trace
  const { traversedSet, prunedSet, supportingIndices, keptSet, activeCandidateSet } = useMemo(() => {
    if (playbackFrame) {
      return {
        traversedSet: new Set<number>(playbackFrame.traversedNodeIds),
        prunedSet: new Set<number>(playbackFrame.prunedNodeIds),
        supportingIndices: new Set<number>(playbackFrame.supportingNodeIds),
        keptSet: new Set<number>(playbackFrame.keptNodeIds),
        activeCandidateSet: new Set<number>(playbackFrame.activeCandidateIds),
      };
    }

    const traversed = new Set<number>();
    const pruned = new Set<number>();

    hopTrace.forEach((h) => {
      const selected = Array.isArray(h.selected_passages) ? h.selected_passages : [];
      selected.forEach((idx) => traversed.add(Number(idx)));

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

    // 1. Scene, Camera, Renderer with deep cyber-space aesthetic
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020409);
    scene.fog = new THREE.FogExp2(0x020409, 0.012);

    const camera = new THREE.PerspectiveCamera(50, width / h, 0.1, 1000);
    camera.position.set(0, 16, 42);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
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
    controls.autoRotateSpeed = 0.85;
    controls.maxDistance = 90;
    controls.minDistance = 6;
    controlsRef.current = controls;

    // 3. High-Intensity Luminous Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    // Electric Cyan Key Point Light
    const cyanLight = new THREE.PointLight(0x00f0ff, 4.5, 120);
    cyanLight.position.set(25, 25, 25);
    scene.add(cyanLight);

    // Fuchsia / Purple Rim Point Light
    const purpleLight = new THREE.PointLight(0xe879f9, 4.0, 120);
    purpleLight.position.set(-25, -20, -25);
    scene.add(purpleLight);

    // Hyper-Gold Secondary Point Light
    const goldLight = new THREE.PointLight(0xfacc15, 3.0, 90);
    goldLight.position.set(0, 30, -10);
    scene.add(goldLight);

    // 4. Vibrant Multi-Colored Galaxy Starfield (1,000 Particles)
    const starCount = 1000;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    const palette = [
      new THREE.Color(0x00f0ff), // electric cyan
      new THREE.Color(0xf472b6), // pink nebula
      new THREE.Color(0xc084fc), // violet
      new THREE.Color(0xfde047), // starlight gold
      new THREE.Color(0xffffff), // pure white
    ];

    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      starPositions[i3] = (Math.random() - 0.5) * 160;
      starPositions[i3 + 1] = (Math.random() - 0.5) * 160;
      starPositions[i3 + 2] = (Math.random() - 0.5) * 160;

      const col = palette[Math.floor(Math.random() * palette.length)];
      starColors[i3] = col.r;
      starColors[i3 + 1] = col.g;
      starColors[i3 + 2] = col.b;
    }

    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // Helper to create text sprite badge
    function createTextSprite(text: string, color: string): THREE.Sprite {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "rgba(2, 6, 16, 0.85)";
        ctx.roundRect(4, 4, 248, 56, 12);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
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
      sprite.scale.set(7.5, 1.9, 1);
      return sprite;
    }

    // 5. Position Nodes on 3D Ellipsoid & Store Base Coordinates
    const nodes = graphData.nodes;
    const nodeCount = nodes.length || 1;
    const nodeObjects: THREE.Mesh[] = [];
    const basePositions = new Map<number, THREE.Vector3>();
    const currentPositions = new Map<number, THREE.Vector3>();
    const nodeMap = new Map<
      number,
      { mesh: THREE.Mesh; label: THREE.Sprite; auraMesh: THREE.Mesh }
    >();

    nodes.forEach((n, i) => {
      const phi = Math.acos(-1 + (2 * i) / nodeCount);
      const theta = Math.sqrt(nodeCount * Math.PI) * phi;
      const radius = 14.5;

      const pos = new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi) * 0.78,
        radius * Math.sin(phi) * Math.sin(theta)
      );
      basePositions.set(n.id, pos.clone());
      currentPositions.set(n.id, pos.clone());

      // Inner Core Sphere
      const sphereGeo = new THREE.SphereGeometry(1.45, 32, 32);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x006688,
        emissiveIntensity: 2.2,
        roughness: 0.15,
        metalness: 0.85,
        transparent: false,
        opacity: 1.0,
      });

      const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
      sphereMesh.position.copy(pos);
      sphereMesh.userData = { node: n };
      scene.add(sphereMesh);
      nodeObjects.push(sphereMesh);

      // Outer Glowing Aura Shell
      const auraGeo = new THREE.SphereGeometry(1.95, 20, 20);
      const auraMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
      });
      const auraMesh = new THREE.Mesh(auraGeo, auraMat);
      auraMesh.position.copy(pos);
      scene.add(auraMesh);

      // Billboard Text Label
      const truncatedTitle = n.title.length > 14 ? `${n.title.slice(0, 12)}…` : n.title;
      const sprite = createTextSprite(`#${n.id} ${truncatedTitle}`, "#00f0ff");
      sprite.position.set(pos.x, pos.y + 2.7, pos.z);
      scene.add(sprite);

      nodeMap.set(n.id, { mesh: sphereMesh, label: sprite, auraMesh });
    });

    nodeMeshesRef.current = nodeMap;
    nodeBasePositionsRef.current = basePositions;
    nodePositionsRef.current = currentPositions;

    // 6. Connect Dynamic Base Similarity Edges
    const edges = graphData.edges;
    const edgeCount = edges.length;
    const edgePositions = new Float32Array(edgeCount * 6);
    const edgeColors = new Float32Array(edgeCount * 6);

    edges.forEach((edge, eIdx) => {
      const p1 = currentPositions.get(edge.source);
      const p2 = currentPositions.get(edge.target);
      const idx = eIdx * 6;
      if (p1 && p2) {
        edgePositions[idx] = p1.x;
        edgePositions[idx + 1] = p1.y;
        edgePositions[idx + 2] = p1.z;
        edgePositions[idx + 3] = p2.x;
        edgePositions[idx + 4] = p2.y;
        edgePositions[idx + 5] = p2.z;
      }
      // Bright neon cyan with slight transparency
      edgeColors[idx] = 0.0;
      edgeColors[idx + 1] = 0.75;
      edgeColors[idx + 2] = 0.95;
      edgeColors[idx + 3] = 0.0;
      edgeColors[idx + 4] = 0.75;
      edgeColors[idx + 5] = 0.95;
    });

    if (edgeCount > 0) {
      const edgeGeo = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(edgePositions, 3);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      edgeGeo.setAttribute("position", posAttr);
      edgeGeo.setAttribute("color", new THREE.BufferAttribute(edgeColors, 3));
      baseLinesAttrRef.current = posAttr;

      const edgeMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.35,
        linewidth: 1.5,
      });
      const lines = new THREE.LineSegments(edgeGeo, edgeMat);
      scene.add(lines);
    }

    // 7. Dynamic Traversal Lasers & Candidate Rings Groups
    const traversalGroup = new THREE.Group();
    scene.add(traversalGroup);
    traversalGroupRef.current = traversalGroup;

    const candidateRingsGroup = new THREE.Group();
    scene.add(candidateRingsGroup);
    candidateRingsGroupRef.current = candidateRingsGroup;

    // 8. Safe Raycaster for Node Selection (Ignores Camera Orbit Drags)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function handlePointerDown(e: PointerEvent) {
      pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    }

    function handlePointerUp(e: PointerEvent) {
      if (!container) return;
      const dist = Math.hypot(
        e.clientX - pointerDownPosRef.current.x,
        e.clientY - pointerDownPosRef.current.y
      );
      if (dist > 6) return; // Ignore drag motions

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

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
    }

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

    // 9. High-Performance Harmonic Animation Loop (Zero-Gravity Floating)
    let animId: number;
    let clock = 0;
    const upVector = new THREE.Vector3(0, 1, 0);

    function animate() {
      animId = requestAnimationFrame(animate);
      clock += 0.016;

      // Slow majestic galaxy rotation
      starField.rotation.y += 0.0004;
      starField.rotation.x += 0.0002;

      // Harmonic Zero-Gravity Node Floating Movement
      nodeMeshesRef.current.forEach(({ mesh, label, auraMesh }, id) => {
        const base = basePositions.get(id);
        if (!base) return;

        // Unique organic orbital harmonic oscillations
        const dx = Math.sin(clock * 1.6 + id * 1.2) * 0.45;
        const dy = Math.cos(clock * 1.3 + id * 1.8) * 0.55;
        const dz = Math.sin(clock * 1.1 + id * 2.2) * 0.45;

        const cur = new THREE.Vector3(base.x + dx, base.y + dy, base.z + dz);
        currentPositions.set(id, cur);

        mesh.position.copy(cur);
        auraMesh.position.copy(cur);
        label.position.set(cur.x, cur.y + 2.7, cur.z);

        // Breathing aura pulse
        const auraPulse = 1.0 + Math.sin(clock * 3.0 + id) * 0.12;
        auraMesh.scale.set(auraPulse, auraPulse, auraPulse);
      });

      // Update Base Similarity Lines to follow floating nodes
      if (baseLinesAttrRef.current) {
        const attr = baseLinesAttrRef.current;
        for (let eIdx = 0; eIdx < edges.length; eIdx++) {
          const e = edges[eIdx];
          const p1 = currentPositions.get(e.source);
          const p2 = currentPositions.get(e.target);
          if (p1 && p2) {
            const idx = eIdx * 6;
            attr.array[idx] = p1.x;
            attr.array[idx + 1] = p1.y;
            attr.array[idx + 2] = p1.z;
            attr.array[idx + 3] = p2.x;
            attr.array[idx + 4] = p2.y;
            attr.array[idx + 5] = p2.z;
          }
        }
        attr.needsUpdate = true;
      }

      // Update Traversal Laser Cylinders & Auras to track moving nodes
      traversalMeshesRef.current.forEach(({ mesh, auraMesh, source, target }) => {
        const p1 = currentPositions.get(source);
        const p2 = currentPositions.get(target);
        if (!p1 || !p2) return;

        const dir = new THREE.Vector3().subVectors(p2, p1);
        const len = dir.length();
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

        mesh.position.copy(mid);
        mesh.scale.set(1, len, 1);
        mesh.quaternion.setFromUnitVectors(upVector, dir.clone().normalize());

        auraMesh.position.copy(mid);
        auraMesh.scale.set(1, len, 1);
        auraMesh.quaternion.copy(mesh.quaternion);
      });

      // Animate Fast Flowing Photons along traversal beams
      photonsRef.current.forEach((ph) => {
        const p1 = currentPositions.get(ph.source);
        const p2 = currentPositions.get(ph.target);
        if (!p1 || !p2) return;
        const t = (clock * 1.1 + ph.offset) % 1;
        ph.mesh.position.lerpVectors(p1, p2, t);
      });

      // Animate Spinning Dual-Axis Gyro-Rings around active candidate nodes
      candidateRingsDataRef.current.forEach(({ group, nodeId }) => {
        const pos = currentPositions.get(nodeId);
        if (pos) group.position.copy(pos);

        group.rotation.x += 0.025;
        group.rotation.y += 0.035;
        group.rotation.z += 0.015;

        const s = 1.0 + Math.sin(clock * 4.0 + nodeId) * 0.1;
        group.scale.set(s, s, s);
      });

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
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [graphData.nodes, graphData.edges, height]);

  // Update Node Styles, High-Energy Traversal Lasers, and Gyro Rings dynamically
  useEffect(() => {
    // 1. Update node meshes with radiant glowing colors
    nodeMeshesRef.current.forEach(({ mesh, auraMesh }, id) => {
      const isSup = supportingIndices.has(id);
      const isTrav = traversedSet.has(id);
      const isPrune = prunedSet.has(id);
      const isKept = keptSet.has(id);
      const isCand = activeCandidateSet.has(id);

      let color = 0x00f0ff;
      let emissive = 0x006688;
      let auraColor = 0x00f0ff;
      let emissiveIntensity = 2.0;
      let scale = 1.0;
      let auraOpacity = 0.25;

      if (isSup) {
        color = 0x10b981; // bright emerald
        emissive = 0x059669;
        auraColor = 0x34d399;
        emissiveIntensity = 3.2;
        scale = 1.45;
        auraOpacity = 0.45;
      } else if (isTrav) {
        color = 0xc084fc; // radiant violet
        emissive = 0xa855f7;
        auraColor = 0xc084fc;
        emissiveIntensity = 3.0;
        scale = 1.3;
        auraOpacity = 0.4;
      } else if (isKept) {
        color = 0x2dd4bf; // vivid teal
        emissive = 0x0d9488;
        auraColor = 0x2dd4bf;
        emissiveIntensity = 2.8;
        scale = 1.25;
        auraOpacity = 0.35;
      } else if (isCand) {
        color = 0x00f0ff; // electric cyan
        emissive = 0x0284c7;
        auraColor = 0x00f0ff;
        emissiveIntensity = 2.8;
        scale = 1.25;
        auraOpacity = 0.4;
      } else if (isPrune) {
        color = 0xf43f5e; // ruby rose
        emissive = 0x4c0519;
        auraColor = 0xf43f5e;
        emissiveIntensity = 0.8;
        scale = 0.8;
        auraOpacity = 0.12;
      }

      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.color.setHex(color);
        mesh.material.emissive.setHex(emissive);
        mesh.material.emissiveIntensity = emissiveIntensity;
        mesh.material.needsUpdate = true;
      }
      mesh.scale.set(scale, scale, scale);

      if (auraMesh.material instanceof THREE.MeshBasicMaterial) {
        auraMesh.material.color.setHex(auraColor);
        auraMesh.material.opacity = auraOpacity;
        auraMesh.material.needsUpdate = true;
      }
    });

    // 2. Build 3D Traversal Lasers, Glowing Aura Cylinders & Photons
    const traversalGroup = traversalGroupRef.current;
    const nodePositions = nodePositionsRef.current;
    if (traversalGroup && nodePositions.size > 0) {
      while (traversalGroup.children.length > 0) {
        const obj = traversalGroup.children[0];
        traversalGroup.remove(obj);
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material?.dispose();
        }
      }
      traversalMeshesRef.current = [];
      photonsRef.current = [];

      // Collect traversal edges from playback frame or accumulated hops
      const activeTraversalEdges: Array<{ source: number; target: number }> = [];
      if (playbackFrame?.traversalEdges && playbackFrame.traversalEdges.length > 0) {
        activeTraversalEdges.push(...playbackFrame.traversalEdges);
      } else if (traversedSet.size >= 2) {
        const arr = Array.from(traversedSet);
        for (let i = 0; i < arr.length - 1; i++) {
          activeTraversalEdges.push({ source: arr[i], target: arr[i + 1] });
        }
      }

      const upVector = new THREE.Vector3(0, 1, 0);

      activeTraversalEdges.forEach((edge) => {
        const p1 = nodePositions.get(edge.source);
        const p2 = nodePositions.get(edge.target);
        if (!p1 || !p2) return;

        const dir = new THREE.Vector3().subVectors(p2, p1);
        const len = dir.length();
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

        // Core Glowing Solid Laser Cylinder (Unit height 1, scaled dynamically)
        const cylGeo = new THREE.CylinderGeometry(0.24, 0.24, 1, 16);
        const cylMat = new THREE.MeshStandardMaterial({
          color: 0xc084fc,
          emissive: 0xa855f7,
          emissiveIntensity: 3.5,
          roughness: 0.1,
          metalness: 0.9,
        });
        const cylMesh = new THREE.Mesh(cylGeo, cylMat);
        cylMesh.position.copy(mid);
        cylMesh.scale.set(1, len, 1);
        cylMesh.quaternion.setFromUnitVectors(upVector, dir.clone().normalize());
        traversalGroup.add(cylMesh);

        // Outer Translucent Plasma Aura Cylinder
        const auraGeo = new THREE.CylinderGeometry(0.65, 0.65, 1, 16);
        const auraMat = new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
        });
        const auraMesh = new THREE.Mesh(auraGeo, auraMat);
        auraMesh.position.copy(mid);
        auraMesh.scale.set(1, len, 1);
        auraMesh.quaternion.copy(cylMesh.quaternion);
        traversalGroup.add(auraMesh);

        traversalMeshesRef.current.push({
          mesh: cylMesh,
          auraMesh,
          source: edge.source,
          target: edge.target,
        });

        // Fast Flowing White Photon Energy Orbs
        for (let k = 0; k < 2; k++) {
          const phGeo = new THREE.SphereGeometry(0.45, 16, 16);
          const phMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            blending: THREE.AdditiveBlending,
          });
          const phMesh = new THREE.Mesh(phGeo, phMat);
          phMesh.position.copy(p1);
          traversalGroup.add(phMesh);
          photonsRef.current.push({
            source: edge.source,
            target: edge.target,
            mesh: phMesh,
            offset: k * 0.5,
          });
        }
      });
    }

    // 3. Build Gyroscopic Containment Rings for Candidate & Traversed Nodes
    const candidateGroup = candidateRingsGroupRef.current;
    if (candidateGroup && nodePositions.size > 0) {
      while (candidateGroup.children.length > 0) {
        const obj = candidateGroup.children[0];
        candidateGroup.remove(obj);
      }
      candidateRingsDataRef.current = [];

      // Determine which nodes deserve gyroscopic rings
      const ringNodeIds = new Set<number>([
        ...Array.from(activeCandidateSet),
        ...Array.from(traversedSet),
        ...Array.from(supportingIndices),
      ]);

      ringNodeIds.forEach((nodeId) => {
        const pos = nodePositions.get(nodeId);
        if (!pos) return;

        const isSup = supportingIndices.has(nodeId);
        const isTrav = traversedSet.has(nodeId);

        const ringColor = isSup ? 0x10b981 : isTrav ? 0xc084fc : 0x00f0ff;
        const ringGroup = new THREE.Group();
        ringGroup.position.copy(pos);

        // Primary Equatorial Ring
        const ring1Geo = new THREE.TorusGeometry(2.4, 0.08, 12, 32);
        const ring1Mat = new THREE.MeshStandardMaterial({
          color: ringColor,
          emissive: ringColor,
          emissiveIntensity: 2.8,
          roughness: 0.15,
        });
        const ring1Mesh = new THREE.Mesh(ring1Geo, ring1Mat);
        ring1Mesh.rotation.x = Math.PI / 2;
        ringGroup.add(ring1Mesh);

        // Secondary Polar Gyro-Ring
        const ring2Geo = new THREE.TorusGeometry(2.7, 0.06, 12, 32);
        const ring2Mat = new THREE.MeshStandardMaterial({
          color: ringColor,
          emissive: ringColor,
          emissiveIntensity: 2.0,
          roughness: 0.15,
        });
        const ring2Mesh = new THREE.Mesh(ring2Geo, ring2Mat);
        ring2Mesh.rotation.y = Math.PI / 4;
        ringGroup.add(ring2Mesh);

        candidateGroup.add(ringGroup);
        candidateRingsDataRef.current.push({ group: ringGroup, nodeId });
      });
    }
  }, [traversedSet, prunedSet, supportingIndices, keptSet, activeCandidateSet, playbackFrame]);

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
    <div className="relative w-full overflow-hidden rounded-3xl border border-purple-500/20 bg-[#020409] shadow-2xl">
      {/* Top HUD Controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/40 bg-purple-400/10 px-3 py-1 text-[11px] font-mono font-semibold uppercase tracking-wider text-purple-300">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
            3D Knowledge Nebula (Three.js)
          </span>
          <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] font-mono text-slate-400">
            Zero-Gravity Orbit
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
          <span className="flex items-center gap-1.5 text-cyan-400">
            <span className="h-2 w-2 rounded-full bg-cyan-400" /> Active Candidate
          </span>
          <span className="flex items-center gap-1.5 text-rose-400">
            <span className="h-2 w-2 rounded-full bg-rose-400" /> IsREL Pruned
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
