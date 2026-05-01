import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CanvasView } from './components/CanvasView';
import { Controls } from './components/Controls';
import { Manual } from './components/Manual';
import { MetricsPanel } from './components/MetricsPanel';
import { ParticleCandidates } from './components/ParticleCandidates';
import { FormationLog } from './components/FormationLog';
import { VerificationPanel } from './components/VerificationPanel';
import { PriorityPanel } from './components/PriorityPanel';
import { defaultConfig } from './model/defaults';
import { TaegukjaEngine } from './model/taegukjaEngine';
import type { SimulationConfig, SimulationSnapshot } from './model/types';

export default function App() {
  const [config, setConfig] = useState<SimulationConfig>(defaultConfig);
  const engineRef = useRef<TaegukjaEngine>(new TaegukjaEngine(defaultConfig));
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() => engineRef.current.getSnapshot());
  const [running, setRunning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const reset = useCallback(() => {
    engineRef.current.reset(config);
    setSnapshot(engineRef.current.getSnapshot());
    setSelectedIds([]);
  }, [config]);

  const changeConfig = useCallback((patch: Partial<SimulationConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      engineRef.current.updateConfig(next);
      return next;
    });
  }, []);

  const step = useCallback(() => {
    engineRef.current.step(1 / 60);
    setSnapshot(engineRef.current.getSnapshot());
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (running) {
        const substeps = config.nodeCount > 2500 ? 1 : config.nodeCount > 300 ? 1 : 2;
        for (let i = 0; i < substeps; i += 1) engineRef.current.step(dt / substeps);
        setSnapshot(engineRef.current.getSnapshot());
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running, config.nodeCount]);

  const selectNode = useCallback((id: number, append: boolean) => {
    setSelectedIds((prev) => append ? [...prev.filter((x) => x !== id), id].slice(-2) : [id]);
  }, []);

  const entangle = useCallback((a: number, b: number) => {
    engineRef.current.createEntanglement(a, b);
    setSnapshot(engineRef.current.getSnapshot());
  }, []);

  const selectedSummary = useMemo(() => {
    if (selectedIds.length === 0) return '선택 없음';
    const nodes = selectedIds.map((id) => snapshot.nodes[id]).filter(Boolean);
    return nodes.map((n) => `#${n.id} E=${n.energy.toFixed(2)} B=${n.boundEnergy.toFixed(2)} q=${n.charge.toFixed(2)} Z=${n.impedance.toFixed(2)} σ=${n.sigma > 0 ? '+' : '-'}`).join('  /  ');
  }, [selectedIds, snapshot.nodes]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Taegeukja Cosmology Simulator v8.4.1</p>
          <h1>태극자 1000~3000 균일 분산장 · 공진 우선순위 탐색 · cycle-bond 검증 시뮬레이터</h1>
          <p>
            화면 노드 1개를 실제 태극자 다수의 대표 셀로 해석합니다. v8.4는 처음부터 뭉친 로드를 만들지 않고, 1000~3000개 태극자를 화면 전체에 균일 분산시킨 뒤 후보 연결마다 공진 우선순위를 계산합니다. 거리·위상·주파수 정수비·임피던스·에너지 흐름·이벤트 연속성·pulse 성공 이력·루프 폐합 가능성을 비교해 trigger → pulse → closed loop → cycle-bond로 이어지는 경로만 강화합니다.
          </p>
        </div>
        <div className="hero-card">
          <span>선택 태극자</span>
          <b>{selectedSummary}</b>
          <small>노드 클릭: 선택 · Shift+클릭: 2개 선택 · 더블클릭: 선택쌍 얽힘 연결</small>
        </div>
      </header>
      <main className="layout">
        <Controls config={config} running={running} onChange={changeConfig} onReset={reset} onToggle={() => setRunning((v) => !v)} onStep={step} />
        <section className="stage panel">
          <CanvasView snapshot={snapshot} width={config.width} height={config.height} selectedIds={selectedIds} onSelect={selectNode} onEntangle={entangle} forceView={config.showForceView} />
        </section>
        <MetricsPanel snapshot={snapshot} />
      </main>
      <ParticleCandidates snapshot={snapshot} />
      <FormationLog snapshot={snapshot} />
      <PriorityPanel snapshot={snapshot} />
      <VerificationPanel config={config} />
      <Manual />
    </div>
  );
}
