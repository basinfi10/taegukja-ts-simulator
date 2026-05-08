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

const C_LIGHT_FOR_TIME = 299_792_458;

export default function App() {
  const [config, setConfig] = useState<SimulationConfig>(defaultConfig);
  const engineRef = useRef<TaegukjaEngine>(new TaegukjaEngine(defaultConfig));
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() => engineRef.current.getSnapshot());
  const [running, setRunning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const measuredSpsRef = useRef(0);
  const perfWindowRef = useRef({ lastMs: performance.now(), steps: 0 });
  const snapshotWindowRef = useRef({ lastMs: performance.now(), frames: 0 });

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
    engineRef.current.step((1 / 60) * config.simulationSpeedMultiplier);
    setSnapshot(engineRef.current.getSnapshot());
  }, [config.simulationSpeedMultiplier]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (running) {
        const frameSteps = config.performanceMode
          ? Math.min(config.maxCatchUpSteps, Math.max(config.engineStepsPerFrame, Math.ceil(dt * 60 * 0.65)))
          : 1;
        let executedSteps = 0;
        const fixedStep = (1 / 60) * config.simulationSpeedMultiplier;
        for (let i = 0; i < frameSteps; i += 1) {
          engineRef.current.step(fixedStep);
          executedSteps += 1;
        }
        perfWindowRef.current.steps += executedSteps;

        const elapsedMs = now - perfWindowRef.current.lastMs;
        if (elapsedMs >= 1000) {
          const instantSps = perfWindowRef.current.steps / (elapsedMs / 1000);
          const previous = measuredSpsRef.current || instantSps;
          const smoothedSps = previous * 0.72 + instantSps * 0.28;
          measuredSpsRef.current = smoothedSps;
          perfWindowRef.current = { lastMs: now, steps: 0 };

          const patch: Partial<SimulationConfig> = { measuredStepsPerSecond: smoothedSps };
          if (config.autoCalibrateTimeCompression) {
            const crossingTicks = (config.particleEffectiveRadiusM / C_LIGHT_FOR_TIME) / Math.max(1e-99, config.planckTimeS);
            patch.timeCompressionFactor = crossingTicks / Math.max(1, config.crossingVisualSeconds * smoothedSps);
          }
          setConfig((prev) => {
            const next = { ...prev, ...patch };
            engineRef.current.updateConfig(next);
            return next;
          });
        }

        const targetSnapshotMs = 1000 / Math.max(1, config.performanceMode ? config.renderSnapshotFps : 60);
        if (now - snapshotWindowRef.current.lastMs >= targetSnapshotMs) {
          setSnapshot(engineRef.current.getSnapshot());
          snapshotWindowRef.current = { lastMs: now, frames: snapshotWindowRef.current.frames + 1 };
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [
    running,
    config.nodeCount,
    config.autoCalibrateTimeCompression,
    config.crossingVisualSeconds,
    config.particleEffectiveRadiusM,
    config.planckTimeS,
    config.performanceMode,
    config.renderSnapshotFps,
    config.engineStepsPerFrame,
    config.maxCatchUpSteps,
    config.simulationSpeedMultiplier
  ]);

  const selectNode = useCallback((id: number, append: boolean) => {
    setSelectedIds((prev) => append ? [...prev.filter((x) => x !== id), id].slice(-2) : [id]);
  }, []);

  const entangle = useCallback((a: number, b: number) => {
    engineRef.current.createEntanglement(a, b);
    setSnapshot(engineRef.current.getSnapshot());
  }, []);

  const downloadJson = useCallback((filename: string, payload: unknown) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const exportCurrentState = useCallback(() => {
    const snap = engineRef.current.getSnapshot();
    downloadJson(`taegukja-v856-state-${Date.now()}.json`, {
      schema: 'taegukja-simulator-state',
      version: '8.5.6',
      exportedAt: new Date().toISOString(),
      config,
      snapshot: snap,
      summary: {
        tick: snap.metrics.tick,
        time: snap.metrics.time,
        measuredStepsPerSecond: config.measuredStepsPerSecond,
        particleCount: snap.metrics.particleCount,
        formingParticleCount: snap.metrics.formingParticleCount,
        stableParticleCount: snap.metrics.stableParticleCount,
        completeParticleCount: snap.metrics.completeParticleCount,
        massBondCount: snap.metrics.massBondCount,
        cycleBondCount: snap.metrics.eventCycleMetrics.cycleBondCount,
        activePulseCount: snap.metrics.eventCycleMetrics.activePulseCount,
        activeCellRatio: snap.metrics.coarseFieldMetrics.activeCellRatio,
        crossingProgressFraction: snap.metrics.scale.crossingProgressFraction
      }
    });
  }, [config, downloadJson]);

  const exportCompactReport = useCallback(() => {
    const snap = engineRef.current.getSnapshot();
    downloadJson(`taegukja-v856-report-${Date.now()}.json`, {
      schema: 'taegukja-simulator-report',
      version: '8.5.6',
      exportedAt: new Date().toISOString(),
      config,
      metrics: snap.metrics,
      particles: snap.particles,
      formationEvents: snap.formationEvents.slice(-80),
      priorityCandidates: snap.priorityCandidates.slice(0, 80),
      cycleLoops: snap.cycleLoops.slice(0, 120),
      coarseField: snap.coarseField
    });
  }, [config, downloadJson]);

  const selectedSummary = useMemo(() => {
    if (selectedIds.length === 0) return '선택 없음';
    const nodes = selectedIds.map((id) => snapshot.nodes[id]).filter(Boolean);
    return nodes.map((n) => `#${n.id} E=${n.energy.toFixed(2)} B=${n.boundEnergy.toFixed(2)} q=${n.charge.toFixed(2)} Z=${n.impedance.toFixed(2)} σ=${n.sigma > 0 ? '+' : '-'}`).join('  /  ');
  }, [selectedIds, snapshot.nodes]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Taegeukja Cosmology Simulator v8.5.6.2</p>
          <h1>태극자 1000~3000 균일 분산장 · 시각 흐름 개선 · 데이터 저장 시뮬레이터</h1>
          <p>
            화면 노드 1개를 실제 태극자 다수의 대표 셀로 해석합니다. v8.5.1은 대표 로드 100개를 소립자 1개 스케일로 재정립해 다수 입자 상호작용을 보며, 태극자 1 변화 = 1 플랑크 틱이라는 시간 정의를 시뮬레이터에 연결합니다. 브라우저가 실제 처리하는 SPS를 측정해 timeCompressionFactor를 자동 보정하고, v8.5.6은 과도한 edge/텍스트 렌더링을 줄이고, 엔진 catch-up step과 시각화 예산을 조정해 일반 PC에서도 사건 흐름이 보이도록 개선합니다. 설정·진행·결과는 JSON으로 저장할 수 있습니다.
          </p>
        </div>
        <div className="hero-card">
          <span>선택 태극자</span>
          <b>{selectedSummary}</b>
          <small>노드 클릭: 선택 · Shift+클릭: 2개 선택 · 더블클릭: 선택쌍 얽힘 연결</small>
          <div className="export-actions">
            <button onClick={exportCompactReport}>결과 보고서 저장</button>
            <button onClick={exportCurrentState}>전체 상태 저장</button>
          </div>
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
