export type TopologyMode = 'seeded-random' | 'ring' | 'grid' | 'small-world' | 'spatial-local';
export type InitialDistributionMode = 'uniform-field' | 'center-cloud' | 'ring-shell' | 'grid-jitter';
export type EdgeKind = 'local' | 'resonance' | 'entangled' | 'mass-bond' | 'cycle-bond';
export type ParticleKind = 'pre-particle-fragment' | 'proto' | 'lepton-like' | 'meson-like' | 'baryon-like' | 'gauge-boson-like' | 'black-hole-like';
export type ParticleLifecycle = 'fragment' | 'forming' | 'stable' | 'complete';
export type FormationEventKind = 'birth' | 'merge' | 'collapse' | 'stabilize' | 'proto' | 'forming' | 'cycle';
export type ForceView = 'all' | 'strong' | 'em' | 'weak' | 'gravity' | 'resonance' | 'event';
export type ForceIsolationMode = 'none' | 'resonance-only' | 'impedance-only' | 'mass-bond-only';
export type TargetParticlePreset = 'electron' | 'proton' | 'custom';
export type VerificationMode =
  | 'normal'
  | 'resonance-off'
  | 'impedance-off'
  | 'color-off'
  | 'energy-correction-off'
  | 'random-bond';

export interface SimulationConfig {
  nodeCount: number;
  width: number;
  height: number;
  seed: number;
  topology: TopologyMode;
  /** 초기 태극자 로드 배치. v8.1 기본은 전 화면 균일 랜덤 분산장입니다. */
  initialDistribution: InitialDistributionMode;
  /** 화면 경계에서 떨어뜨리는 초기 여백(px) */
  initialFieldMargin: number;
  /** 균일 격자 위에 부여하는 랜덤 흔들림 비율 */
  initialJitter: number;
  /** 초기 운동량 세기. 분산장에서 아주 작은 열적 요동만 부여합니다. */
  initialVelocityScale: number;
  /** 초기/동적 공간 근접 연결 검색 반경(px) */
  initialLocalRadius: number;
  averageDegree: number;
  energyPerNode: number;
  ctRatio: number;
  resonanceCoupling: number;
  impedanceCoupling: number;
  linkAdaptationRate: number;
  resonanceThreshold: number;
  linkBreakThreshold: number;
  impedanceSpread: number;
  entropyLoosening: number;
  entangledPairs: number;
  maxLinks: number;
  timeScale: number;
  particleThreshold: number;
  minParticleNodes: number;
  massBindingRate: number;
  strongScale: number;
  electromagneticScale: number;
  weakScale: number;
  gravityScale: number;
  graphFormationAttempts: number;
  showForceView: ForceView;

  /** 실제 스케일 보정: 화면 노드는 실제 태극자 묶음(coarse-grained cell)입니다. */
  planckLengthM: number;
  planckEnergyJ: number;
  /** 태극자 1 변화 = 1 플랑크 틱 */
  planckTimeS: number;
  /** 시뮬레이터 화면 스텝 1개가 대표하는 실제 플랑크 틱 수 */
  timeCompressionFactor: number;
  /** 입자 반경 crossing을 화면에서 몇 초 정도로 볼지 정하는 목표값 */
  crossingVisualSeconds: number;
  /** 화면 기준 목표 프레임/스텝. 기본 60fps. 실측 전 초기 기준값입니다. */
  visualStepsPerSecond: number;
  /** 실제 브라우저/PC가 처리한 최근 steps per second */
  measuredStepsPerSecond: number;
  /** 실행 중 실측 SPS로 시간 압축 계수를 자동 재보정 */
  autoCalibrateTimeCompression: boolean;
  particleEffectiveRadiusM: number;
  targetParticlePreset: TargetParticlePreset;
  customTargetRestEnergyJ: number;
  targetParticleCountInView: number;
  /** 화면에서 소립자 1개를 구성하는 대표 로드 수. v8.5 기본은 100개, 총 노드 수가 늘면 다수 입자를 봅니다. */
  nodesPerParticleBase: number;
  completeParticleFraction: number;

