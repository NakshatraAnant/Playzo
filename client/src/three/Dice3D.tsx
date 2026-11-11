import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/** WebGL dice with canvas-generated pip faces. Tumbles on each roll and settles on the server's values. */
// Rotation (x, z) that brings face n to the top (+y). Box faces: +x=3, -x=4, +y=2, -y=5, +z=1, -z=6.
const FACE_ROT: Record<number, [number, number]> = { 1: [-Math.PI / 2, 0], 2: [0, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2], 5: [Math.PI, 0], 6: [Math.PI / 2, 0] };

function faceTexture(n: number, bg: string, pip: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.fillStyle = pip;
  const o = 32;
  const P: Record<number, number[][]> = { 1: [[0, 0]], 2: [[-o, -o], [o, o]], 3: [[-o, -o], [0, 0], [o, o]], 4: [[-o, -o], [o, -o], [-o, o], [o, o]], 5: [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]], 6: [[-o, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [o, o]] };
  for (const [x, y] of P[n]) { g.beginPath(); g.arc(64 + x, 64 + y, 11, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export default function Dice3D({ values, rollKey, colors = ['#fff8ee', '#c4122f'] }: { values: number[]; rollKey: number; colors?: [string, string] | string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const api = useRef<{ roll: (v: number[]) => void } | null>(null);
  useEffect(() => {
    const canvas = ref.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(35, 2, 0.1, 50);
    cam.position.set(0, 6, 7); cam.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(3, 8, 4); scene.add(dl);
    const pl = new THREE.PointLight(0xffb547, 20, 20); pl.position.set(-3, 3, 2); scene.add(pl);
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z -> numbers 3, 4, 2, 5, 1, 6
    const mats = [3, 4, 2, 5, 1, 6].map((n) => new THREE.MeshStandardMaterial({ map: faceTexture(n, colors[0], colors[1]), roughness: 0.35, metalness: 0.05 }));
    const geo = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
    const dice = values.map((_, i) => { const m = new THREE.Mesh(geo, mats); m.position.x = (i - (values.length - 1) / 2) * 1.6; scene.add(m); return m; });
    const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    const target = (n: number) => new THREE.Euler(FACE_ROT[n][0], 0, FACE_ROT[n][1]);
    const state = dice.map((d, i) => ({ from: d.rotation.clone(), to: target(values[i]), t: 1, spin: 0 }));
    dice.forEach((d, i) => d.rotation.copy(state[i].to));
    let raf = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loop = () => {
      let active = false;
      dice.forEach((d, i) => {
        const s = state[i];
        if (s.t < 1) {
          active = true;
          s.t = Math.min(1, s.t + 1 / 70);
          const e = 1 - Math.pow(1 - s.t, 3);
          d.rotation.set(s.from.x + (s.to.x + s.spin - s.from.x) * e, s.from.y + (s.to.y + (s.spin ? Math.PI * 2 * (2 + i) : 0) - s.from.y) * e, s.from.z + (s.to.z - s.from.z) * e);
          d.position.y = Math.abs(Math.sin(s.t * Math.PI * 3)) * (1 - s.t) * 1.4;
        }
      });
      renderer.render(scene, cam);
      if (active) raf = requestAnimationFrame(loop);
    };
    api.current = {
      roll: (vals) => {
        dice.forEach((d, i) => {
          const s = state[i];
          s.from = d.rotation.clone(); s.to = target(vals[i] ?? 1); s.spin = reduced ? 0 : Math.PI * 2 * (3 + i); s.t = reduced ? 1 : 0;
          if (reduced) d.rotation.copy(s.to);
        });
        cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
      },
    };
    renderer.render(scene, cam);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); geo.dispose(); mats.forEach((m) => { m.map?.dispose(); m.dispose(); }); renderer.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.length]);
  useEffect(() => { if (rollKey) api.current?.roll(values); }, [rollKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} role="img" aria-label={`Dice showing ${values.join(', ')}`} />;
}
