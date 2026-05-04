import { TaegukjaEngine } from './taegukjaEngine';
import type {
  SimulationConfig,
  VerificationMode,
  VerificationModeSummary,
  VerificationRunSummary,
  VerificationSuiteResult
} from './types';

export interface VerificationModeDefinition {
  mode: VerificationMode;
  label: string;
  description: string;
}

export interface VerificationOptions {
  runsPerMode: number;
  stepsPerRun: number;
  seedBase?: number;
  modes?: VerificationMode[];
}

export interface VerificationProgress {
  done: number;
  total: number;
  currentMode: VerificationMode;
  currentLabel: string;
  runIndex: number;
}

export const VERIFICATION_MODES: VerificationModeDefinition[] = [
  {
    mode: 'normal',
    label: '정상 태극자 규칙',
    description: '공진, 임피던스 정합, 색 보완성, 에너지 보존 보정이 모두 켜진 기본 모델'
  },
  {
    mode: 'resonance-off',
    label: '공진 OFF',
    description: '위상·주파수 공진 항을 낮은 상수값으로 고정해 공진 의존성을 검증'
  },
  {
    mode: 'impedance-off',
    label: '임피던스 OFF',
    description: '임피던스 정합 항을 낮은 상수값으로 고정해 정합 의존성을 검증'
  },
  {
    mode: 'color-off',
    label: '색 보완성 OFF',
    description: '색 보완성/중성화 가중치를 제거해 내부 결합 규칙 의존성을 검증'
  },
  {
    mode: 'energy-correction-off',
    label: '에너지 보정 OFF',
    description: '전역 에너지 보정 장치를 꺼서 안정화가 보정에 의존하는지 검증'
  },
  {
    mode: 'random-bond',
    label: '랜덤 결합 모델',
    description: '공진·임피던스 규칙 대신 확률적 결합/붕괴만으로 입자가 생기는지 비교'
  }
];

const modeLabel = (mode: VerificationMode): string =>
  VERIFICATION_MODES.find((m) => m.mode === mode)?.label ?? mode;

export function applyVerificationMode(
  base: SimulationConfig,
  mode: VerificationMode,
  seed: number
): SimulationConfig {
  const config: SimulationConfig = {
    ...base,
    seed,
    disableResonanceTerm: false,
    disableImpedanceTerm: false,
    disableColorTerm: false,
    disableEnergyCorrection: false,
    randomBondModel: false
  };

  switch (mode) {
    case 'resonance-off':
      config.disableResonanceTerm = true;
      config.resonanceCoupling = 0;
      break;
    case 'impedance-off':
      config.disableImpedanceTerm = true;
      config.impedanceCoupling = 0;
      break;
    case 'color-off':
      config.disableColorTerm = true;
      break;
    case 'energy-correction-off':
      config.disableEnergyCorrection = true;
      break;
    case 'random-bond':
      config.randomBondModel = true;
      config.disableResonanceTerm = true;
      config.disableImpedanceTerm = true;
      config.disableColorTerm = true;
      config.graphFormationAttempts = Math.max(12, Math.floor(base.graphFormationAttempts * 0.45));
      break;
    case 'normal':
    default:
      break;
  }

  return config;
}

function average(items: number[]): number {
  if (!items.length) return 0;
  return items.reduce((sum, value) => sum + value, 0) / items.length;
}