  /** 안정 입자로 세기 위해 후보가 유지되어야 하는 시뮬레이션 틱 수 */
  stableParticleAge: number;
  /** 3000개 연구용 노드에서 화면이 너무 복잡해지지 않도록 자동 축소 렌더링 */
  adaptiveNodeRendering: boolean;

  /** v8 반증 모드 플래그: 정상 규칙과 대조군을 같은 엔진에서 비교하기 위한 스위치 */
  disableResonanceTerm: boolean;
  disableImpedanceTerm: boolean;
  disableColorTerm: boolean;
  disableEnergyCorrection: boolean;
  randomBondModel: boolean;

  /** v8.2 뭉침 원인 검증: 특정 힘만 남기거나 의심 항목을 끕니다. */
  forceIsolationMode: ForceIsolationMode;
  disableGravityLike: boolean;
  disableDamping: boolean;
  blockCenterPull: boolean;
  forbidMeanPositionLock: boolean;

  /** v8.3 에너지 보존 순환 이벤트 엔진 */
  enableEventCirculation: boolean;
  eventTriggerThreshold: number;
  eventPulseDecay: number;
  eventCouplingStrength: number;
  activityDecay: number;
  continuityGain: number;
  continuityDecay: number;
  cycleBondThreshold: number;
  loopSampleCount: number;
  loopClosureTolerance: number;
  requireCycleForParticle: boolean;

  /** v8.4 공진 우선순위 탐색 엔진 */
  enableResonancePrioritySearch: boolean;
  priorityCandidateSamples: number;
  priorityHistoryWeight: number;
  priorityLoopWeight: number;
  testPulseStrength: number;
  failedEdgeDecay: number;
  showPriorityCandidates: boolean;

  /** v8.5.2 pulse density governor: 일반 PC에서 연속적으로 보이되 폭주하지 않게 조절 */
  enablePulseGovernor: boolean;
  targetPulseDensity: number;
  maxVisiblePulses: number;
  pulseEmissionBudgetPerStep: number;
  pulseThrottleStrength: number;
  pulseVisualLifetime: number;
  pulseVisualSpeed: number;
  minPulseIntensity: number;

  /** v8.5.3 계층적 coarse-graining 사건장 */
  enableCoarseEventField: boolean;
  showCoarseEventField: boolean;
  coarseGridCols: number;
  coarseGridRows: number;
  coarseFieldSmoothing: number;
  coarseFieldIntensity: number;
  showFieldParticlesOnly: boolean;

  /** v8.5.4 PC performance governor */
  performanceMode: boolean;
  renderSnapshotFps: number;
  heavyMetricInterval: number;
  particleDetectionInterval: number;
  cycleDetectionInterval: number;
  coarseFieldInterval: number;
  maxRenderedEdges: number;
  maxRenderedNodes: number;
}


export interface PhysicalScaleInfo {
  planckLengthM: number;
  planckEnergyJ: number;
  /** 태극자 1 변화 = 1 플랑크 틱 */
  planckTimeS: number;
  /** 시뮬레이터 화면 스텝 1개가 대표하는 실제 플랑크 틱 수 */
  timeCompressionFactor: number;
  /** 입자 반경 crossing을 화면에서 몇 초 정도로 볼지 정하는 목표값 */
  crossingVisualSeconds: number;
  /** 화면 기준 목표 프레임/스텝. 기본 60fps. 실측 전 초기 기준값입니다. */
  visualStepsPerSecond: number;
  /** 실제 브라우저/PC가 처리한 최근 steps per second */
  measuredStepsPerSecond: number;
  /** 실행 중 실측 SPS로 시간 압축 계수를 자동 재보정 */
  autoCalibrateTimeCompression: boolean;
  /** 시간 계산에 실제 적용되는 SPS. 실측값이 없으면 목표값 사용 */
  effectiveStepsPerSecond: number;
  particleEffectiveRadiusM: number;
  targetRestEnergyJ: number;
  linearRatio: number;
  realTaegeukjaPerParticle: number;
  visibleNodesPerParticle: number;
  realTaegeukjaPerVisibleNode: number;
  totalParticleCapacityInView: number;
  particleRadiusCrossingTimeS: number;
  particleRadiusCrossingTicks: number;
  particleDiameterCrossingTimeS: number;
  particleDiameterCrossingTicks: number;
  electronComptonPeriodS: number;
  electronComptonTicks: number;
  protonComptonPeriodS: number;
  protonComptonTicks: number;
  physicalSecondsPerVisualStep: number;
  physicalSecondsPerVisualSecond: number;
  expectedCrossingVisualSeconds: number;
  elapsedVisualSecondsAtCurrentSps: number;
  elapsedPlanckTicks: number;
  elapsedPhysicalSeconds: number;
  crossingProgressFraction: number;
  electronComptonProgressFraction: number;
  protonComptonProgressFraction: number;
  effectiveEnergyPerRealTaegeukjaJ: number;
  effectiveEnergyOccupancyOfPlanck: number;
  representativeEnergyPerNodeJ: number;
  energyUnitJ: number;
  massUnitKg: number;
  completeParticleFraction: number;

