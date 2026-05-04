import type { SimulationSnapshot } from '../model/types';

function fmtSci(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '∞';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e4 || abs < 1e-3) return value.toExponential(digits);
  return value.toFixed(digits);
}

export function ParticleCandidates({ snapshot }: { snapshot: SimulationSnapshot }) {
  const topParticles = [...snapshot.particles]
    .sort((a, b) => (b.formationStage + b.solitonScore + b.particleScaleFraction) - (a.formationStage + a.solitonScore + a.particleScaleFraction))
    .slice(0, 10);

  const slots = Array.from({ length: 10 }, (_, i) => topParticles[i] ?? null);

  return (
    <section className="panel candidates-panel">
      <div className="candidate-header">
        <div>
          <div className="panel-title">상위 입자 후보 · 생성/병합/붕괴 추적</div>
          <p>
            후보 수가 7~9개에서 2개로 줄어드는 현상은 공진 조각들이 더 큰 솔리톤으로 병합되거나,
            임계값 아래로 떨어져 붕괴될 때 자연스럽게 발생합니다. 이 패널은 빈 칸까지 미리 확보해
            후보 수 변화 때문에 아래 설명 창이 흔들리지 않도록 고정했습니다.
          </p>
        </div>
        <div className="candidate-summary">
          <span>후보 {snapshot.metrics.particleCount}</span>
          <span>형성 중 {snapshot.metrics.formingParticleCount}</span>
          <span>안정 {snapshot.metrics.stableParticleCount}</span>
          <span>완성 {snapshot.metrics.completeParticleCount}</span>
        </div>
      </div>
      <div className="candidate-grid">
        {slots.map((p, idx) => p ? (
          <article className={`candidate-card ${p.lifecycle}`} key={`${p.id}-${p.nodeIds.join('-')}`}>
            <div className="candidate-top">
              <b>#{idx + 1} {p.kind}</b>
              <span>{p.lifecycle}</span>
            </div>
            <div className="candidate-progress"><i style={{ width: `${Math.max(2, Math.min(100, p.formationStage * 100))}%` }} /></div>
            <dl>
              <div><dt>완성률</dt><dd>{(p.particleScaleFraction * 100).toFixed(2)}%</dd></div>
              <div><dt>솔리톤</dt><dd>{p.solitonScore.toFixed(3)}</dd></div>
              <div><dt>안정 틱</dt><dd>{p.stabilityAge}</dd></div>
              <div><dt>노드</dt><dd>{p.size}</dd></div>
              <div><dt>대표 TQ</dt><dd>{fmtSci(p.representedTaegeukjaCount)}</dd></div>
              <div><dt>에너지</dt><dd>{fmtSci(p.totalEnergyJ)} J</dd></div>
              <div><dt>질량</dt><dd>{fmtSci(p.massKg)} kg</dd></div>
              <div><dt>전하</dt><dd>{p.charge.toFixed(2)}</dd></div>
            </dl>
          </article>
        ) : (
          <article className="candidate-card empty" key={`empty-${idx}`}>
            <b>빈 후보 슬롯</b>
            <p>공진 결합이 안정되면 여기에 표시됩니다.</p>
          </article>
        ))}
      </div>
    </section>
  );
}
