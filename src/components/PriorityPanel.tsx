import type { PriorityCandidate, SimulationSnapshot } from '../model/types';

function fmt(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(2);
}

function MiniBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="priority-mini">
      <span>{label}</span>
      <div><i style={{ width: `${pct}%` }} /></div>
      <b>{fmt(value)}</b>
    </div>
  );
}

function strongestReason(c: PriorityCandidate): string {
  const entries: Array<[string, number]> = [
    ['거리', c.breakdown.proximity],
    ['위상', c.breakdown.phase],
    ['주파수', c.breakdown.frequency],
    ['임피던스', c.breakdown.impedance],
    ['에너지 흐름', c.breakdown.energyFlow],
    ['이벤트', c.breakdown.eventContinuity],
    ['pulse 이력', c.breakdown.history],
    ['루프 폐합', c.breakdown.loopPotential]
  ];
  return entries.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${fmt(v)}`).join(' · ');
}

export function PriorityPanel({ snapshot }: { snapshot: SimulationSnapshot }) {
  const candidates = [...snapshot.priorityCandidates]
    .sort((a, b) => b.breakdown.total - a.breakdown.total)
    .slice(0, 8);

  return (
    <section className="panel priority-panel">
      <div className="panel-title">v8.4 연결 우선순위 · 왜 이 태극자끼리 연결되는가</div>
      <p className="hint">
        태극자가 미리 공진을 아는 것이 아니라, 후보 연결에 시험 pulse를 흘려보고
        위상·주파수·임피던스·이벤트 연속성·루프 폐합 가능성이 높은 연결만 살아남습니다.
      </p>
      <div className="priority-grid">
        {candidates.length === 0 && (
          <div className="priority-empty">아직 동적 후보가 없습니다. 실행 후 몇 초 지나면 연결 후보 점수가 표시됩니다.</div>
        )}
        {candidates.map((c) => (
          <article key={c.id} className={c.selected ? 'priority-card-item selected' : 'priority-card-item'}>
            <header>
              <b>#{c.a} ↔ #{c.b}</b>
              <span>{c.selected ? '선택' : '보류'} · 총점 {fmt(c.breakdown.total)}</span>
            </header>
            <small>{strongestReason(c)}</small>
            <MiniBar label="거리" value={c.breakdown.proximity} />
            <MiniBar label="위상" value={c.breakdown.phase} />
            <MiniBar label="주파수" value={c.breakdown.frequency} />
            <MiniBar label="임피던스" value={c.breakdown.impedance} />
            <MiniBar label="에너지 흐름" value={c.breakdown.energyFlow} />
            <MiniBar label="이벤트 연속" value={c.breakdown.eventContinuity} />
            <MiniBar label="pulse 이력" value={c.breakdown.history} />
            <MiniBar label="루프 폐합" value={c.breakdown.loopPotential} />
          </article>
        ))}
      </div>
    </section>
  );
}
