import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * The PLAYZO orb: a clear-coated icosphere with an orbiting play-ring and drifting particles.
 * Lazy-loaded, pauses off-screen / in background tabs, renders a single still frame with reduced motion.
 */
export default function Hero3D({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // WebGL unavailable: CSS hero background remains.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 7.5);

    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.35, 5),
      new THREE.MeshPhysicalMaterial({ color: 0x6a2ab8, metalness: 0.25, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06, iridescence: 0.8, iridescenceIOR: 1.7, emissive: 0x7a1a6a, emissiveIntensity: 0.45 }),
    );
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.11, 32, 180), new THREE.MeshStandardMaterial({ color: 0xff7a3d, metalness: 0.6, roughness: 0.25, emissive: 0xff3d8b, emissiveIntensity: 0.55 }));
    ring.rotation.x = Math.PI / 2.6;
    const tri = new THREE.Shape();
    tri.moveTo(-0.32, 0.42); tri.lineTo(0.5, 0); tri.lineTo(-0.32, -0.42); tri.closePath();
    const play = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3 }), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 0.35, roughness: 0.3 }));
    play.position.set(0.05, 0, 1.32);
    const group = new THREE.Group();
    group.add(orb, ring, play);
    scene.add(group);

    const N = 420;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 2.6 + Math.random() * 3.2, t = Math.random() * Math.PI * 2, p = (Math.random() - 0.5) * 2.4;
      pos[i * 3] = Math.cos(t) * r; pos[i * 3 + 1] = p; pos[i * 3 + 2] = Math.sin(t) * r - 1.5;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffd0f0, size: 0.035, transparent: true, opacity: 0.8, depthWrite: false }));
    scene.add(points);

    scene.add(new THREE.AmbientLight(0x6a5aa0, 0.6));
    const l1 = new THREE.PointLight(0xff3d8b, 60, 30); l1.position.set(4, 3, 4);
    const l2 = new THREE.PointLight(0x3dd9ff, 45, 30); l2.position.set(-4, -2, 3);
    const l3 = new THREE.DirectionalLight(0xffffff, 1.2); l3.position.set(0, 5, 5);
    scene.add(l1, l2, l3);

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Keep the orb in the right third of the hero, clear of the headline.
      const halfW = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z * camera.aspect;
      const narrow = camera.aspect < 1.25;
      const scale = narrow ? 0.62 : Math.min(1, halfW / 4.6);
      group.scale.setScalar(scale);
      group.position.set(narrow ? halfW * 0.55 : halfW - 2.25 * scale, narrow ? 1.35 : 0.05, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0, visible = true, t0 = performance.now();
    const pointer = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; };
    addEventListener('pointermove', onMove, { passive: true });
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !reduced) loop(); });
    io.observe(canvas);
    const frame = (t: number) => {
      const s = (t - t0) / 1000;
      group.rotation.y = s * 0.35 + pointer.x * 0.4;
      group.rotation.x = Math.sin(s * 0.5) * 0.12 + pointer.y * 0.25;
      ring.rotation.z = s * 0.8;
      points.rotation.y = -s * 0.04;
      orb.position.y = Math.sin(s * 1.2) * 0.06;
      renderer.render(scene, camera);
    };
    const loop = () => {
      cancelAnimationFrame(raf);
      const tick = (t: number) => { if (!visible || document.hidden) return; frame(t); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    };
    const onVis = () => { if (!document.hidden && !reduced) loop(); };
    document.addEventListener('visibilitychange', onVis);
    if (reduced) frame(t0 + 1800); else loop();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      removeEventListener('pointermove', onMove); document.removeEventListener('visibilitychange', onVis);
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); (m.material as THREE.Material | undefined)?.dispose?.(); });
      renderer.dispose();
    };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden />;
}