function summarizeMode(
  mode: VerificationMode,
  runs: VerificationRunSummary[],
  normalStableRate: number | null,
  normalCompleteRate: number | null
): VerificationModeSummary {
  const stableSuccessRate = runs.filter((r) => r.stableCount > 0).length / Math.max(1, runs.length);
  const completeSuccessRate = runs.filter((r) => r.completeCount > 0).length / Math.max(1, runs.length);
  const avgStableCount = average(runs.map((r) => r.stableCount));
  const avgCompleteCount = average(runs.map((r) => r.completeCount));
  const avgMassBondCount = average(runs.map((r) => r.massBondCount));
  const avgLargestScaleFraction = average(runs.map((r) => r.largestScaleFraction));
  const avgSolitonScore = average(runs.map((r) => r.strongestSolitonScore));
  const avgEnergyDrift = average(runs.map((r) => Math.abs(r.energyDriftAfterCorrection)));

  let interpretation: VerificationModeSummary['interpretation'] = 'inconclusive';
  let reason = '대조 기준이 아직 충분하지 않습니다. 반복 수를 늘리거나 설정을 바꿔 다시 확인해야 합니다.';

  if (mode === 'normal') {
    if (stableSuccessRate >= 0.2 || completeSuccessRate >= 0.05 || avgMassBondCount > 10) {
      interpretation = 'supports-model';
      reason = '정상 규칙에서 안정/결합 구조가 관측됩니다. 이제 대조군에서 이 값이 떨어지는지가 핵심입니다.';
    } else {
      interpretation = 'inconclusive';
      reason = '정상 규칙에서도 안정 입자 후보가 충분히 생기지 않았습니다. 임계값, 노드 수, 스텝 수 조정이 필요합니다.';
    }
  } else if (normalStableRate !== null && normalCompleteRate !== null) {
    const stableCloseToNormal = stableSuccessRate >= Math.max(0.05, normalStableRate * 0.75);
    const completeCloseToNormal = completeSuccessRate >= Math.max(0.03, normalCompleteRate * 0.75);
    if ((normalStableRate >= 0.1 || normalCompleteRate >= 0.05) && (stableCloseToNormal || completeCloseToNormal)) {
      interpretation = 'weakens-model';
      reason = '이 대조군에서도 정상 규칙과 비슷하게 입자가 생깁니다. 특정 태극자 규칙 의존성이 약하거나 과결합 가능성이 있습니다.';
    } else if ((normalStableRate >= 0.1 || normalCompleteRate >= 0.05) && stableSuccessRate <= normalStableRate * 0.55 && completeSuccessRate <= Math.max(0.02, normalCompleteRate * 0.55)) {
      interpretation = 'supports-model';
      reason = '정상 규칙에 비해 안정/완성 입자 생성률이 크게 줄었습니다. 해당 규칙이 구조 형성에 영향을 준다는 내부 증거입니다.';
    } else {
      interpretation = 'inconclusive';
      reason = '정상 규칙과의 차이가 충분히 크지 않거나 정상 생성률 자체가 낮습니다. 반복 수와 설정 스윕이 필요합니다.';
    }
  }

  return {
    mode,
    label: modeLabel(mode),
    runs: runs.length,
    stableSuccessRate,
    completeSuccessRate,
    avgStableCount,
    avgCompleteCount,
    avgMassBondCount,
    avgLargestScaleFraction,
    avgSolitonScore,
    avgEnergyDrift,
    interpretation,
    reason
  };
}

export async function runVerificationSuite(
  baseConfig: SimulationConfig,
  options: VerificationOptions,
  onProgress?: (progress: VerificationProgress) => void
): Promise<VerificationSuiteResult> {
  const modes = options.modes ?? VERIFICATION_MODES.map((m) => m.mode);
  const runsPerMode = Math.max(1, Math.floor(options.runsPerMode));
  const stepsPerRun = Math.max(1, Math.floor(options.stepsPerRun));
  const seedBase = options.seedBase ?? baseConfig.seed;
  const total = modes.length * runsPerMode;
  const rawRuns: VerificationRunSummary[] = [];
  let done = 0;

  for (const mode of modes) {
    for (let runIndex = 0; runIndex < runsPerMode; runIndex += 1) {
      const seed = seedBase + runIndex * 101 + modes.indexOf(mode) * 10_007;
      const config = applyVerificationMode(baseConfig, mode, seed);
      const engine = new TaegukjaEngine(config);

      for (let step = 0; step < stepsPerRun; step += 1) {
        engine.step(1 / 60);
      }

      const snapshot = engine.getSnapshot();
      const metrics = snapshot.metrics;

      rawRuns.push({
        mode,
        label: modeLabel(mode),
        runIndex,
        seed,
        stableCount: metrics.stableParticleCount,
        completeCount: metrics.completeParticleCount,
        formingCount: metrics.formingParticleCount,
        massBondCount: metrics.massBondCount,
        largestScaleFraction: metrics.largestParticleScaleFraction,
        strongestSolitonScore: metrics.strongestSolitonScore,
        avgResonance: metrics.avgResonance,
        avgImpedanceMatch: metrics.avgImpedanceMatch,
        energyDriftAfterCorrection: metrics.energyDriftAfterCorrection
      });

      done += 1;
      onProgress?.({
        done,
        total,
        currentMode: mode,
        currentLabel: modeLabel(mode),
        runIndex
      });

      // UI 스레드가 완전히 멈추지 않도록 각 run마다 제어권을 넘깁니다.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  const grouped = new Map<VerificationMode, VerificationRunSummary[]>();
  for (const run of rawRuns) {
    const list = grouped.get(run.mode) ?? [];
    list.push(run);
    grouped.set(run.mode, list);
  }

  const normalRuns = grouped.get('normal') ?? [];
  const normalStableRate = normalRuns.length ? normalRuns.filter((r) => r.stableCount > 0).length / normalRuns.length : null;
  const normalCompleteRate = normalRuns.length ? normalRuns.filter((r) => r.completeCount > 0).length / normalRuns.length : null;

  const summaries = modes.map((mode) =>
    summarizeMode(mode, grouped.get(mode) ?? [], normalStableRate, normalCompleteRate)
  );

  return {
    createdAt: new Date().toISOString(),
    nodeCount: baseConfig.nodeCount,
    stepsPerRun,
    runsPerMode,
    summaries,
    rawRuns
  };
}
