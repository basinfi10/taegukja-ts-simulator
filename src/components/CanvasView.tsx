import { useEffect, useRef } from 'react';
import type { ForceView, SimulationSnapshot } from '../model/types';
import { clamp01 } from '../model/math';

type Props = {
  snapshot: SimulationSnapshot;
  width: number;
  height: number;
  selectedIds: number[];
  onSelect: (id: number, append: boolean) => void;
  onEntangle: (a: number, b: number) => void;
  forceView: ForceView;
};

const edgeColor = (kind: string, alpha: number) => {
  if (kind === 'cycle-bond') return `rgba(121, 255, 190, ${alpha})`;
  if (kind === 'mass-bond') return `rgba(255, 213, 96, ${alpha})`;
  if (kind === 'entangled') return `rgba(172, 118, 255, ${alpha})`;
  if (kind === 'resonance') return `rgba(88, 205, 255, ${alpha})`;
  return `rgba(140, 162, 186, ${alpha})`;
};

export function CanvasView({ snapshot, width, height, selectedIds, onSelect, onEntangle, forceView }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#070b14');
    bg.addColorStop(0.5, '#0b1324');
    bg.addColorStop(1, '#120d1f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#26364e';
    for (let x = 0; x < width; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y < height; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    ctx.restore();

    if (snapshot.priorityCandidates?.length) {
      for (const candidate of snapshot.priorityCandidates.slice(0, 45)) {
        const a = Math.max(0.04, Math.min(0.42, candidate.breakdown.total * (candidate.selected ? 0.42 : 0.18)));
        ctx.save();
        ctx.strokeStyle = candidate.selected ? `rgba(121, 255, 190, ${a})` : `rgba(255, 255, 255, ${a * 0.55})`;
        ctx.lineWidth = candidate.selected ? 1.4 + candidate.breakdown.total * 2.2 : 0.7;
        ctx.setLineDash(candidate.selected ? [8, 5] : [2, 8]);
        ctx.beginPath();
        ctx.moveTo(candidate.ax, candidate.ay);
        ctx.lineTo(candidate.bx, candidate.by);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    for (const loop of snapshot.cycleLoops.slice(0, 60)) {
      const alpha = Math.max(0.06, Math.min(0.45, loop.score * 0.38));
      ctx.save();
      ctx.strokeStyle = `rgba(121, 255, 190, ${alpha})`;
      ctx.lineWidth = 1 + loop.score * 2.2;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.arc(loop.cx, loop.cy, Math.max(10, loop.radius * (1.15 + loop.score * 0.45)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(121, 255, 190, ${alpha * 0.22})`;
      ctx.beginPath();
      ctx.arc(loop.cx, loop.cy, Math.max(8, loop.radius * 0.62), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const pulse of snapshot.eventPulses.slice(0, 140)) {
      const t = Math.min(1, pulse.age / 28);
      const x = pulse.x + (pulse.tx - pulse.x) * t;
      const y = pulse.y + (pulse.ty - pulse.y) * t;
      const a = Math.max(0, pulse.intensity * (1 - t));
      ctx.save();
      ctx.strokeStyle = `rgba(121, 255, 190, ${0.08 + a * 0.35})`;
      ctx.lineWidth = 0.8 + a * 2.2;
      ctx.beginPath();
      ctx.moveTo(pulse.x, pulse.y);
      ctx.lineTo(pulse.tx, pulse.ty);
      ctx.stroke();
      const g = ctx.createRadialGradient(x, y, 1, x, y, 7 + a * 18);
      g.addColorStop(0, `rgba(210, 255, 230, ${0.85 * a})`);
      g.addColorStop(0.6, `rgba(121, 255, 190, ${0.30 * a})`);
      g.addColorStop(1, 'rgba(121, 255, 190, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 5 + a * 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const p of snapshot.particles) {
      const g = ctx.createRadialGradient(p.cx, p.cy, 4, p.cx, p.cy, Math.max(30, p.radius * 3.5));
      const hot = p.kind === 'black-hole-like' ? '255,76,76' : p.kind === 'baryon-like' ? '255,212,82' : p.kind === 'lepton-like' ? '94,220,255' : '172,122,255';
      g.addColorStop(0, `rgba(${hot}, ${0.35 * p.solitonScore})`);
      g.addColorStop(0.45, `rgba(${hot}, ${0.12 * p.solitonScore})`);
      g.addColorStop(1, `rgba(${hot}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, Math.max(34, p.radius * 3.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${hot}, 0.55)`;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, Math.max(14, p.radius * 1.2), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const ev of snapshot.formationEvents) {
      const age = snapshot.metrics.tick - ev.tick;
      const alpha = clamp01(1 - age / 180) * (0.18 + 0.55 * ev.intensity);
      const wave = ev.radius + age * 0.42;
      ctx.strokeStyle = ev.kind === 'collapse'
        ? `rgba(255, 92, 92, ${alpha})`
        : ev.kind === 'stabilize' || ev.kind === 'birth'
          ? `rgba(255, 222, 92, ${alpha})`
          : ev.kind === 'forming'
            ? `rgba(92, 215, 255, ${alpha})`
            : `rgba(168, 126, 255, ${alpha})`;
      ctx.lineWidth = 1.5 + ev.intensity * 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(ev.x, ev.y, wave, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (age < 90) {
        ctx.fillStyle = `rgba(235, 244, 255, ${alpha})`;
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(ev.label, ev.x + 10, ev.y - 10);
      }
    }

    for (const it of snapshot.particleInteractions) {
      const strength = clamp01((Math.abs(it.net) + Math.abs(it.weak)) * 28);
      const color = it.mode === 'repel'
        ? `rgba(90, 205, 255, ${0.18 + strength * 0.38})`
        : it.mode === 'disturb'
          ? `rgba(190, 118, 255, ${0.18 + strength * 0.35})`
          : `rgba(255, 213, 96, ${0.18 + strength * 0.42})`;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.0 + strength * 2.4;
      ctx.setLineDash(it.mode === 'disturb' ? [3, 8] : it.mode === 'repel' ? [10, 6] : []);
      ctx.beginPath();
      ctx.moveTo(it.ax, it.ay);
      ctx.lineTo(it.bx, it.by);
      ctx.stroke();
      ctx.setLineDash([]);
      if (strength > 0.2) {
        const mx = (it.ax + it.bx) * 0.5;
        const my = (it.ay + it.by) * 0.5;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(mx, my, 2.5 + strength * 4.0, 0, Math.PI * 2);
        ctx.fill();
      }
    }


    for (const edge of snapshot.edges) {
      const a = snapshot.nodes[edge.a];
      const b = snapshot.nodes[edge.b];
      const alpha = clamp01(0.05 + edge.weight * 0.42 + edge.binding * 0.35);
      ctx.strokeStyle = edgeColor(edge.kind, alpha);
      ctx.lineWidth = edge.kind === 'mass-bond' ? 2.8 + edge.binding * 3.2 : edge.kind === 'entangled' ? 2.2 : 0.7 + edge.weight * 1.5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    const drawForce = (x: number, y: number, fx: number, fy: number, color: string) => {
      const mag = Math.hypot(fx, fy);
      if (mag < 0.0002) return;
      const scale = Math.min(42, 600 * mag);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (fx / mag) * scale, y + (fy / mag) * scale); ctx.stroke();
    };

    const drawDetailedForces = snapshot.nodes.length <= 1800;
    for (const node of snapshot.nodes) {
      if (!drawDetailedForces && !node.isParticleCore) continue;
      if (forceView === 'all' || forceView === 'strong') drawForce(node.x, node.y, node.forceStrongX, node.forceStrongY, 'rgba(255,210,84,.62)');
      if (forceView === 'all' || forceView === 'em') drawForce(node.x, node.y, node.forceEmX, node.forceEmY, 'rgba(90,205,255,.55)');
      if (forceView === 'all' || forceView === 'weak') drawForce(node.x, node.y, node.forceWeakX, node.forceWeakY, 'rgba(190,118,255,.55)');
      if (forceView === 'all' || forceView === 'gravity') drawForce(node.x, node.y, node.forceGravityX, node.forceGravityY, 'rgba(190,210,230,.42)');
    }

    const nodeScale = Math.max(0.12, Math.min(1, Math.sqrt(420 / Math.max(420, snapshot.nodes.length))));
    for (const node of snapshot.nodes) {
      const energyRadius = Math.sqrt(node.energy + node.boundEnergy);
      const r = node.isParticleCore
        ? Math.max(1.8, (4.8 + node.massLike * 3.1) * nodeScale)
        : Math.max(1.15, (2.9 + energyRadius * 1.25) * nodeScale);
      const hue = node.color === 0 ? 44 : node.color === 1 ? 195 : 278;
      ctx.fillStyle = `hsla(${hue}, 92%, ${node.sigma > 0 ? 62 : 72}%, ${node.isParticleCore ? 0.98 : 0.82})`;
      ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = node.charge >= 0 ? 'rgba(255,255,255,.72)' : 'rgba(12,20,35,.72)';
      ctx.lineWidth = selectedIds.includes(node.id) ? 2.8 : 0.9;
      ctx.stroke();
      const px = node.x + Math.cos(node.phase) * (r + 3);
      const py = node.y + Math.sin(node.phase) * (r + 3);
      ctx.strokeStyle = node.sigma > 0 ? 'rgba(255,255,255,.75)' : 'rgba(20,20,30,.8)';
      ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(px, py); ctx.stroke();
    }

    ctx.fillStyle = 'rgba(230,238,255,.86)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(
      `v8.1: 초기 균일 분산장 → 근접 연결 → 에너지 순환 → 공진 뭉침 관찰 · 분산 ${(snapshot.metrics.spatialSpreadRatio * 100).toFixed(0)}% · 뭉침 ${(snapshot.metrics.cohesionIndex * 100).toFixed(0)}%`,
      16,
      height - 16
    );
  }, [snapshot, width, height, selectedIds, forceView]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best = -1;
    let bestD = Infinity;
    for (const n of snapshot.nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      const hitRadius = Math.max(5, 18 * Math.sqrt(420 / Math.max(420, snapshot.nodes.length)));
      if (d < bestD && d < hitRadius) { bestD = d; best = n.id; }
    }
    if (best >= 0) onSelect(best, event.shiftKey);
  };

  const handleDoubleClick = () => {
    if (selectedIds.length >= 2) onEntangle(selectedIds[selectedIds.length - 2], selectedIds[selectedIds.length - 1]);
  };

  return <canvas ref={canvasRef} className="sim-canvas" onClick={handleClick} onDoubleClick={handleDoubleClick} />;
}
