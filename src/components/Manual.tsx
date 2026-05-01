import { theoryNotes } from '../model/theoryNotes';

export function Manual() {
  return (
    <section className="panel manual">
      <div className="panel-title">모델 설명 · 문서 이론을 코드로 옮긴 방식</div>
      <div className="manual-grid">
        {theoryNotes.map((item) => (
          <article key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
      <div className="caution">
        이 코드는 태극자 우주론의 개념을 계산 가능한 장난감 모델로 바꾼 연구용 시뮬레이터입니다. 표준물리의 검증된 수치 예측을 대체하지 않으며, 어떤 규칙을 강화하면 어떤 창발 패턴이 나오는지 탐색하기 위한 도구입니다.
      </div>
    </section>
  );
}