  /** 안정 입자로 세기 위해 후보가 유지되어야 하는 시뮬레이션 틱 수 */
  stableParticleAge: number;
  /** 3000개 연구용 노드에서 화면이 너무 복잡해지지 않도록 자동 축소 렌더링 */
  adaptiveNodeRendering: boolean;

  /** v8 반증 모드 플래그: 정상 규칙과 대조군을 같은 엔진에서 비교하기 위한 스위치 */
  disableResonanceTerm: boolean;
  disableImpedanceTerm: boolean;
  disableColorTerm: boolean;
  disableEnergyCorrection: boolean;
  randomBondModel: boolean;
}




export interface ForceDecompositionMetrics {
  resonanceAttraction: number;
  impedanceAlignment: number;
  massBondCohesion: number;
  gravityLike: number;
  electromagneticAttraction: number;
  electromagneticRepulsion: number;
  dampingLoss: number;
  randomMotion: number;
  centerBias: number;
  boundaryEffect: number;
  totalCohesion: number;
  totalDispersion: number;
  normalizedCohesion: number;
  localClusterBias: number;
}

export interface TaegukjaNode {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  omega: number;
  sigma: 1 | -1;
  impedance: number;
  energy: number;
  boundEnergy: number;
  massLike: number;
  physicalEnergyJ: number;
  representedTaegeukjaCount: number;
  charge: number;
  color: 0 | 1 | 2;
  weakState: -1 | 0 | 1;
  loopRadius: number;
  degree: number;
  clusterId: number;
  isParticleCore: boolean;
  forceStrongX: number;
  forceStrongY: number;
  forceEmX: number;
  forceEmY: number;
  forceWeakX: number;
  forceWeakY: number;
  forceGravityX: number;
  forceGravityY: number;

  /** v8.3: 변화 이벤트/순환 상태 */
  eventClock: number;
  triggerPotential: number;
  eventActivity: number;
  eventContinuity: number;
  cycleMemory: number;
  lastTriggerTick: number;
}

export interface TaegukjaEdge {
  id: string;
  a: number;
  b: number;
  kind: EdgeKind;
  weight: number;
  resonance: number;
  impedanceMatch: number;
  flow: number;
  restLength: number;
  age: number;
  binding: number;
  strong: number;
  em: number;
  weak: number;
  gravity: number;

  /** v8.3: edge는 단순 선이 아니라 trigger 전달 통로입니다. */
  triggerDelay: number;
  pulsePhase: number;
  pulseStrength: number;
  lastPulseTick: number;
  eventContinuity: number;
  circulationScore: number;

  /** v8.4: 연결 선택 우선순위와 시험 pulse 이력 */
  priorityScore: number;
  priorityProximity: number;
  priorityPhase: number;
  priorityFrequency: number;
  priorityImpedance: number;
  priorityEnergyFlow: number;
  priorityEventContinuity: number;
  priorityHistory: number;
  priorityLoopPotential: number;
  pulseSuccess: number;
  pulseFail: number;
  historySuccess: number;
  loopClosurePotential: number;
  lastPriorityTick: number;
}

