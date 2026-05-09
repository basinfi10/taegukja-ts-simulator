import type { ParticleInteraction, SimulationSnapshot } from '../model/types';

function fmt(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '∞';
  if (Math.abs(value) >= 1e4 || Math.abs(value) < 1e-3 && value !== 0) return value.toExponential(2);
  return value.toFixed(digits);
}

function dominantLabel(it: ParticleInteraction): string {
  const entries = [
    ['강력형', Math.abs(it.strong)],
    ['전자기형', Math.abs(it.em)],
    ['약력형', Math.abs(it.weak)],
    ['중력형', Math.abs(it.gravity)]
  ] as const;
  return [...entries].sort((a, b) => b[1] - a[1])[0][0];
}

export function FormationLog({ snapshot }: { snapshot: SimulationSnapshot }) {
  const events = [...snapshot.formationEvents].reverse().slice(0, 12);
  const transitions = [...snapshot.particleTransitions].reverse().slice(0, 10);
  const interactions = [...snapshot.particleInteractions]
    .sort((a, b) => (Math.abs(b.net) + Math.abs(b.weak)) - (Math.abs(a.net) + Math.abs(a.weak)))
    .slice(0, 8);

  return (
    <section className="panel formation-log">
      <div className="panel-title">입자 형성 로그 · 상호작용 해석</div>
      <div className="log-columns three">
        <div>
          <h3>형성/붕괴 이벤트</h3>
          {events.length === 0 ? (
            <p className="muted">아직 표시할 이벤트가 없습니다. 공진과 mass-bond가 누적되면 fragment/proto/forming 단계가 기록됩니다.</p>
          ) : (
            <ul className="event-list">
              {events.map((e) => (
                <li key={e.id} className={`event-${e.kind}`}>
                  <b>t{e.tick}</b>
                  <span>{e.kind}</span>
                  <em>{e.label}</em>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>v8.6 안정 검증 이벤트</h3>
          {transitions.length === 0 ? (
            <p className="muted">아직 안정 검증 이벤트가 없습니다. 후보가 추적되면 birth/stable/decay/merge-risk가 기록됩니다.</p>
          ) : (
            <ul className="event-list">
              {transitions.map((e) => (
                <li key={e.id} className={`event-${e.kind}`}>
                  <b>t{e.tick}</b>
                  <span>{e.kind}</span>
                  <em>{e.label} · score {fmt(e.score, 3)}</em>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>입자쌍 효과장</h3>
          {interactions.length === 0 ? (
            <p className="muted">입자 후보가 2개 이상 생기면 인력/척력/교란 선과 수치가 표시됩니다.</p>
          ) : (
            <ul className="interaction-list">
              {interactions.map((it) => (
                <li key={it.id} className={`mode-${it.mode}`}>
                  <b>#{it.a}↔#{it.b}</b>
                  <span>{it.mode === 'attract' ? '끌림' : it.mode === 'repel' ? '밀림' : '교란'}</span>
                  <em>{dominantLabel(it)} · net {fmt(it.net, 4)} · weak {fmt(it.weak, 4)}</em>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="hint">
        이 패널의 네 힘은 표준물리 방정식이 아니라 태극자 문서의 공진·전하·색 중성도·질량화 정도를 코드화한 현상론적 효과장입니다.
      </p>
    </section>
  );
}
