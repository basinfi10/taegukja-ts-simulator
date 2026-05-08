import type { ForceIsolationMode, ForceView, InitialDistributionMode, SimulationConfig, TargetParticlePreset, TopologyMode } from '../model/types';

type Props = {
  config: SimulationConfig;
  running: boolean;
  onChange: (patch: Partial<SimulationConfig>) => void;
  onReset: () => void;
  onToggle: () => void;
  onStep: () => void;
};

function Slider({ label, value, min, max, step, onChange, suffix = '', digits = 2 }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string; digits?: number }) {
  return (
    <label className="control-row">
      <span>{label}<b>{Number.isInteger(value) ? value : value.toFixed(digits)}{suffix}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function SciNumber({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="number-row">
      <span>{label}</span>
      <input value={String(value)} onChange={(e) => {
        const next = Number(e.target.value);
        if (Number.isFinite(next) && next > 0) onChange(next);
      }} />
      {hint && <small>{hint}</small>}
    </label>
  );
}


function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="toggle-row">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Controls({ config, running, onChange, onReset, onToggle, onStep }: Props) {
  const crossingTicks = (config.particleEffectiveRadiusM / 299_792_458) / Math.max(1e-99, config.planckTimeS);
  const effectiveSps = config.measuredStepsPerSecond > 0.5 ? config.measuredStepsPerSecond : config.visualStepsPerSecond;
  const recommendedCompression = crossingTicks / Math.max(1, config.crossingVisualSeconds * effectiveSps);
  return (
    <aside className="panel controls">
      <div className="panel-title">설정 · v8.5.4 성능 점검/coarse 사건장 엔진</div>
      <div className="button-row">
        <button onClick={onToggle}>{running ? '일시정지' : '실행'}</button>
        <button onClick={onStep}>1스텝</button>
        <button onClick={onReset}>재생성</button>
      </div>

      <div className="section-label">실제 스케일 정의</div>
      <label className="select-row">목표 입자 에너지
        <select value={config.targetParticlePreset} onChange={(e) => onChange({ targetParticlePreset: e.target.value as TargetParticlePreset })}>
          <option value="electron">전자 정지에너지</option>
          <option value="proton">양성자 정지에너지</option>
          <option value="custom">사용자 정의</option>
        </select>
      </label>
      <SciNumber label="태극자 길이 ℓ_TQ(m)" value={config.planckLengthM} onChange={(planckLengthM) => onChange({ planckLengthM })} hint="기본값: 플랑크 길이 1.616255e-35" />
      <SciNumber label="소립자 유효 반경 r(m)" value={config.particleEffectiveRadiusM} onChange={(particleEffectiveRadiusM) => onChange({ particleEffectiveRadiusM })} hint="기본값: 1e-19 m" />
      <SciNumber label="플랑크 에너지 후보(J)" value={config.planckEnergyJ} onChange={(planckEnergyJ) => onChange({ planckEnergyJ })} hint="점유율 계산용. 전체 에너지를 그대로 쓰지 않음." />
      <SciNumber label="플랑크 시간 t_P(s)" value={config.planckTimeS} onChange={(planckTimeS) => onChange({ planckTimeS })} hint="태극자 1 변화 = 1 플랑크 틱" />
      <SciNumber label="시간 압축 계수 K_t" value={config.timeCompressionFactor} onChange={(timeCompressionFactor) => onChange({ timeCompressionFactor })} hint="화면 스텝 1개가 대표하는 실제 플랑크 틱 수" />
      <Slider label="crossing 화면 목표 시간" value={config.crossingVisualSeconds} min={30} max={900} step={10} suffix="s" digits={0} onChange={(crossingVisualSeconds) => {
        const nextCompression = crossingTicks / Math.max(1, crossingVisualSeconds * effectiveSps);
        onChange({ crossingVisualSeconds, timeCompressionFactor: nextCompression });
      }} />
      <Slider label="초기/목표 SPS" value={config.visualStepsPerSecond} min={10} max={120} step={1} suffix="sps" digits={0} onChange={(visualStepsPerSecond) => {
        const nextCompression = crossingTicks / Math.max(1, config.crossingVisualSeconds * visualStepsPerSecond);
        onChange({ visualStepsPerSecond, timeCompressionFactor: nextCompression });
      }} />
      <Toggle label="실측 SPS로 시간 자동 보정" checked={config.autoCalibrateTimeCompression} onChange={(autoCalibrateTimeCompression) => onChange({ autoCalibrateTimeCompression })} hint="PC/브라우저 처리 속도를 측정해 K_t를 자동 조정" />
      <p className="hint">실측 SPS: {config.measuredStepsPerSecond > 0 ? config.measuredStepsPerSecond.toFixed(1) : '측정 전'} · 적용 SPS: {effectiveSps.toFixed(1)}. v8.5는 입자 반경 crossing tick ≈ 6.19×10¹⁵을 화면 약 5분에 대응시키되, 실제 컴퓨터 처리 속도에 맞춰 K_t를 보정합니다. 현재 권장 K_t: {recommendedCompression.toExponential(3)}</p>
      {config.targetParticlePreset === 'custom' && (
        <SciNumber label="사용자 목표 정지에너지(J)" value={config.customTargetRestEnergyJ} onChange={(customTargetRestEnergyJ) => onChange({ customTargetRestEnergyJ })} />
      )}
      <Slider label="화면 노드 수" value={config.nodeCount} min={300} max={3000} step={20} onChange={(nodeCount) => onChange({ nodeCount, maxLinks: Math.min(24000, Math.max(Math.floor(nodeCount * Math.max(5, config.averageDegree * 1.35)), config.maxLinks)) })} digits={0} />
      <p className="hint">v8.5 연구 권장 범위는 1000~3000개입니다. 대표 로드 100개 = 소립자 1개 스케일이며, 1000개는 약 10개 입자, 3000개는 약 30개 입자 스케일의 상호작용을 보는 설정입니다.</p>
      <Slider label="입자 1개당 대표 로드" value={config.nodesPerParticleBase} min={20} max={1000} step={10} onChange={(nodesPerParticleBase) => onChange({ nodesPerParticleBase })} digits={0} />
      <Slider label="완성 입자 판정 비율" value={config.completeParticleFraction} min={0.1} max={1} step={0.01} onChange={(completeParticleFraction) => onChange({ completeParticleFraction })} />
      <Slider label="안정 판정 유지 틱" value={config.stableParticleAge} min={1} max={120} step={1} onChange={(stableParticleAge) => onChange({ stableParticleAge })} digits={0} />

      <div className="section-label">초기 로드/분산 설정</div>
      <label className="select-row">초기 태극자 배치
        <select value={config.initialDistribution} onChange={(e) => onChange({ initialDistribution: e.target.value as InitialDistributionMode })}>
          <option value="uniform-field">전 화면 균일 랜덤장</option>
          <option value="grid-jitter">격자 기반 균일 분산</option>
          <option value="ring-shell">외곽 링 셸</option>
          <option value="center-cloud">중심 구름 · 비교용</option>
        </select>
      </label>
      <Slider label="초기 화면 여백" value={config.initialFieldMargin} min={8} max={160} step={1} onChange={(initialFieldMargin) => onChange({ initialFieldMargin })} digits={0} suffix="px" />
      <Slider label="초기 랜덤 흔들림" value={config.initialJitter} min={0} max={1} step={0.01} onChange={(initialJitter) => onChange({ initialJitter })} />
      <Slider label="초기 요동 속도" value={config.initialVelocityScale} min={0} max={0.18} step={0.005} onChange={(initialVelocityScale) => onChange({ initialVelocityScale })} digits={3} />
      <Slider label="초기 근접 연결 반경" value={config.initialLocalRadius} min={32} max={220} step={1} onChange={(initialLocalRadius) => onChange({ initialLocalRadius })} digits={0} suffix="px" />
      <p className="hint">v8.1 기본값은 태극자 1000~3000개가 화면 전체에 먼저 퍼져 있는 상태입니다. 입자 후보는 처음부터 뭉쳐 있지 않고, 근접 연결·에너지 흐름·공진 정합을 거치며 생겨야 정상적인 관찰입니다. 이 항목을 바꾼 뒤에는 재생성을 누르십시오.</p>

      <div className="section-label">네트워크/공진 설정</div>
      <label className="select-row">초기 연결 구조
        <select value={config.topology} onChange={(e) => onChange({ topology: e.target.value as TopologyMode })}>
          <option value="spatial-local">공간 근접 연결 · 권장</option>
          <option value="small-world">작은 세계</option>
          <option value="seeded-random">랜덤 공진</option>
          <option value="ring">링</option>
          <option value="grid">격자</option>
        </select>
      </label>
      <label className="select-row">힘 표시
        <select value={config.showForceView} onChange={(e) => onChange({ showForceView: e.target.value as ForceView })}>
          <option value="all">전체</option>
          <option value="strong">강력</option>
          <option value="em">전자기력</option>
          <option value="weak">약력</option>
          <option value="gravity">중력</option>
          <option value="resonance">공진</option>
          <option value="event">이벤트/pulse</option>
        </select>
      </label>

      <div className="section-label">v8.2 뭉침 원인 검증</div>
      <label className="select-row">힘 격리 모드
        <select value={config.forceIsolationMode} onChange={(e) => onChange({ forceIsolationMode: e.target.value as ForceIsolationMode })}>
          <option value="none">전체 힘 사용</option>
          <option value="resonance-only">공진 인력만 보기</option>
          <option value="impedance-only">임피던스 정합만 보기</option>
          <option value="mass-bond-only">mass-bond만 보기</option>
        </select>
      </label>
      <Toggle label="중력-like OFF" checked={config.disableGravityLike} onChange={(disableGravityLike) => onChange({ disableGravityLike })} hint="입자/태극자 질량 유사 끌림만 제거" />
      <Toggle label="damping OFF" checked={config.disableDamping} onChange={(disableDamping) => onChange({ disableDamping })} hint="속도 감쇠 때문에 뭉치는지 검사" />
      <Toggle label="중앙 끌림 완전 차단" checked={config.blockCenterPull} onChange={(blockCenterPull) => onChange({ blockCenterPull })} hint="명시적 중심 수렴 항 금지" />
      <Toggle label="전체 평균 위치 고정 금지" checked={config.forbidMeanPositionLock} onChange={(forbidMeanPositionLock) => onChange({ forbidMeanPositionLock })} hint="평균 좌표를 인위적으로 화면 중앙에 고정하지 않음" />
      <p className="hint danger-hint">v8.2 검증 기준: 정상 규칙에서 여러 국소 클러스터가 생기고, 공진/임피던스/mass-bond 격리 모드에서 기여도가 달라져야 합니다. centerBias가 높으면 중앙 수렴 편향을 의심해야 합니다.</p>

      <div className="section-label">v8.3 에너지 보존 순환 이벤트</div>
      <Toggle label="이벤트 순환 엔진 ON" checked={config.enableEventCirculation} onChange={(enableEventCirculation) => onChange({ enableEventCirculation })} hint="trigger → pulse → loop → cycle-bond" />
      <Toggle label="입자 판정에 cycle 요구" checked={config.requireCycleForParticle} onChange={(requireCycleForParticle) => onChange({ requireCycleForParticle })} hint="mass-bond 덩어리만으로 stable/complete가 되지 않게 함" />
      <Slider label="이벤트 트리거 임계값" value={config.eventTriggerThreshold} min={0.12} max={0.95} step={0.01} onChange={(eventTriggerThreshold) => onChange({ eventTriggerThreshold })} />
      <Slider label="pulse 감쇠" value={config.eventPulseDecay} min={0.65} max={0.98} step={0.01} onChange={(eventPulseDecay) => onChange({ eventPulseDecay })} />
      <Slider label="이벤트 결합 세기" value={config.eventCouplingStrength} min={0} max={3} step={0.05} onChange={(eventCouplingStrength) => onChange({ eventCouplingStrength })} />
      <Slider label="activity 감쇠" value={config.activityDecay} min={0.90} max={0.995} step={0.001} onChange={(activityDecay) => onChange({ activityDecay })} digits={3} />
      <Slider label="연속성 증가율" value={config.continuityGain} min={0} max={0.35} step={0.005} onChange={(continuityGain) => onChange({ continuityGain })} digits={3} />
      <Slider label="연속성 감쇠율" value={config.continuityDecay} min={0} max={0.12} step={0.002} onChange={(continuityDecay) => onChange({ continuityDecay })} digits={3} />
      <Slider label="cycle-bond 임계값" value={config.cycleBondThreshold} min={0.20} max={0.95} step={0.01} onChange={(cycleBondThreshold) => onChange({ cycleBondThreshold })} />
      <Slider label="루프 표본 수" value={config.loopSampleCount} min={40} max={520} step={10} onChange={(loopSampleCount) => onChange({ loopSampleCount })} digits={0} />
      <Slider label="루프 위상 폐합 허용" value={config.loopClosureTolerance} min={0.15} max={2.4} step={0.01} onChange={(loopClosureTolerance) => onChange({ loopClosureTolerance })} />
      <p className="hint">v8.3의 핵심은 정적 에너지값이 아니라 변화 이벤트의 연속성입니다. pulse가 끊기면 activity가 낮아지고, 닫힌 루프가 유지되면 cycle-bond가 생깁니다.</p>

      <div className="section-label">v8.4 공진 우선순위 탐색</div>
      <Toggle label="공진 우선순위 탐색 ON" checked={config.enableResonancePrioritySearch} onChange={(enableResonancePrioritySearch) => onChange({ enableResonancePrioritySearch })} hint="거리만이 아니라 pulse 성공률·루프 폐합 가능성까지 보고 연결" />
      <Toggle label="우선순위 후보 표시" checked={config.showPriorityCandidates} onChange={(showPriorityCandidates) => onChange({ showPriorityCandidates })} hint="왜 연결 후보가 선택/보류됐는지 화면과 패널에 표시" />
      <Slider label="후보 표본 수" value={config.priorityCandidateSamples} min={6} max={80} step={1} onChange={(priorityCandidateSamples) => onChange({ priorityCandidateSamples })} digits={0} />
      <Slider label="과거 pulse 이력 가중" value={config.priorityHistoryWeight} min={0} max={0.35} step={0.01} onChange={(priorityHistoryWeight) => onChange({ priorityHistoryWeight })} />
      <Slider label="루프 폐합 가능성 가중" value={config.priorityLoopWeight} min={0} max={0.40} step={0.01} onChange={(priorityLoopWeight) => onChange({ priorityLoopWeight })} />
      <Slider label="시험 pulse 세기" value={config.testPulseStrength} min={0.02} max={0.60} step={0.01} onChange={(testPulseStrength) => onChange({ testPulseStrength })} />
      <Slider label="실패 연결 약화율" value={config.failedEdgeDecay} min={0} max={0.09} step={0.001} onChange={(failedEdgeDecay) => onChange({ failedEdgeDecay })} digits={3} />
      <p className="hint">v8.4 연결 우선순위 = 거리 + 위상 + 주파수 정수비 + 임피던스 + 에너지 흐름 + 이벤트 연속성 + 과거 pulse 성공률 + 루프 폐합 가능성입니다.</p>

      <div className="section-label">v8.5.2 pulse density governor</div>
      <Toggle label="pulse 밀도 조절 ON" checked={config.enablePulseGovernor} onChange={(enablePulseGovernor) => onChange({ enablePulseGovernor })} hint="pulse가 너무 적거나 많을 때 발생량을 자동 조절" />
      <Slider label="목표 pulse 밀도" value={config.targetPulseDensity} min={0.005} max={0.18} step={0.005} onChange={(targetPulseDensity) => onChange({ targetPulseDensity })} digits={3} />
      <Slider label="최대 표시 pulse" value={config.maxVisiblePulses} min={40} max={700} step={10} onChange={(maxVisiblePulses) => onChange({ maxVisiblePulses })} digits={0} />
      <Slider label="스텝당 pulse 예산" value={config.pulseEmissionBudgetPerStep} min={2} max={120} step={1} onChange={(pulseEmissionBudgetPerStep) => onChange({ pulseEmissionBudgetPerStep })} digits={0} />
      <Slider label="pulse throttle 강도" value={config.pulseThrottleStrength} min={0} max={1.5} step={0.01} onChange={(pulseThrottleStrength) => onChange({ pulseThrottleStrength })} />
      <Slider label="pulse 표시 수명" value={config.pulseVisualLifetime} min={12} max={180} step={1} onChange={(pulseVisualLifetime) => onChange({ pulseVisualLifetime })} digits={0} />
      <Slider label="pulse 표시 속도" value={config.pulseVisualSpeed} min={0.12} max={2.2} step={0.01} onChange={(pulseVisualSpeed) => onChange({ pulseVisualSpeed })} />
      <Slider label="최소 표시 세기" value={config.minPulseIntensity} min={0.005} max={0.18} step={0.005} onChange={(minPulseIntensity) => onChange({ minPulseIntensity })} digits={3} />
      <p className="hint">일반 PC에서는 10^47개 태극자 사건을 직접 렌더링할 수 없습니다. v8.5.2는 전체 사건장을 통계적으로 유지하면서 화면에는 대표 pulse만 밀도 조절해 표시합니다.</p>

      <div className="section-label">v8.5.3 계층적 사건장 표시</div>
      <Toggle label="coarse 사건장 계산 ON" checked={config.enableCoarseEventField} onChange={(enableCoarseEventField) => onChange({ enableCoarseEventField })} hint="대표 pulse·연속성·루프 폐합률을 격자장으로 압축" />
      <Toggle label="coarse 사건장 화면 표시" checked={config.showCoarseEventField} onChange={(showCoarseEventField) => onChange({ showCoarseEventField })} hint="배경에 사건 흐름장을 표시" />
      <Slider label="격자 열" value={config.coarseGridCols} min={12} max={72} step={2} onChange={(coarseGridCols) => onChange({ coarseGridCols })} digits={0} />
      <Slider label="격자 행" value={config.coarseGridRows} min={8} max={48} step={2} onChange={(coarseGridRows) => onChange({ coarseGridRows })} digits={0} />
      <Slider label="사건장 시간 smoothing" value={config.coarseFieldSmoothing} min={0} max={0.95} step={0.01} onChange={(coarseFieldSmoothing) => onChange({ coarseFieldSmoothing })} />
      <Slider label="사건장 표시 강도" value={config.coarseFieldIntensity} min={0.2} max={2.8} step={0.05} onChange={(coarseFieldIntensity) => onChange({ coarseFieldIntensity })} />
      <Toggle label="입자 후보장 중심 표시" checked={config.showFieldParticlesOnly} onChange={(showFieldParticlesOnly) => onChange({ showFieldParticlesOnly })} hint="강한 입자 후보 주변 사건장만 강조하는 실험 옵션" />
      <p className="hint">v8.5.3은 미시 사건 전체 대신 격자형 사건장으로 pulse 밀도·연속성·루프 폐합률·입자 잠재장을 통계적으로 보존해 표현합니다.</p>

      <div className="section-label">v8.5.4 PC 성능 점검/최적화</div>
      <Toggle label="성능 모드 ON" checked={config.performanceMode} onChange={(performanceMode) => onChange({ performanceMode })} hint="무거운 통계와 렌더링을 일정 간격으로 분산" />
      <Slider label="snapshot 갱신 FPS" value={config.renderSnapshotFps} min={8} max={60} step={1} onChange={(renderSnapshotFps) => onChange({ renderSnapshotFps })} digits={0} />
      <Slider label="무거운 통계 계산 간격" value={config.heavyMetricInterval} min={1} max={12} step={1} onChange={(heavyMetricInterval) => onChange({ heavyMetricInterval })} digits={0} />
      <Slider label="입자 탐지 간격" value={config.particleDetectionInterval} min={1} max={12} step={1} onChange={(particleDetectionInterval) => onChange({ particleDetectionInterval })} digits={0} />
      <Slider label="루프 탐지 간격" value={config.cycleDetectionInterval} min={1} max={12} step={1} onChange={(cycleDetectionInterval) => onChange({ cycleDetectionInterval })} digits={0} />
      <Slider label="coarse field 갱신 간격" value={config.coarseFieldInterval} min={1} max={12} step={1} onChange={(coarseFieldInterval) => onChange({ coarseFieldInterval })} digits={0} />
      <Slider label="표시 edge 예산" value={config.maxRenderedEdges} min={500} max={12000} step={100} onChange={(maxRenderedEdges) => onChange({ maxRenderedEdges })} digits={0} />
      <Slider label="표시 node 예산" value={config.maxRenderedNodes} min={300} max={3000} step={100} onChange={(maxRenderedNodes) => onChange({ maxRenderedNodes })} digits={0} />
      <p className="hint">움직임이 적으면 snapshot FPS보다 measured SPS와 edge/node 렌더링 예산을 먼저 봐야 합니다. 기본값은 힘 벡터 표시를 끄고 edge 표시 수를 제한해 step 처리량을 우선 확보합니다.</p>

      <div className="section-label">v8.5.6 시각 흐름/렌더링 튜닝</div>
      <Slider label="엔진 스텝/프레임" value={config.engineStepsPerFrame} min={1} max={12} step={1} onChange={(engineStepsPerFrame) => onChange({ engineStepsPerFrame })} digits={0} />
      <Slider label="최대 catch-up 스텝" value={config.maxCatchUpSteps} min={1} max={24} step={1} onChange={(maxCatchUpSteps) => onChange({ maxCatchUpSteps })} digits={0} />
      <Slider label="시뮬레이션 속도 배율" value={config.simulationSpeedMultiplier} min={0.2} max={8} step={0.1} onChange={(simulationSpeedMultiplier) => onChange({ simulationSpeedMultiplier })} />
      <Slider label="edge 투명도 배율" value={config.edgeAlphaScale} min={0.05} max={1.4} step={0.05} onChange={(edgeAlphaScale) => onChange({ edgeAlphaScale })} />
      <Slider label="mass-bond 표시 비율" value={config.massBondRenderRatio} min={0.02} max={1} step={0.02} onChange={(massBondRenderRatio) => onChange({ massBondRenderRatio })} />
      <Slider label="cycle-bond 표시 비율" value={config.cycleBondRenderRatio} min={0.05} max={1} step={0.05} onChange={(cycleBondRenderRatio) => onChange({ cycleBondRenderRatio })} />
      <Toggle label="형성 이벤트 텍스트 표시" checked={config.showFormationLabels} onChange={(showFormationLabels) => onChange({ showFormationLabels })} hint="화면에 보이던 score/label 텍스트. 기본 OFF" />
      <Toggle label="입자 상호작용선 표시" checked={config.showInteractionLines} onChange={(showInteractionLines) => onChange({ showInteractionLines })} hint="입자 간 힘 선. 기본 OFF" />
      <Slider label="형성 파동 최대 수" value={config.maxFormationWaves} min={0} max={80} step={1} onChange={(maxFormationWaves) => onChange({ maxFormationWaves })} digits={0} />
      <Slider label="상호작용선 최대 수" value={config.maxInteractionLines} min={0} max={400} step={10} onChange={(maxInteractionLines) => onChange({ maxInteractionLines })} digits={0} />
      <p className="hint">캡처에서 보인 흰색 텍스트는 formation event label입니다. v8.5.6에서는 기본 OFF로 두고, 분석이 필요할 때만 켜도록 바꿨습니다.</p>
      <Slider label="평균 연결도" value={config.averageDegree} min={2} max={10} step={1} onChange={(averageDegree) => onChange({ averageDegree, maxLinks: Math.max(config.maxLinks, Math.floor(config.nodeCount * averageDegree * 0.9)) })} digits={0} />
      <Slider label="최대 연결 수" value={config.maxLinks} min={500} max={80000} step={100} onChange={(maxLinks) => onChange({ maxLinks })} digits={0} />
      <Slider label="Cₜ/c" value={config.ctRatio} min={1} max={80} step={1} onChange={(ctRatio) => onChange({ ctRatio })} digits={0} />
      <Slider label="태극자 기본 에너지 단위" value={config.energyPerNode} min={0.2} max={4} step={0.1} onChange={(energyPerNode) => onChange({ energyPerNode })} />
      <Slider label="공진 결합 K_R" value={config.resonanceCoupling} min={0} max={4} step={0.05} onChange={(resonanceCoupling) => onChange({ resonanceCoupling })} />
      <Slider label="임피던스 흐름 K_Z" value={config.impedanceCoupling} min={0} max={3} step={0.05} onChange={(impedanceCoupling) => onChange({ impedanceCoupling })} />
      <Slider label="질량 결합률" value={config.massBindingRate} min={0} max={4} step={0.05} onChange={(massBindingRate) => onChange({ massBindingRate })} />
      <Slider label="입자화 임계값" value={config.particleThreshold} min={0.35} max={0.95} step={0.01} onChange={(particleThreshold) => onChange({ particleThreshold })} />
      <Slider label="최소 클러스터 노드" value={config.minParticleNodes} min={2} max={80} step={1} onChange={(minParticleNodes) => onChange({ minParticleNodes })} digits={0} />
      <Slider label="강력 스케일" value={config.strongScale} min={0} max={3} step={0.05} onChange={(strongScale) => onChange({ strongScale })} />
      <Slider label="전자기력 스케일" value={config.electromagneticScale} min={0} max={3} step={0.05} onChange={(electromagneticScale) => onChange({ electromagneticScale })} />
      <Slider label="약력 스케일" value={config.weakScale} min={0} max={3} step={0.05} onChange={(weakScale) => onChange({ weakScale })} />
      <Slider label="중력 스케일" value={config.gravityScale} min={0} max={3} step={0.05} onChange={(gravityScale) => onChange({ gravityScale })} />
      <Slider label="느슨해짐" value={config.entropyLoosening} min={0} max={2} step={0.02} onChange={(entropyLoosening) => onChange({ entropyLoosening })} />
      <Slider label="연결 생성 시도" value={config.graphFormationAttempts} min={0} max={500} step={1} onChange={(graphFormationAttempts) => onChange({ graphFormationAttempts })} digits={0} />
      <Slider label="시간 배율" value={config.timeScale} min={0.1} max={3} step={0.05} onChange={(timeScale) => onChange({ timeScale })} />
      <Slider label="시드" value={config.seed} min={1} max={999999} step={1} onChange={(seed) => onChange({ seed })} digits={0} />
      <p className="hint">v8은 1000~3000개 연구용 범위에 반증 검증 모드를 더한 버전입니다. 화면 노드 1000개가 소립자 1개를 대표하는 기준이며, 3000개는 여러 입자 후보와 상호작용을 관찰하기 위한 상한입니다. 노드 수·초기 구조·시드·태극자 길이·소립자 반경 변경 후에는 재생성을 누르는 것이 가장 정확합니다.</p>
    </aside>
  );
}