export interface ParticleInfo {
  id: number;
  kind: ParticleKind;
  nodeIds: number[];
  size: number;
  totalEnergy: number;
  boundEnergy: number;
  totalEnergyJ: number;
  mass: number;
  massKg: number;
  charge: number;
  colorNeutrality: number;
  spinLike: number;
  order: number;
  meanImpedance: number;
  solitonScore: number;
  stabilityAge: number;
  cx: number;
  cy: number;
  radius: number;
  representedTaegeukjaCount: number;
  particleScaleFraction: number;
  completeParticle: boolean;
  lifecycle: ParticleLifecycle;
  formationStage: number;

  /** v8.3: 입자는 단순 mass-bond 덩어리가 아니라 닫힌 이벤트 순환 밀도로 판정됩니다. */
  cycleDensity: number;
  cycleContinuity: number;
  loopClosureScore: number;
}

export interface FormationEvent {
  id: number;
  tick: number;
  kind: FormationEventKind;
  x: number;
  y: number;
  radius: number;
  intensity: number;
  label: string;
}

export interface ParticleInteraction {
  id: string;
  a: number;
  b: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  strong: number;
  em: number;
  weak: number;
  gravity: number;
  net: number;
  mode: 'attract' | 'repel' | 'disturb';
}

export interface EventPulse {
  id: number;
  from: number;
  to: number;
  edgeId: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  age: number;
  intensity: number;
  phaseError: number;
  visualLife: number;
  visualOffset: number;
  visualSpeed: number;
}

export interface CycleLoopInfo {
  id: string;
  nodeIds: number[];
  edgeIds: string[];
  cx: number;
  cy: number;
  radius: number;
  phaseClosureError: number;
  impedanceLoss: number;
  continuity: number;
  score: number;
  age: number;
}

export interface PriorityBreakdown {
  proximity: number;
  phase: number;
  frequency: number;
  impedance: number;
  energyFlow: number;
  eventContinuity: number;
  history: number;
  loopPotential: number;
  total: number;
}

export interface PriorityCandidate {
  id: string;
  a: number;
  b: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  selected: boolean;
  reason: string;
  breakdown: PriorityBreakdown;
}

export interface PriorityMetrics {
  avgPriorityScore: number;
  avgSelectedPriority: number;
  avgPulseHistory: number;
  candidateCount: number;
  selectedCount: number;
  rejectedCount: number;
  failedEdgeDecayCount: number;
  loopPotentialAvg: number;
}

export interface PulseGovernorMetrics {
  activePulseCount: number;
  targetPulseCount: number;
  densityRatio: number;
  governorScale: number;
  emissionBudget: number;
  emittedThisStep: number;
  suppressedThisStep: number;
  avgPulseIntensity: number;
}

export interface EventCycleMetrics {
  activePulseCount: number;
  cycleBondCount: number;
  avgEventActivity: number;
  avgEventContinuity: number;
  avgCycleContinuity: number;
  stableLoopCount: number;
  avgLoopClosureError: number;
  energyActivity: number;
  voidNodeRatio: number;
}


export interface ForceMetrics {
  strongActivity: number;
  emActivity: number;
  weakActivity: number;
  gravityActivity: number;
  massFormationRate: number;
  particleInfluenceRadius: number;
}

export interface CoarseFieldCell {
  gx: number;
  gy: number;
  x: number;
  y: number;
  w: number;
  h: number;
  pulseDensity: number;
  eventContinuity: number;
  loopClosure: number;
  resonancePriority: number;
  particlePotential: number;
  activeEnergy: number;
}

export interface CoarseFieldMetrics {
  cols: number;
  rows: number;
  maxPulseDensity: number;
  maxContinuity: number;
  maxLoopClosure: number;
  maxParticlePotential: number;
  activeCellRatio: number;
  meanActiveEnergy: number;
}

