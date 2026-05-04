import { useMemo, useState } from 'react';
import { runVerificationSuite, VERIFICATION_MODES, type VerificationProgress } from '../model/verification';
import type { SimulationConfig, VerificationSuiteResult } from '../model/types';

interface Props {
  config: SimulationConfig;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function fixed(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(digits);
}

function sci(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1e4 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)) return value.toExponential(2);
  return value.toFixed(3);
}

export function VerificationPanel({ config }: Props) {
  const [runsPerMode, setRunsPerMode] = useState(20);
  const [stepsPerRun, setStepsPerRun] = useState(420);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<VerificationProgress | null>(null);
  const [result, setResult] = useState<VerificationSuiteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalRuns = VERIFICATION_MODES.length * runsPerMode;

  const verdict = useMemo(() => {
    if (!result) return null;
    const normal = result.summaries.find((s) => s.mode === 'normal');
    const controls = result.summaries.filter((s) => s.mode !== 'normal');
    if (!normal) return null;

    const suspicious = controls.filter((s) => s.interpretation === 'weakens-model');
    const supportive = controls.filter((s) => s.interpretation === 'supports-model');

    if (suspicious.length > 0) {
      return {
        tone: 'weakens-model' as const,
        title: '검증 경고: 대조군에서도 입자 생성이 높습니다.',
        body: `정상 규칙과 비슷한 결과가 ${suspicious.length}개 대조군에서 나왔습니다. 이 경우 현재 엔진은 태극자 규칙보다 결합 임계값/그래프 구조 자체가 입자를 만들고 있을 가능성이 있습니다.`
      };
    }

    if (supportive.length >= 2 && (normal.stableSuccessRate > 0 || normal.completeSuccessRate > 0)) {
      return {
        tone: 'supports-model' as const,
        title: '규칙 의존성 있음: 대조군에서 생성률이 감소했습니다.',
        body: '공진·임피던스·색 보완성·에너지 보정 대조군에서 안정/완성 입자 생성률이 낮아졌다면, 입자 생성이 무작위 결합이 아니라 태극자 규칙에 의존한다는 내부 검증 근거가 됩니다.'
      };
    }

    return {
      tone: 'inconclusive' as const,
      title: '판정 보류: 더 긴 실행 또는 파라미터 스윕이 필요합니다.',
      body: '정상 규칙의 생성률이 낮거나 대조군과 차이가 충분히 크지 않습니다. 스텝 수, 노드 수, 임계값을 바꿔 반복 검증해야 합니다.'
    };
  }, [result]);

  const start = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      const suite = await runVerificationSuite(
        config,
        { runsPerMode, stepsPerRun, seedBase: config.seed },
        setProgress
      );
      setResult(suite);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="panel verification">
      <div className="panel-title">v8 반증 모드 · 반복 검증</div>
      <p className="hint">
        정상 태극자 규칙과 공진 OFF, 임피던스 OFF, 색 보완성 OFF, 에너지 보정 OFF, 랜덤 결합 모델을 같은 seed 계열로 반복 실행합니다.
        목표는 “입자가 그냥 생기도록 코딩되었는가”와 “공진·정합 규칙이 실제로 생성률을 좌우하는가”를 분리해 보는 것입니다.
      </p>

      <div className="verification-toolbar">
        <label>
          <span>모드당 반복</span>
          <input
            type="number"
            min={1}
            max={30}
            value={runsPerMode}
            disabled={running}
            onChange={(e) => setRunsPerMode(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
          />
        </label>
        <label>
          <span>run당 스텝</span>
          <input
            type="number"
            min={60}
            max={1200}
            step={30}
            value={stepsPerRun}
            disabled={running}
            onChange={(e) => setStepsPerRun(Math.max(60, Math.min(1200, Number(e.target.value) || 60)))}
          />
        </label>
        <button onClick={start} disabled={running}>
          {running ? '검증 실행 중...' : '반증 검증 실행'}
        </button>
        <small>
          총 {totalRuns}회 실행 · 현재 노드 {config.nodeCount}개 · seed {config.seed}
        </small>
      </div>

      {progress && (
        <div className="verification-progress">
          <div>
            <b>{progress.currentLabel}</b>
            <span>{progress.done} / {progress.total} runs</span>
          </div>
          <div className="progress-track">
            <i style={{ width: `${Math.min(100, (progress.done / Math.max(1, progress.total)) * 100)}%` }} />
          </div>
        </div>
      )}

      {error && <div className="verification-error">검증 실행 오류: {error}</div>}

      {verdict && (
        <div className={`verification-summary ${verdict.tone}`}>
          <b>{verdict.title}</b>
          <p>{verdict.body}</p>
        </div>
      )}

      {result && (
        <div className="verification-table-wrap">
          <table className="verification-table">
            <thead>
              <tr>
                <th>검증 모드</th>
                <th>stable 성공률</th>
                <th>complete 성공률</th>
                <th>평균 stable</th>
                <th>평균 mass-bond</th>
                <th>최대 스케일</th>
                <th>soliton</th>
                <th>에너지 drift</th>
                <th>판정</th>
              </tr>
            </thead>
            <tbody>
              {result.summaries.map((summary) => (
                <tr key={summary.mode}>
                  <td>
                    <b>{summary.label}</b>
                    <small>{VERIFICATION_MODES.find((m) => m.mode === summary.mode)?.description}</small>
                  </td>
                  <td>{percent(summary.stableSuccessRate)}</td>
                  <td>{percent(summary.completeSuccessRate)}</td>
                  <td>{fixed(summary.avgStableCount, 2)}</td>
                  <td>{fixed(summary.avgMassBondCount, 1)}</td>
                  <td>{percent(summary.avgLargestScaleFraction)}</td>
                  <td>{fixed(summary.avgSolitonScore, 3)}</td>
                  <td>{sci(summary.avgEnergyDrift)}</td>
                  <td>
                    <span className={`verdict ${summary.interpretation}`}>
                      {summary.interpretation === 'supports-model' ? '규칙 의존' : summary.interpretation === 'weakens-model' ? '경고' : '보류'}
                    </span>
                    <p>{summary.reason}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