export interface PerformanceMetrics {
  snapshotFps: number;
  renderedEdgeBudget: number;
  renderedNodeBudget: number;
  heavyMetricInterval: number;
  particleDetectionInterval: number;
  cycleDetectionInterval: number;
  coarseFieldInterval: number;
}

export interface SimulationMetrics {
  tick: number;
  time: number;
  totalEnergy: number;
  boundEnergy: number;
  freeEnergy: number;
  totalEnergyJ: number;
  boundEnergyJ: number;
  energyDriftBeforeCorrection: number;
  energyDriftAfterCorrection: number;
  localEnergyResidual: number;
  globalEnergyCorrection: number;
  linkCount: number;
  massBondCount: number;
  avgDegree: number;
  avgResonance: number;
  avgImpedanceMatch: number;
  avgFlowAbs: number;
  avgDTQ: number;
  maxDTQ: number;
  unreachableRatio: number;
  orderParameter: number;
  entropy: number;
  phaseEntropy: number;
  graphEntropy: number;
  particleCount: number;
  completeParticleCount: number;
  formingParticleCount: number;
  stableParticleCount: number;
  largestParticleSize: number;
  largestParticleScaleFraction: number;
  strongestSolitonScore: number;
  totalMass: number;
  totalMassKg: number;
  eStepNormalized: number;
  tauTQNormalized: number;
  lTQNormalized: number;
  forceMetrics: ForceMetrics;
  forceDecomposition: ForceDecompositionMetrics;
  eventCycleMetrics: EventCycleMetrics;
  pulseGovernorMetrics: PulseGovernorMetrics;
  priorityMetrics: PriorityMetrics;
  coarseFieldMetrics: CoarseFieldMetrics;
  performanceMetrics: PerformanceMetrics;
  /** 화면 전체에 태극자가 얼마나 퍼져 있는지. 1에 가까우면 넓게 분산, 낮아지면 중앙/국소 뭉침. */
  spatialSpreadRatio: number;
  /** 화면 격자 점유율. 초기 균일 로드라면 높고, 뭉침이 진행되면 낮아집니다. */
  fieldOccupancyRatio: number;
  /** 표본 평균 최근접 거리(px). 공진 뭉침이 진행되면 낮아지는 경향. */
  meanNearestNeighborDistance: number;
  /** 뭉침 지수. 0은 넓게 퍼진 상태, 1은 강한 국소 응집 상태. */
  cohesionIndex: number;
  scale: PhysicalScaleInfo;
}

export interface SimulationSnapshot {
  nodes: TaegukjaNode[];
  edges: TaegukjaEdge[];
  particles: ParticleInfo[];
  formationEvents: FormationEvent[];
  particleInteractions: ParticleInteraction[];
  eventPulses: EventPulse[];
  cycleLoops: CycleLoopInfo[];
  priorityCandidates: PriorityCandidate[];
  coarseField: CoarseFieldCell[];
  metrics: SimulationMetrics;
}

export interface PathResult {
  distance: number;
  path: number[];
}


export interface VerificationRunSummary {
  mode: VerificationMode;
  label: string;
  runIndex: number;
  seed: number;
  stableCount: number;
  completeCount: number;
  formingCount: number;
  massBondCount: number;
  largestScaleFraction: number;
  strongestSolitonScore: number;
  avgResonance: number;
  avgImpedanceMatch: number;
  energyDriftAfterCorrection: number;
}

export interface VerificationModeSummary {
  mode: VerificationMode;
  label: string;
  runs: number;
  stableSuccessRate: number;
  completeSuccessRate: number;
  avgStableCount: number;
  avgCompleteCount: number;
  avgMassBondCount: number;
  avgLargestScaleFraction: number;
  avgSolitonScore: number;
  avgEnergyDrift: number;
  interpretation: 'supports-model' | 'weakens-model' | 'inconclusive';
  reason: string;
}

export interface VerificationSuiteResult {
  createdAt: string;
  nodeCount: number;
  stepsPerRun: number;
  runsPerMode: number;
  summaries: VerificationModeSummary[];
  rawRuns: VerificationRunSummary[];
}
