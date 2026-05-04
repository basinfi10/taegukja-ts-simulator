import type {
  EdgeKind,
  EventCycleMetrics,
  EventPulse,
  CycleLoopInfo,
  FormationEvent,
  ForceDecompositionMetrics,
  PathResult,
  ParticleInfo,
  ParticleInteraction,
  ParticleKind,
  PriorityBreakdown,
  PriorityCandidate,
  PriorityMetrics,
  PulseGovernorMetrics,
  CoarseFieldCell,
  CoarseFieldMetrics,
  PerformanceMetrics,
  PhysicalScaleInfo,
  SimulationConfig,
  SimulationMetrics,
  SimulationSnapshot,
  TaegukjaEdge,
  TaegukjaNode
} from './types';
import { PRNG } from './prng';
import { TAU, clamp, clamp01, distance2D, gaussian, impedanceMatch, safeLog, signedAngleDelta, wrapAngle } from './math';

const C_LIGHT = 299_792_458;
const PLANCK_CONSTANT_H = 6.62607015e-34;
const ELECTRON_REST_ENERGY_J = 8.1871057769e-14;
const PROTON_REST_ENERGY_J = 1.50327761598e-10;

/**
 * v8.4 연구용 입자 형성/이벤트 순환/공진 우선순위 탐색 엔진.
 *
 * 핵심 변경:
 * - 화면 노드는 실제 플랑크 크기 태극자 하나가 아니라 coarse-grained 대표 셀입니다.
 * - 기본값: 소립자 유효 반경 1e-19 m, 태극자 길이 1.616255e-35 m.
 * - 실제 태극자 수는 (r_particle / l_TQ)^3 ≈ 2.37e47개입니다.
 * - 대표 셀 1000개가 소립자 1개 스케일입니다. nodeCount 3000은 약 3개 소립자 후보를 연구용으로 담는 상한입니다.
 * - nodeCount는 연구용으로 100~3000개를 권장합니다. 1000개 대표 셀이 소립자 1개 스케일입니다.
 * - 입자 후보는 fragment → forming → stable/complete 단계로 추적되어 단순 깜박임을 줄입니다.
 * - 에너지는 플랑크 에너지를 전부 넣지 않고, 목표 소립자 정지에너지에 맞는 유효 점유율만 사용합니다.
 * - v8은 정상 규칙과 공진 OFF/임피던스 OFF/색 보완성 OFF/에너지 보정 OFF/랜덤 결합 대조군을 비교할 수 있도록 반증 플래그를 포함합니다.
 * - v8.1은 초기 태극자 로드를 중심 뭉침이 아닌 전 화면 균일 랜덤장으로 배치합니다.
 * - v8.2는 뭉침 원인 분해와 중앙 끌림 편향 검사를 추가합니다.
 * - v8.3은 trigger event, pulse, closed cycle, cycle-bond를 추가합니다.
 * - v8.4는 연결 후보마다 공진 우선순위를 계산하고, 시험 pulse 성공률/루프 폐합 가능성/과거 이력을 통해 연결을 선택·강화·약화합니다.
 */
export class TaegukjaEngine {
  private config: SimulationConfig;
  private rng: PRNG;
  private nodes: TaegukjaNode[] = [];
  private edges: TaegukjaEdge[] = [];
  private edgeMap = new Map<string, TaegukjaEdge>();
  private tick = 0;
  private time = 0;
  private initialTotalEnergy = 0;
  private particles: ParticleInfo[] = [];
  private formationEvents: FormationEvent[] = [];
  private particleInteractions: ParticleInteraction[] = [];
  private eventPulses: EventPulse[] = [];
  private cycleLoops: CycleLoopInfo[] = [];
  private priorityCandidates: PriorityCandidate[] = [];
  private coarseField: CoarseFieldCell[] = [];
  private cachedPathStats: { avg: number; max: number; unreachable: number } = { avg: 0, max: 0, unreachable: 0 };
  private cachedCoarseFieldMetrics: CoarseFieldMetrics;
  private priorityRejected = 0;
  private prioritySelected = 0;
  private failedEdgeDecayCount = 0;
  private emittedPulseCount = 0;
  private suppressedPulseCount = 0;
  private lastGovernorScale = 1;
  private lastEmissionBudget = 0;
  private forceDecomposition: ForceDecompositionMetrics = this.emptyForceDecomposition();
  private eventSeq = 0;
  private pulseSeq = 0;
  private loopSeq = 0;
  private previousCycleBondCount = 0;
  private previousStableCount = 0;
  private previousParticleKeys = new Set<string>();
  private particleAges = new Map<string, number>();
  private lastMetrics: SimulationMetrics;

  constructor(config: SimulationConfig) {
    this.config = { ...config };
    this.rng = new PRNG(config.seed);
    this.cachedCoarseFieldMetrics = this.emptyCoarseFieldMetrics();
    this.lastMetrics = this.emptyMetrics();
    this.reset(config);
  }

  reset(config: SimulationConfig): void {
    this.config = { ...config };
    this.rng = new PRNG(config.seed);
    this.nodes = [];
    this.edges = [];
    this.edgeMap.clear();
    this.particles = [];
    this.formationEvents = [];
    this.particleInteractions = [];
    this.eventPulses = [];
    this.cycleLoops = [];
    this.priorityCandidates = [];
    this.coarseField = [];
    this.cachedCoarseFieldMetrics = this.emptyCoarseFieldMetrics();
    this.cachedPathStats = { avg: 0, max: 0, unreachable: 0 };
    this.priorityRejected = 0;
    this.prioritySelected = 0;
    this.failedEdgeDecayCount = 0;
    this.emittedPulseCount = 0;
    this.suppressedPulseCount = 0;
    this.lastGovernorScale = 1;
    this.lastEmissionBudget = 0;
    this.forceDecomposition = this.emptyForceDecomposition();
    this.eventSeq = 0;
    this.pulseSeq = 0;
    this.loopSeq = 0;
    this.previousCycleBondCount = 0;
    this.previousStableCount = 0;
    this.previousParticleKeys.clear();
    this.particleAges.clear();
    this.tick = 0;
    this.time = 0;
    this.createNodes();
    this.createInitialTopology();
    this.createEntangledPairs();
    this.initialTotalEnergy = this.currentTotalEnergy();
    this.refreshDegrees();
    this.detectParticles();
    this.lastMetrics = this.computeMetrics(0, 0, 0, 0);
  }

  updateConfig(partial: Partial<SimulationConfig>): void {
    this.config = { ...this.config, ...partial };
    this.updatePhysicalFields();
  }

  getConfig(): SimulationConfig { return { ...this.config }; }

  getSnapshot(): SimulationSnapshot {
    return {
      nodes: this.nodes.map((n) => ({ ...n })),
      edges: this.edges.map((e) => ({ ...e })),
      particles: this.particles.map((p) => ({ ...p, nodeIds: [...p.nodeIds] })),
      formationEvents: this.formationEvents.map((e) => ({ ...e })),
      particleInteractions: this.particleInteractions.map((i) => ({ ...i })),
      eventPulses: this.eventPulses.map((p) => ({ ...p })),
      cycleLoops: this.cycleLoops.map((l) => ({ ...l, nodeIds: [...l.nodeIds], edgeIds: [...l.edgeIds] })),
      priorityCandidates: this.priorityCandidates.map((c) => ({ ...c, breakdown: { ...c.breakdown } })),
      coarseField: this.coarseField.map((c) => ({ ...c })),
      metrics: { ...this.lastMetrics, forceMetrics: { ...this.lastMetrics.forceMetrics }, forceDecomposition: { ...this.lastMetrics.forceDecomposition }, eventCycleMetrics: { ...this.lastMetrics.eventCycleMetrics }, pulseGovernorMetrics: { ...this.lastMetrics.pulseGovernorMetrics }, priorityMetrics: { ...this.lastMetrics.priorityMetrics }, coarseFieldMetrics: { ...this.lastMetrics.coarseFieldMetrics }, performanceMetrics: { ...this.lastMetrics.performanceMetrics }, scale: { ...this.lastMetrics.scale } }
    };
  }

  createEntanglement(a: number, b: number): boolean {
    if (a === b || !this.nodes[a] || !this.nodes[b]) return false;
    const existing = this.edgeMap.get(this.edgeKey(a, b));
    if (existing) {
      existing.kind = 'entangled';
      existing.weight = Math.max(existing.weight, 0.98);
      existing.binding = Math.max(existing.binding, 0.62);
      return true;
    }
    this.addEdge(a, b, 'entangled', 0.98);
    return true;
  }

  step(rawDt: number): void {
    const dt = clamp(rawDt, 0.001, 0.05) * this.config.timeScale;
    const scaledDt = dt * this.ctSimulationFactor();
    const n = this.nodes.length;
    const phaseDelta = Array(n).fill(0);
    const forceX = Array(n).fill(0);
    const forceY = Array(n).fill(0);
    const energyDelta = Array(n).fill(0);
    const boundDelta = Array(n).fill(0);
    const weakFlipPressure = Array(n).fill(0);

    this.forceDecomposition = this.emptyForceDecomposition();
    this.priorityCandidates = [];
    this.priorityRejected = 0;
    this.prioritySelected = 0;
    this.failedEdgeDecayCount = 0;
    this.emittedPulseCount = 0;
    this.suppressedPulseCount = 0;
    this.lastGovernorScale = 1;
    this.lastEmissionBudget = 0;
    for (const node of this.nodes) this.clearForceAccumulators(node);
    this.refreshEdgePhysics();
    this.processEventCirculation(phaseDelta, energyDelta, boundDelta, scaledDt);

    let newlyBound = 0;

    for (const edge of this.edges) {
      const a = this.nodes[edge.a];
      const b = this.nodes[edge.b];
      const dTheta = signedAngleDelta(a.phase, b.phase);
      const phaseDrive = Math.sin(dTheta);
      const coupling = this.config.resonanceCoupling * edge.weight * edge.resonance * edge.impedanceMatch;
      phaseDelta[a.id] += coupling * phaseDrive;
      phaseDelta[b.id] -= coupling * phaseDrive;
      this.forceDecomposition.resonanceAttraction += Math.abs(this.config.resonanceCoupling * edge.weight * edge.resonance * phaseDrive) * scaledDt;

      const potentialA = a.energy / Math.max(a.impedance, 1e-6);
      const potentialB = b.energy / Math.max(b.impedance, 1e-6);
      const signedFlow = this.config.impedanceCoupling * edge.weight * edge.impedanceMatch * (0.5 * (potentialA - potentialB) + 0.5 * phaseDrive * edge.resonance);
      const flow = clamp(signedFlow * scaledDt, -0.075 * b.energy, 0.075 * a.energy);
      this.forceDecomposition.impedanceAlignment += Math.abs(this.config.impedanceCoupling * edge.weight * edge.impedanceMatch * (potentialA - potentialB)) * scaledDt;
      energyDelta[a.id] -= flow;
      energyDelta[b.id] += flow;
      edge.flow = flow;

      const bindingDrive = this.bindingDrive(a, b, edge);
      const bindingDelta = this.config.massBindingRate * bindingDrive * scaledDt;
      if (bindingDelta > 0) this.forceDecomposition.massBondCohesion += bindingDelta;
      edge.binding = clamp01(edge.binding + bindingDelta - this.config.entropyLoosening * 0.0035 * scaledDt);
      if (edge.binding > this.config.particleThreshold && edge.kind !== 'entangled' && edge.kind !== 'cycle-bond') edge.kind = 'mass-bond';

      if (edge.kind === 'mass-bond' || edge.kind === 'cycle-bond') {
        const convert = clamp(edge.binding * 0.0035 * scaledDt, 0, 0.012 * Math.min(a.energy, b.energy));
        if (a.energy > convert && b.energy > convert) {
          energyDelta[a.id] -= convert;
          energyDelta[b.id] -= convert;
          boundDelta[a.id] += convert;
          boundDelta[b.id] += convert;
          newlyBound += convert * 2;
        }
      }

      const f = this.edgeMechanicalForce(a, b, edge);
      forceX[a.id] += f.fx; forceY[a.id] += f.fy;
      forceX[b.id] -= f.fx; forceY[b.id] -= f.fy;

      weakFlipPressure[a.id] += edge.weak * (b.sigma === a.sigma ? 0.4 : 1.0) * (1 - edge.resonance);
      weakFlipPressure[b.id] += edge.weak * (b.sigma === a.sigma ? 0.4 : 1.0) * (1 - edge.resonance);
    }

    this.applyParticleForceFields(forceX, forceY, energyDelta, scaledDt);
    this.particleInteractions = [];
    this.applyParticlePairInteractions(forceX, forceY, energyDelta, scaledDt);
    this.applyWeakTransitions(weakFlipPressure, scaledDt);

    const centerX = this.config.width / 2;
    const centerY = this.config.height / 2;

    for (const node of this.nodes) {
      node.phase = wrapAngle(node.phase + (node.sigma * node.omega + phaseDelta[node.id]) * scaledDt);
      node.energy = Math.max(1e-6, node.energy + energyDelta[node.id] - boundDelta[node.id]);
      node.boundEnergy = Math.max(0, node.boundEnergy + boundDelta[node.id]);
      node.massLike = this.massFromEnergy(node.energy, node.boundEnergy);
      this.forceDecomposition.randomMotion += Math.hypot(node.vx, node.vy) * 0.0005;

      const dx = node.x - centerX;
      const dy = node.y - centerY;
      const radiusFromCenter = Math.hypot(dx, dy) || 1;
      const towardCenterProjection = (forceX[node.id] * -dx + forceY[node.id] * -dy) / radiusFromCenter;
      if (towardCenterProjection > 0) this.forceDecomposition.centerBias += towardCenterProjection * scaledDt;

      const outward = this.config.blockCenterPull ? this.config.entropyLoosening * 0.00009 : this.config.entropyLoosening * 0.00009;
      // v8.2: 명시적 중심 끌림은 사용하지 않습니다. outward는 중앙 뭉침을 막는 약한 확산항입니다.
      forceX[node.id] += dx * outward;
      forceY[node.id] += dy * outward;
      node.vx += forceX[node.id] * scaledDt;
      node.vy += forceY[node.id] * scaledDt;
      const beforeDamping = Math.hypot(node.vx, node.vy);
      const damping = this.config.disableDamping ? 1 : 0.990;
      if (this.forceAllowed('damping')) {
        node.vx *= damping;
        node.vy *= damping;
      }
      this.forceDecomposition.dampingLoss += Math.max(0, beforeDamping - Math.hypot(node.vx, node.vy));
      node.x = clamp(node.x + node.vx * scaledDt * 60, 20, this.config.width - 20);
      node.y = clamp(node.y + node.vy * scaledDt * 60, 20, this.config.height - 20);
      if (node.x <= 20 || node.x >= this.config.width - 20) { this.forceDecomposition.boundaryEffect += Math.abs(node.vx); node.vx *= -0.55; }
      if (node.y <= 20 || node.y >= this.config.height - 20) { this.forceDecomposition.boundaryEffect += Math.abs(node.vy); node.vy *= -0.55; }
    }

    const driftBefore = this.currentTotalEnergy() - this.initialTotalEnergy;
    const globalCorrection = this.correctEnergyConservation();
    this.adaptEdges(scaledDt);
    this.formNewLinks();
    this.refreshDegrees();
    if (!this.config.performanceMode || this.tick % Math.max(1, this.config.particleDetectionInterval) === 0) {
      this.detectParticles();
    }
    this.updatePhysicalFields();

    this.tick += 1;
    this.time += scaledDt;
    const driftAfter = this.currentTotalEnergy() - this.initialTotalEnergy;
    this.lastMetrics = this.computeMetrics(driftBefore, driftAfter, newlyBound, globalCorrection);
  }

  shortestPath(a: number, b: number): PathResult {
    if (a === b) return { distance: 0, path: [a] };
    if (!this.nodes[a] || !this.nodes[b]) return { distance: Infinity, path: [] };
    const adjacency = this.buildAdjacency();
    const queue = [a];
    const visited = new Set<number>([a]);
    const parent = new Map<number, number>();
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      for (const next of adjacency[current]) {
        if (visited.has(next)) continue;
        visited.add(next);
        parent.set(next, current);
        if (next === b) {
          const path = [b];
          let p = b;
          while (parent.has(p)) { p = parent.get(p)!; path.push(p); }
          path.reverse();
          return { distance: path.length - 1, path };
        }
        queue.push(next);
      }
    }
    return { distance: Infinity, path: [] };
  }

  private createNodes(): void {
    const n = this.config.nodeCount;
    const scale = this.physicalScale();
    const lTQ = this.normalizedLTQ(Math.max(this.config.ctRatio, 1));
    const positions = this.createInitialPositions(n);
    const velocityScale = Math.max(0, this.config.initialVelocityScale);

    for (let i = 0; i < n; i += 1) {
      const sigma = this.rng.chance(0.5) ? 1 : -1;
      const color = this.rng.int(0, 2) as 0 | 1 | 2;
      const chargeOptions = sigma > 0 ? [-1, -1 / 3, 2 / 3] : [1, 1 / 3, -2 / 3];
      const energy = this.config.energyPerNode * this.rng.range(0.94, 1.06);
      this.nodes.push({
        id: i,
        x: positions[i].x,
        y: positions[i].y,
        vx: this.rng.range(-velocityScale, velocityScale),
        vy: this.rng.range(-velocityScale, velocityScale),
        phase: this.rng.range(0, TAU),
        omega: this.rng.range(0.60, 1.80) * (1 + Math.log10(Math.max(this.config.ctRatio, 1)) / 12),
        sigma,
        impedance: Math.exp(this.rng.range(-this.config.impedanceSpread, this.config.impedanceSpread)),
        energy,
        boundEnergy: 0,
        massLike: this.massFromEnergy(energy, 0),
        physicalEnergyJ: energy * scale.energyUnitJ,
        representedTaegeukjaCount: scale.realTaegeukjaPerVisibleNode,
        charge: this.rng.pick(chargeOptions),
        color,
        weakState: this.rng.pick([-1, 0, 1]),
        loopRadius: lTQ * this.rng.range(0.75, 1.25),
        degree: 0,
        clusterId: -1,
        isParticleCore: false,
        forceStrongX: 0, forceStrongY: 0, forceEmX: 0, forceEmY: 0, forceWeakX: 0, forceWeakY: 0, forceGravityX: 0, forceGravityY: 0,
        eventClock: this.rng.range(0, TAU),
        triggerPotential: this.rng.range(0.18, 0.42),
        eventActivity: this.rng.range(0.18, 0.55),
        eventContinuity: this.rng.range(0.08, 0.25),
        cycleMemory: 0,
        lastTriggerTick: -999999
      });
    }
  }

  private createInitialPositions(n: number): { x: number; y: number }[] {
    const margin = clamp(this.config.initialFieldMargin, 8, Math.min(this.config.width, this.config.height) * 0.28);
    const width = Math.max(1, this.config.width - margin * 2);
    const height = Math.max(1, this.config.height - margin * 2);
    const mode = this.config.initialDistribution;

    if (mode === 'center-cloud') {
      const centerX = this.config.width / 2;
      const centerY = this.config.height / 2;
      const spread = Math.min(this.config.width, this.config.height) * 0.34;
      return Array.from({ length: n }, () => {
        const angle = this.rng.range(0, TAU);
        const radius = spread * Math.sqrt(this.rng.next());
        return {
          x: clamp(centerX + Math.cos(angle) * radius + this.rng.range(-16, 16), margin, this.config.width - margin),
          y: clamp(centerY + Math.sin(angle) * radius + this.rng.range(-16, 16), margin, this.config.height - margin)
        };
      });
    }

    if (mode === 'ring-shell') {
      const centerX = this.config.width / 2;
      const centerY = this.config.height / 2;
      const rx = width * 0.46;
      const ry = height * 0.46;
      return Array.from({ length: n }, (_, i) => {
        const angle = (i / Math.max(1, n)) * TAU + this.rng.range(-0.035, 0.035);
        const shell = this.rng.range(0.72, 1.0);
        return {
          x: clamp(centerX + Math.cos(angle) * rx * shell + this.rng.range(-10, 10), margin, this.config.width - margin),
          y: clamp(centerY + Math.sin(angle) * ry * shell + this.rng.range(-10, 10), margin, this.config.height - margin)
        };
      });
    }

    // v8.1 핵심: 1000개든 3000개든 시작 상태가 이미 한 덩어리가 되지 않도록
    // 전 화면을 격자 셀로 나누고, 각 셀 안에서 난수 흔들림을 준 균일 랜덤장으로 로드합니다.
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * (width / Math.max(1, height)))));
    const rows = Math.max(1, Math.ceil(n / cols));
    const cellW = width / cols;
    const cellH = height / rows;
    const jitter = clamp01(mode === 'grid-jitter' ? this.config.initialJitter * 0.50 : this.config.initialJitter);
    const cells = Array.from({ length: rows * cols }, (_, i) => i);

    // 셀 순서를 seed 기반으로 섞어서 색/ID 순서가 화면상 줄무늬가 되지 않게 합니다.
    for (let i = cells.length - 1; i > 0; i -= 1) {
      const j = this.rng.int(0, i);
      const t = cells[i];
      cells[i] = cells[j];
      cells[j] = t;
    }

    return Array.from({ length: n }, (_, i) => {
      const cell = cells[i % cells.length];
      const c = cell % cols;
      const r = Math.floor(cell / cols);
      const jx = this.rng.range(-0.5, 0.5) * cellW * jitter;
      const jy = this.rng.range(-0.5, 0.5) * cellH * jitter;
      return {
        x: clamp(margin + (c + 0.5) * cellW + jx, margin, this.config.width - margin),
        y: clamp(margin + (r + 0.5) * cellH + jy, margin, this.config.height - margin)
      };
    });
  }

  private createInitialTopology(): void {
    const n = this.nodes.length;
    if (n < 2) return;
    if (this.config.topology === 'spatial-local') {
      this.createSpatialLocalTopology();
      return;
    }
    if (this.config.topology === 'ring' || this.config.topology === 'small-world') {
      for (let i = 0; i < n; i += 1) {
        this.addEdge(i, (i + 1) % n, 'local', 0.56);
        if (this.config.averageDegree >= 4) this.addEdge(i, (i + 2) % n, 'local', 0.35);
        if (this.config.averageDegree >= 6) this.addEdge(i, (i + 3) % n, 'local', 0.25);
      }
      if (this.config.topology === 'small-world') {
        const shortcuts = Math.floor(n * Math.max(1, this.config.averageDegree - 2) * 0.32);
        for (let k = 0; k < shortcuts; k += 1) this.addRandomEdge('resonance', 0.42);
      }
      return;
    }
    if (this.config.topology === 'grid') {
      const cols = Math.ceil(Math.sqrt(n));
      for (let i = 0; i < n; i += 1) {
        const right = i + 1;
        const down = i + cols;
        if (right < n && Math.floor(right / cols) === Math.floor(i / cols)) this.addEdge(i, right, 'local', 0.55);
        if (down < n) this.addEdge(i, down, 'local', 0.55);
      }
      return;
    }
    const target = Math.floor(n * this.config.averageDegree * 0.5);
    let guard = target * 20;
    while (this.edges.length < target && guard-- > 0) this.addRandomEdge('resonance', this.rng.range(0.25, 0.66));
  }

  private createSpatialLocalTopology(): void {
    const n = this.nodes.length;
    const targetDegree = Math.max(1, Math.floor(this.config.averageDegree));
    const radius = Math.max(24, this.config.initialLocalRadius);
    const buckets = this.buildSpatialBuckets(radius);
    const degree = Array.from({ length: n }, () => 0);

    for (let i = 0; i < n; i += 1) {
      const candidates = this.nearbyCandidates(i, radius, buckets)
        .filter((j) => j !== i)
        .map((j) => {
          const a = this.nodes[i];
          const b = this.nodes[j];
          const d = distance2D(a.x, a.y, b.x, b.y);
          const priority = this.computeResonancePriority(i, j, radius * 1.55);
          return { j, d, score: this.config.enableResonancePrioritySearch ? priority.total : clamp01(1 - d / Math.max(1, radius * 1.55)), priority };
        })
        .filter((c) => c.d <= radius * 1.55)
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(targetDegree * 3, 10));

      for (const c of candidates) {
        if (degree[i] >= targetDegree) break;
        if (degree[c.j] >= targetDegree + 2 && !this.rng.chance(0.12)) continue;
        const dNorm = clamp01(1 - c.d / Math.max(1, radius * 1.55));
        const weight = this.config.enableResonancePrioritySearch ? clamp01(0.18 + c.priority.total * 0.62) : 0.22 + dNorm * 0.36;
        if (this.addEdge(i, c.j, 'local', weight)) {
          const edge = this.edgeMap.get(this.edgeKey(i, c.j));
          if (edge) this.applyPriorityToEdge(edge, c.priority);
          degree[i] += 1;
          degree[c.j] += 1;
        }
      }
    }

    // 매우 드문 빈 영역은 약한 랜덤 근접 연결로 보완합니다. 이것도 공간 근접 후보를 먼저 찾습니다.
    const targetEdges = Math.floor(n * targetDegree * 0.5);
    let guard = n * 18;
    while (this.edges.length < targetEdges && this.edges.length < this.config.maxLinks && guard-- > 0) {
      const a = this.rng.int(0, n - 1);
      const b = this.pickNearbyNodeIndex(a, radius * 1.9);
      if (a !== b) this.addEdge(a, b, 'local', this.rng.range(0.18, 0.42));
    }
  }

  private buildSpatialBuckets(cellSize: number): Map<string, number[]> {
    const buckets = new Map<string, number[]>();
    for (const node of this.nodes) {
      const cx = Math.floor(node.x / cellSize);
      const cy = Math.floor(node.y / cellSize);
      const key = `${cx}:${cy}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(node.id);
      else buckets.set(key, [node.id]);
    }
    return buckets;
  }

  private nearbyCandidates(id: number, radius: number, buckets: Map<string, number[]>): number[] {
    const node = this.nodes[id];
    const cx = Math.floor(node.x / radius);
    const cy = Math.floor(node.y / radius);
    const out: number[] = [];
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        const bucket = buckets.get(`${cx + dx}:${cy + dy}`);
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }

  private pickNearbyNodeIndex(a: number, radius: number): number {
    const na = this.nodes[a];
    let best = -1;
    let bestScore = Infinity;
    const trials = this.nodes.length > 2200 ? 18 : 26;
    for (let i = 0; i < trials; i += 1) {
      const b = this.rng.int(0, this.nodes.length - 1);
      if (a === b || this.edgeMap.has(this.edgeKey(a, b))) continue;
      const nb = this.nodes[b];
      const d = distance2D(na.x, na.y, nb.x, nb.y);
      const priority = this.computeResonancePriority(a, b, radius);
      const score = this.config.enableResonancePrioritySearch
        ? -priority.total * this.rng.range(0.96, 1.04)
        : d * this.rng.range(0.90, 1.10);
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best >= 0 ? best : (a + 1 + this.rng.int(0, this.nodes.length - 2)) % this.nodes.length;
  }


  private computeResonancePriority(aId: number, bId: number, radius: number): PriorityBreakdown {
    const a = this.nodes[aId];
    const b = this.nodes[bId];
    const d = distance2D(a.x, a.y, b.x, b.y);
    const proximity = Math.exp(-d / Math.max(12, radius));
    const delay = clamp(d / Math.max(12, this.config.initialLocalRadius), 0.15, 4.8);

    // 전달 지연을 포함한 위상 정합. 이 값이 높을수록 test pulse가 상대 노드의 변화 시계와 잘 물립니다.
    const phase = this.config.disableResonanceTerm
      ? 0.08
      : clamp01((1 + Math.cos(signedAngleDelta(a.eventClock + delay, b.eventClock))) / 2);

    // 단순 ω 차이뿐 아니라 1:1, 1:2, 2:1, 2:3, 3:2 정수비 공진 후보도 평가합니다.
    const ratios: Array<[number, number]> = [[1, 1], [1, 2], [2, 1], [2, 3], [3, 2], [1, 3], [3, 1]];
    let frequency = 0;
    for (const [m, n] of ratios) {
      const mismatch = Math.abs(m * a.omega - n * b.omega) / Math.max(1e-6, m * a.omega + n * b.omega);
      frequency = Math.max(frequency, Math.exp(-mismatch / 0.085));
    }

    const impedance = this.config.disableImpedanceTerm ? 0.28 : impedanceMatch(a.impedance, b.impedance);
    const potentialA = a.energy / Math.max(1e-6, a.impedance);
    const potentialB = b.energy / Math.max(1e-6, b.impedance);
    const energyFlow = Math.exp(-Math.abs(potentialA - potentialB) / Math.max(0.35, this.config.energyPerNode * 0.85));

    const eventContinuity = clamp01(Math.sqrt(Math.max(0, a.eventActivity * b.eventActivity)) * 0.55 + Math.sqrt(Math.max(0, a.eventContinuity * b.eventContinuity)) * 0.45);

    const existing = this.edgeMap.get(this.edgeKey(aId, bId));
    const history = existing ? clamp01(existing.historySuccess * 0.72 + existing.eventContinuity * 0.18 + existing.circulationScore * 0.10) : this.estimateNeighborHistory(aId, bId);
    const loopPotential = this.estimateLoopClosurePotential(aId, bId);

    const total = clamp01(
      0.16 * proximity +
      0.15 * phase +
      0.13 * frequency +
      0.15 * impedance +
      0.11 * energyFlow +
      0.10 * eventContinuity +
      this.config.priorityHistoryWeight * history +
      this.config.priorityLoopWeight * loopPotential
    );

    return { proximity, phase, frequency, impedance, energyFlow, eventContinuity, history, loopPotential, total };
  }

  private estimateNeighborHistory(aId: number, bId: number): number {
    let sum = 0;
    let count = 0;
    const a = this.nodes[aId];
    const b = this.nodes[bId];
    for (const e of this.edges) {
      if (e.a === aId || e.b === aId || e.a === bId || e.b === bId) {
        sum += e.historySuccess * 0.55 + e.eventContinuity * 0.25 + e.circulationScore * 0.20;
        count += 1;
      }
      if (count > 22) break;
    }
    const nodeMemory = Math.sqrt(Math.max(0, a.cycleMemory * b.cycleMemory));
    return clamp01((count ? sum / count : 0) * 0.70 + nodeMemory * 0.30);
  }

  private estimateLoopClosurePotential(aId: number, bId: number): number {
    // 후보 edge a-b가 추가되면 a-x-b 삼각 순환을 닫을 가능성이 있는지 봅니다.
    let best = 0;
    let checks = 0;
    for (const e of this.edges) {
      let x = -1;
      if (e.a === aId) x = e.b;
      else if (e.b === aId) x = e.a;
      else continue;
      const xb = this.edgeMap.get(this.edgeKey(x, bId));
      if (!xb) continue;
      const phase = Math.abs(this.loopPhaseClosureErrorForCandidate(aId, bId, x));
      const closure = Math.exp(-phase / Math.max(0.05, this.config.loopClosureTolerance));
      const continuity = clamp01((e.eventContinuity + xb.eventContinuity + e.circulationScore + xb.circulationScore) / 4);
      const impedanceLoss = this.loopImpedanceLoss([aId, x, bId]);
      const impedanceScore = Math.exp(-impedanceLoss / Math.max(0.05, this.config.impedanceSpread * 2));
      best = Math.max(best, clamp01(0.45 * closure + 0.35 * continuity + 0.20 * impedanceScore));
      checks += 1;
      if (checks > 24) break;
    }
    return best;
  }

  private loopPhaseClosureErrorForCandidate(aId: number, bId: number, xId: number): number {
    const ax = this.edgeMap.get(this.edgeKey(aId, xId));
    const xb = this.edgeMap.get(this.edgeKey(xId, bId));
    const a = this.nodes[aId];
    const b = this.nodes[bId];
    const candidateDelay = clamp(distance2D(a.x, a.y, b.x, b.y) / Math.max(12, this.config.initialLocalRadius), 0.15, 4.8);
    const phase = (ax?.pulsePhase ?? 0) + (ax?.triggerDelay ?? 0) + (xb?.pulsePhase ?? 0) + (xb?.triggerDelay ?? 0) + candidateDelay;
    const nearest = Math.round(phase / TAU) * TAU;
    return Math.abs(phase - nearest);
  }

  private applyPriorityToEdge(edge: TaegukjaEdge, priority: PriorityBreakdown): void {
    edge.priorityScore = priority.total;
    edge.priorityProximity = priority.proximity;
    edge.priorityPhase = priority.phase;
    edge.priorityFrequency = priority.frequency;
    edge.priorityImpedance = priority.impedance;
    edge.priorityEnergyFlow = priority.energyFlow;
    edge.priorityEventContinuity = priority.eventContinuity;
    edge.priorityHistory = priority.history;
    edge.priorityLoopPotential = priority.loopPotential;
    edge.loopClosurePotential = Math.max(edge.loopClosurePotential, priority.loopPotential);
    edge.lastPriorityTick = this.tick;
  }

  private recordPriorityCandidate(a: number, b: number, breakdown: PriorityBreakdown, selected: boolean, reason: string): void {
    if (!this.config.showPriorityCandidates) return;
    if (this.priorityCandidates.length >= 80 && !selected) return;
    const na = this.nodes[a];
    const nb = this.nodes[b];
    this.priorityCandidates.push({
      id: `${this.tick}:${a}:${b}:${this.priorityCandidates.length}`,
      a,
      b,
      ax: na.x,
      ay: na.y,
      bx: nb.x,
      by: nb.y,
      selected,
      reason: selected ? `${reason} · 선택` : `${reason} · 보류`,
      breakdown
    });
    this.priorityCandidates.sort((x, y) => y.breakdown.total - x.breakdown.total);
    this.priorityCandidates = this.priorityCandidates.slice(0, 80);
  }

  private createEntangledPairs(): void {
    for (let i = 0; i < this.config.entangledPairs; i += 1) this.addRandomEdge('entangled', 0.98);
  }

  private addRandomEdge(kind: EdgeKind, weight: number): void {
    const a = this.rng.int(0, this.nodes.length - 1);
    let b = this.config.topology === 'spatial-local'
      ? this.pickNearbyNodeIndex(a, Math.max(30, this.config.initialLocalRadius * 2.2))
      : this.rng.int(0, this.nodes.length - 1);
    if (a === b) b = (b + 1) % this.nodes.length;
    this.addEdge(a, b, kind, weight);
  }

  private addEdge(a: number, b: number, kind: EdgeKind, weight: number): boolean {
    if (a === b) return false;
    if (this.edges.length >= this.config.maxLinks) return false;
    const key = this.edgeKey(a, b);
    if (this.edgeMap.has(key)) return false;
    const na = this.nodes[a];
    const nb = this.nodes[b];
    const restLength = clamp(distance2D(na.x, na.y, nb.x, nb.y), 20, Math.max(this.config.width, this.config.height) * 0.65);
    const edge: TaegukjaEdge = {
      id: key,
      a: Math.min(a, b),
      b: Math.max(a, b),
      kind,
      weight: clamp01(weight),
      resonance: 0,
      impedanceMatch: 0,
      flow: 0,
      restLength,
      age: 0,
      binding: kind === 'mass-bond' ? 0.82 : kind === 'entangled' ? 0.52 : 0,
      strong: 0,
      em: 0,
      weak: 0,
      gravity: 0,
      triggerDelay: clamp(restLength / Math.max(12, this.config.initialLocalRadius), 0.15, 4.8),
      pulsePhase: this.rng.range(0, TAU),
      pulseStrength: 0,
      lastPulseTick: -999999,
      eventContinuity: 0,
      circulationScore: 0,
      priorityScore: 0,
      priorityProximity: 0,
      priorityPhase: 0,
      priorityFrequency: 0,
      priorityImpedance: 0,
      priorityEnergyFlow: 0,
      priorityEventContinuity: 0,
      priorityHistory: 0,
      priorityLoopPotential: 0,
      pulseSuccess: 0,
      pulseFail: 0,
      historySuccess: 0,
      loopClosurePotential: 0,
      lastPriorityTick: this.tick
    };
    this.edgeMap.set(key, edge);
    this.edges.push(edge);
    return true;
  }

  private refreshEdgePhysics(): void {
    for (const edge of this.edges) {
      const a = this.nodes[edge.a];
      const b = this.nodes[edge.b];
      const dTheta = Math.abs(signedAngleDelta(a.phase, b.phase));
      const phaseAlignment = (1 + Math.cos(dTheta)) / 2;
      const freqMatch = gaussian(a.omega - b.omega, 0.45 + 0.05 * Math.log10(Math.max(this.config.ctRatio, 1)));
      const dualityTerm = a.sigma === b.sigma ? 0.82 : 1.06;
      const colorTerm = this.config.disableColorTerm ? 1.0 : (this.colorComplement(a.color, b.color) ? 1.12 : 0.78);
      if (this.config.enableResonancePrioritySearch && (this.tick % 5 === 0 || edge.age < 3 || this.tick - edge.lastPriorityTick > 18)) {
        const priority = this.computeResonancePriority(edge.a, edge.b, Math.max(36, this.config.initialLocalRadius * 2.0));
        this.applyPriorityToEdge(edge, priority);
      }
      edge.resonance = this.config.disableResonanceTerm ? 0.08 : clamp01((phaseAlignment * freqMatch * dualityTerm * colorTerm) * (0.72 + 0.28 * Math.max(edge.priorityScore, 0.05)));
      edge.impedanceMatch = this.config.disableImpedanceTerm ? 0.28 : impedanceMatch(a.impedance, b.impedance);
      const dist = distance2D(a.x, a.y, b.x, b.y);
      const shortRange = Math.exp(-dist / 82);
      const chargeProduct = a.charge * b.charge;
      edge.strong = this.config.strongScale * shortRange * edge.resonance * colorTerm * (0.25 + edge.binding + edge.circulationScore * 0.55);
      edge.em = this.config.electromagneticScale * chargeProduct / Math.max(25, dist * dist / 240);
      edge.weak = this.config.weakScale * (1 - edge.resonance) * (a.weakState !== b.weakState ? 1 : 0.35) * Math.exp(-dist / 120);
      edge.gravity = this.config.gravityScale * (a.massLike * b.massLike) / Math.max(90, dist * dist / 120);
      edge.circulationScore = clamp01(edge.circulationScore - this.config.continuityDecay * 0.018);
      if (edge.kind === 'cycle-bond' && edge.circulationScore < this.config.cycleBondThreshold * 0.30 && edge.binding < this.config.particleThreshold) edge.kind = 'mass-bond';
      edge.age += 1;
    }
  }

  private bindingDrive(a: TaegukjaNode, b: TaegukjaNode, edge: TaegukjaEdge): number {
    if (this.config.randomBondModel) {
      // v8 대조군: 공진/임피던스/색 보완성을 쓰지 않고, 낮은 확률의 무작위 결합 압력만 부여합니다.
      // 정상 규칙과 비슷하게 stable/complete가 자주 나오면 모델이 과도하게 결합을 유도한다는 경고입니다.
      return this.rng.chance(0.018) ? this.rng.range(0.08, 0.28) : this.rng.range(-0.36, -0.08);
    }
    const energyDensity = clamp01((a.energy + b.energy) / (2 * this.config.energyPerNode * 1.65));
    const colorClosure = this.config.disableColorTerm ? 0.72 : (this.colorComplement(a.color, b.color) ? 1 : 0.55);
    const antiPairTension = a.sigma !== b.sigma ? 1.08 : 0.74;
    const chargeBalance = 1 - clamp01(Math.abs(a.charge + b.charge) / 2);
    const scalePressure = this.nodes.length >= 800 ? 1.04 : 0.88;
    return scalePressure * edge.resonance * edge.impedanceMatch * energyDensity * colorClosure * antiPairTension * (0.56 + 0.44 * chargeBalance) - 0.30;
  }


  private processEventCirculation(phaseDelta: number[], energyDelta: number[], boundDelta: number[], scaledDt: number): void {
    if (!this.config.enableEventCirculation) {
      this.eventPulses = [];
      this.cycleLoops = [];
      return;
    }

    // 노드의 에너지는 "정적 값"이 아니라 연속 변화 이벤트가 유지될 때 의미를 갖습니다.
    for (const node of this.nodes) {
      node.eventClock = wrapAngle(node.eventClock + (node.sigma * node.omega + node.triggerPotential * 0.08) * scaledDt);
      node.eventActivity = clamp01(node.eventActivity * Math.pow(this.config.activityDecay, scaledDt * 60) + node.triggerPotential * 0.008);
      node.eventContinuity = clamp01(node.eventContinuity * (1 - this.config.continuityDecay * 0.35 * scaledDt));
      node.cycleMemory = clamp01(node.cycleMemory * (1 - this.config.continuityDecay * 0.18 * scaledDt));
      node.triggerPotential *= Math.pow(0.93, scaledDt * 60);

      // 변화가 너무 끊기면 에너지 활동성이 무화됩니다. 에너지값은 보존하되 "활동성"은 사라집니다.
      if (node.eventActivity < 0.002 && node.triggerPotential < 0.002) node.eventActivity *= 0.96;
    }

    const targetPulseCount = Math.max(12, Math.min(this.config.maxVisiblePulses, Math.floor(this.edges.length * this.config.targetPulseDensity)));
    const currentPulseCount = this.eventPulses.length;
    const densityRatio = currentPulseCount / Math.max(1, targetPulseCount);
    const governorScale = this.config.enablePulseGovernor
      ? clamp(1 - Math.max(0, densityRatio - 1) * this.config.pulseThrottleStrength, 0.12, 1.35)
      : 1;
    const lowDensityBoost = this.config.enablePulseGovernor && densityRatio < 0.42 ? 1.0 + (0.42 - densityRatio) * 0.75 : 1.0;
    const maxPulses = Math.max(30, this.config.maxVisiblePulses);
    const emissionBudget = this.config.enablePulseGovernor
      ? Math.max(1, Math.min(this.config.pulseEmissionBudgetPerStep, Math.ceil((targetPulseCount - currentPulseCount) * 0.28 + this.config.pulseEmissionBudgetPerStep * governorScale)))
      : this.config.pulseEmissionBudgetPerStep;
    this.lastGovernorScale = governorScale;
    this.lastEmissionBudget = emissionBudget;

    const newPulses: EventPulse[] = [];
    let emitted = 0;

    for (const edge of this.edges) {
      const a = this.nodes[edge.a];
      const b = this.nodes[edge.b];
      const eventPhaseError = this.eventPhaseError(a, b, edge);
      const closureGate = Math.exp(-Math.abs(eventPhaseError) / Math.max(0.08, this.config.loopClosureTolerance));
      const activity = 0.5 * (a.eventActivity + b.eventActivity) + 0.16 * edge.pulseStrength;
      const priorityGate = this.config.enableResonancePrioritySearch ? Math.max(edge.priorityScore, 0.05) : 0.35;
      const testPulseDrive = this.config.enableResonancePrioritySearch
        ? this.config.testPulseStrength * priorityGate * (0.34 + edge.priorityLoopPotential * 0.38 + edge.historySuccess * 0.28) * (0.45 + activity)
        : 0;
      const drive = (this.config.eventCouplingStrength * edge.resonance * edge.impedanceMatch * (0.35 + edge.binding + edge.circulationScore * 0.65) * (0.35 + activity) * closureGate + testPulseDrive) * governorScale * lowDensityBoost;

      edge.pulsePhase = wrapAngle(edge.pulsePhase + 0.5 * (a.omega * a.sigma + b.omega * b.sigma) * scaledDt);
      edge.pulseStrength *= Math.pow(this.config.eventPulseDecay, scaledDt * 60);

      const adaptiveThreshold = this.config.eventTriggerThreshold * (this.config.enablePulseGovernor ? clamp(0.72 + densityRatio * 0.34, 0.55, 1.35) : 1);
      if (drive > adaptiveThreshold || (edge.pulseStrength > adaptiveThreshold * 0.82 && drive > adaptiveThreshold * 0.45)) {
        const forward = Math.sin(a.eventClock + edge.triggerDelay - b.eventClock) >= 0;
        const src = forward ? a : b;
        const dst = forward ? b : a;
        const intensity = clamp01((drive - adaptiveThreshold * 0.45) * 0.78);

        dst.triggerPotential = clamp01(dst.triggerPotential + intensity * 0.26);
        dst.eventActivity = clamp01(dst.eventActivity + intensity * this.config.continuityGain);
        dst.eventContinuity = clamp01(dst.eventContinuity + intensity * this.config.continuityGain * 0.55);
        dst.lastTriggerTick = this.tick;

        src.eventActivity = clamp01(src.eventActivity + intensity * this.config.continuityGain * 0.22);
        src.eventContinuity = clamp01(src.eventContinuity + intensity * this.config.continuityGain * 0.20);

        edge.pulseStrength = clamp01(Math.max(edge.pulseStrength, intensity));
        edge.eventContinuity = clamp01(edge.eventContinuity + intensity * this.config.continuityGain - this.config.continuityDecay * 0.025 * scaledDt);
        edge.pulseSuccess += intensity;
        edge.historySuccess = clamp01(edge.historySuccess * 0.96 + intensity * 0.11);
        edge.priorityHistory = clamp01(edge.historySuccess * 0.72 + edge.eventContinuity * 0.18 + edge.circulationScore * 0.10);
        edge.lastPulseTick = this.tick;

        const transfer = clamp(intensity * 0.0028 * scaledDt, 0, 0.004 * Math.min(src.energy, Math.max(0.001, dst.energy)));
        energyDelta[src.id] -= transfer;
        energyDelta[dst.id] += transfer;
        // pulse가 안정적이면 자유 에너지 일부가 결합된 순환 에너지로 잠깁니다.
        const store = clamp(intensity * edge.eventContinuity * 0.00055 * scaledDt, 0, 0.003 * Math.min(src.energy, dst.energy));
        if (store > 0) {
          energyDelta[src.id] -= store * 0.5;
          energyDelta[dst.id] -= store * 0.5;
          boundDelta[src.id] += store * 0.5;
          boundDelta[dst.id] += store * 0.5;
        }

        phaseDelta[dst.id] += Math.sin(src.eventClock - dst.eventClock) * intensity * 0.035;

        if (intensity >= this.config.minPulseIntensity && emitted < emissionBudget && newPulses.length + this.eventPulses.length < maxPulses) {
          newPulses.push({
            id: this.pulseSeq++,
            from: src.id,
            to: dst.id,
            edgeId: edge.id,
            x: src.x,
            y: src.y,
            tx: dst.x,
            ty: dst.y,
            age: this.rng.range(0, 0.35),
            intensity,
            phaseError: Math.abs(eventPhaseError),
            visualLife: this.config.pulseVisualLifetime * this.rng.range(0.82, 1.22),
            visualOffset: this.rng.range(0, 0.22),
            visualSpeed: this.config.pulseVisualSpeed * this.rng.range(0.82, 1.24)
          });
          emitted += 1;
          this.emittedPulseCount += 1;
        } else {
          this.suppressedPulseCount += 1;
        }
      } else {
        edge.eventContinuity = clamp01(edge.eventContinuity - this.config.continuityDecay * 0.020 * scaledDt);
        edge.pulseFail += 0.025 * scaledDt;
        edge.historySuccess = clamp01(edge.historySuccess - this.config.failedEdgeDecay * 0.22 * scaledDt);
      }
    }

    const aged = this.eventPulses
      .map((p) => ({ ...p, age: p.age + Math.max(0.12, p.visualSpeed), intensity: p.intensity * 0.965 }))
      .filter((p) => p.age < Math.max(8, p.visualLife) && p.intensity > this.config.minPulseIntensity * 0.42);
    this.eventPulses = [...newPulses, ...aged]
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, maxPulses);

    if (!this.config.performanceMode || this.tick % Math.max(1, this.config.cycleDetectionInterval) === 0) this.detectEventCycles(scaledDt);
  }

  private eventPhaseError(a: TaegukjaNode, b: TaegukjaNode, edge: TaegukjaEdge): number {
    // edge triggerDelay를 포함한 전달 위상 오차입니다.
    return signedAngleDelta(a.eventClock + edge.triggerDelay + edge.pulsePhase * 0.20, b.eventClock);
  }

  private detectEventCycles(scaledDt: number): void {
    const candidates = this.edges
      .filter((e) => e.eventContinuity > 0.035 || e.pulseStrength > 0.045 || e.binding > 0.25)
      .sort((a, b) => (b.eventContinuity + b.pulseStrength + b.binding * 0.3) - (a.eventContinuity + a.pulseStrength + a.binding * 0.3))
      .slice(0, Math.min(this.edges.length, this.config.loopSampleCount));

    const adjacency = new Map<number, TaegukjaEdge[]>();
    for (const e of candidates) {
      const aa = adjacency.get(e.a) ?? [];
      aa.push(e);
      adjacency.set(e.a, aa);
      const bb = adjacency.get(e.b) ?? [];
      bb.push(e);
      adjacency.set(e.b, bb);
    }

    const loops: CycleLoopInfo[] = [];
    const seen = new Set<string>();

    for (const e1 of candidates) {
      const mids = adjacency.get(e1.b) ?? [];
      for (const e2 of mids.slice(0, 10)) {
        const c = e2.a === e1.b ? e2.b : e2.a;
        if (c === e1.a || c === e1.b) continue;
        const e3 = this.edgeMap.get(this.edgeKey(c, e1.a));
        if (!e3) continue;
        if (!(e3.eventContinuity > 0.025 || e3.pulseStrength > 0.035 || e3.binding > 0.22)) continue;

        const nodeIds = [e1.a, e1.b, c].sort((x, y) => x - y);
        const key = nodeIds.join('-');
        if (seen.has(key)) continue;
        seen.add(key);

        const edges = [e1, e2, e3];
        const closure = this.loopPhaseClosureError(edges);
        const impedanceLoss = this.loopImpedanceLoss(nodeIds);
        const continuity = edges.reduce((s, e) => s + e.eventContinuity + 0.35 * e.pulseStrength, 0) / (edges.length * 1.35);
        const closureScore = Math.exp(-closure / Math.max(0.05, this.config.loopClosureTolerance));
        const impedanceScore = Math.exp(-impedanceLoss / Math.max(0.05, this.config.impedanceSpread * 2));
        const score = clamp01(0.46 * closureScore + 0.32 * continuity + 0.22 * impedanceScore);

        if (score < 0.24) continue;

        const cx = nodeIds.reduce((s, id) => s + this.nodes[id].x, 0) / nodeIds.length;
        const cy = nodeIds.reduce((s, id) => s + this.nodes[id].y, 0) / nodeIds.length;
        const radius = Math.max(18, nodeIds.reduce((s, id) => s + distance2D(cx, cy, this.nodes[id].x, this.nodes[id].y), 0) / nodeIds.length);

        loops.push({
          id: `${this.tick}:${key}`,
          nodeIds,
          edgeIds: edges.map((e) => e.id),
          cx,
          cy,
          radius,
          phaseClosureError: closure,
          impedanceLoss,
          continuity,
          score,
          age: 0
        });

        for (const e of edges) {
          e.circulationScore = clamp01(e.circulationScore + score * this.config.continuityGain * scaledDt * 2.2 - this.config.continuityDecay * 0.025 * scaledDt);
          e.loopClosurePotential = Math.max(e.loopClosurePotential, score);
          e.priorityLoopPotential = Math.max(e.priorityLoopPotential, score);
          e.historySuccess = clamp01(e.historySuccess + score * 0.035);
          if (score >= this.config.cycleBondThreshold && e.eventContinuity >= this.config.cycleBondThreshold * 0.40 && e.kind !== 'entangled') {
            e.kind = 'cycle-bond';
            e.binding = Math.max(e.binding, score * 0.85);
          }
        }
        for (const id of nodeIds) {
          const n = this.nodes[id];
          n.cycleMemory = clamp01(n.cycleMemory + score * 0.08);
          n.eventContinuity = clamp01(n.eventContinuity + score * 0.04);
        }
      }
      if (loops.length >= 80) break;
    }

    const aged = this.cycleLoops
      .map((l) => ({ ...l, age: l.age + 1, score: l.score * 0.94 }))
      .filter((l) => l.age < 60 && l.score > 0.12);
    this.cycleLoops = [...loops.sort((a, b) => b.score - a.score).slice(0, 70), ...aged].slice(0, 120);

    const cycleBondCount = this.edges.filter((e) => e.kind === 'cycle-bond').length;
    if (cycleBondCount > this.previousCycleBondCount + 2 && this.cycleLoops[0]) {
      const loop = this.cycleLoops[0];
      this.formationEvents.push({
        id: this.eventSeq++,
        tick: this.tick,
        kind: 'cycle',
        x: loop.cx,
        y: loop.cy,
        radius: loop.radius * 1.35,
        intensity: loop.score,
        label: `cycle-bond 순환 루프 형성 · score=${loop.score.toFixed(2)} · closure=${loop.phaseClosureError.toFixed(2)}`
      });
      this.formationEvents = this.formationEvents.filter((e) => this.tick - e.tick < 180).slice(-24);
    }
    this.previousCycleBondCount = cycleBondCount;
  }

  private loopPhaseClosureError(edges: TaegukjaEdge[]): number {
    const phase = edges.reduce((s, e) => s + e.pulsePhase + e.triggerDelay, 0);
    const nearest = Math.round(phase / TAU) * TAU;
    return Math.abs(phase - nearest);
  }

  private loopImpedanceLoss(nodeIds: number[]): number {
    let loss = 0;
    for (let i = 0; i < nodeIds.length; i += 1) {
      const a = this.nodes[nodeIds[i]];
      const b = this.nodes[nodeIds[(i + 1) % nodeIds.length]];
      loss += Math.abs(Math.log(Math.max(1e-6, a.impedance / Math.max(1e-6, b.impedance))));
    }
    return loss / Math.max(1, nodeIds.length);
  }

  private edgeMechanicalForce(a: TaegukjaNode, b: TaegukjaNode, edge: TaegukjaEdge): { fx: number; fy: number } {
    const dx = b.x - a.x; const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist; const ny = dy / dist;

    const baseTarget = edge.restLength * 1.12;
    const resonanceTarget = edge.restLength * (1.12 - 0.48 * edge.resonance);
    const massBondFactor = edge.kind === 'cycle-bond' ? 0.44 : edge.kind === 'mass-bond' ? 0.50 : edge.kind === 'entangled' ? 0.70 : 1;
    const massTarget = resonanceTarget * massBondFactor;

    // v8.2: 뭉침 원인을 분해하기 위해 공진/임피던스/mass-bond 항을 별도 힘으로 나눕니다.
    const resonancePull = this.forceAllowed('resonance')
      ? Math.max(0, dist - resonanceTarget) * 0.00055 * edge.weight * edge.resonance
      : 0;
    const impedancePull = this.forceAllowed('impedance')
      ? (dist - baseTarget) * 0.00055 * edge.weight * edge.impedanceMatch
      : 0;
    const massBondPull = this.forceAllowed('massBond') && (edge.kind === 'mass-bond' || edge.kind === 'cycle-bond')
      ? Math.max(0, dist - massTarget) * 0.00120 * edge.weight * Math.max(edge.binding, 0.25)
      : 0;

    const strong = this.forceAllowed('massBond') ? edge.strong * 0.010 : 0;
    const emRepel = this.forceAllowed('em') ? edge.em * 0.007 : 0;
    const gravity = (!this.config.disableGravityLike && this.forceAllowed('gravity')) ? edge.gravity * 0.006 : 0;
    const weakKick = this.forceAllowed('weak') ? edge.weak * 0.004 * Math.sin(a.phase + b.phase) : 0;

    const f = resonancePull + impedancePull + massBondPull + strong + gravity - emRepel + weakKick;

    this.forceDecomposition.resonanceAttraction += Math.max(0, resonancePull);
    this.forceDecomposition.impedanceAlignment += Math.abs(impedancePull);
    this.forceDecomposition.massBondCohesion += Math.max(0, massBondPull + strong);
    this.forceDecomposition.gravityLike += Math.max(0, gravity);
    if (emRepel >= 0) this.forceDecomposition.electromagneticRepulsion += Math.abs(emRepel);
    else this.forceDecomposition.electromagneticAttraction += Math.abs(emRepel);

    this.addNodeForce(a, 'strong', nx * (resonancePull + massBondPull + strong), ny * (resonancePull + massBondPull + strong));
    this.addNodeForce(b, 'strong', -nx * (resonancePull + massBondPull + strong), -ny * (resonancePull + massBondPull + strong));
    this.addNodeForce(a, 'em', -nx * emRepel, -ny * emRepel);
    this.addNodeForce(b, 'em', nx * emRepel, ny * emRepel);
    this.addNodeForce(a, 'gravity', nx * gravity, ny * gravity);
    this.addNodeForce(b, 'gravity', -nx * gravity, -ny * gravity);
    this.addNodeForce(a, 'weak', nx * weakKick, ny * weakKick);
    this.addNodeForce(b, 'weak', -nx * weakKick, -ny * weakKick);
    return { fx: nx * f, fy: ny * f };
  }

  private applyParticleForceFields(forceX: number[], forceY: number[], energyDelta: number[], scaledDt: number): void {
    for (const p of this.particles) {
      const memberSet = new Set(p.nodeIds);
      for (const node of this.nodes) {
        if (memberSet.has(node.id)) continue;
        const dx = p.cx - node.x; const dy = p.cy - node.y;
        const r = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / r; const ny = dy / r;
        const completeness = clamp01(p.particleScaleFraction / Math.max(1e-9, this.config.completeParticleFraction));
        const rangeStrong = Math.exp(-r / Math.max(22, p.radius * 1.6));
        const rangeWeak = Math.exp(-r / Math.max(55, p.radius * 3.0));
        const strong = this.forceAllowed('massBond') ? this.config.strongScale * p.colorNeutrality * p.solitonScore * rangeStrong * 0.0055 * completeness : 0;
        const em = this.forceAllowed('em') ? this.config.electromagneticScale * (p.charge * node.charge) / Math.max(180, r * r / 80) * 0.004 * completeness : 0;
        const weak = this.forceAllowed('weak') ? this.config.weakScale * rangeWeak * (1 - p.order) * 0.004 * completeness : 0;
        const grav = (!this.config.disableGravityLike && this.forceAllowed('gravity')) ? this.config.gravityScale * p.mass * node.massLike / Math.max(250, r * r / 80) * 0.005 * completeness : 0;
        forceX[node.id] += nx * (strong + grav - em) + Math.sin(this.time + node.id) * weak;
        forceY[node.id] += ny * (strong + grav - em) + Math.cos(this.time + node.id) * weak;
        energyDelta[node.id] += (strong * 0.002 - Math.abs(em) * 0.0008 - weak * 0.001) * scaledDt;
        this.forceDecomposition.massBondCohesion += Math.max(0, strong);
        this.forceDecomposition.gravityLike += Math.max(0, grav);
        if (em >= 0) this.forceDecomposition.electromagneticRepulsion += Math.abs(em); else this.forceDecomposition.electromagneticAttraction += Math.abs(em);
        this.addNodeForce(node, 'strong', nx * strong, ny * strong);
        this.addNodeForce(node, 'em', -nx * em, -ny * em);
        this.addNodeForce(node, 'weak', Math.sin(this.time + node.id) * weak, Math.cos(this.time + node.id) * weak);
        this.addNodeForce(node, 'gravity', nx * grav, ny * grav);
      }
    }
  }

  private applyParticlePairInteractions(forceX: number[], forceY: number[], energyDelta: number[], scaledDt: number): void {
    if (this.particles.length < 2) return;

    const ranked = [...this.particles]
      .sort((a, b) => b.solitonScore * b.formationStage - a.solitonScore * a.formationStage)
      .slice(0, 28);

    for (let i = 0; i < ranked.length; i += 1) {
      const a = ranked[i];
      for (let j = i + 1; j < ranked.length; j += 1) {
        const b = ranked[j];
        const dx = b.cx - a.cx; const dy = b.cy - a.cy;
        const r = Math.max(1, Math.hypot(dx, dy));
        const nx = dx / r; const ny = dy / r;
        const compA = clamp01(a.formationStage);
        const compB = clamp01(b.formationStage);
        const comp = Math.sqrt(compA * compB);

        const strongRange = Math.exp(-r / Math.max(24, (a.radius + b.radius) * 1.55));
        const weakRange = Math.exp(-r / Math.max(64, (a.radius + b.radius) * 3.0));
        const gravityRange = 1 / Math.max(280, r * r / 72);
        const exposedColor = Math.max(0.05, 1 - (a.colorNeutrality + b.colorNeutrality) * 0.5);

        // 태극자 모델 내부의 현상론적 효과장입니다. 표준모형/GR 방정식이 아니라, 공진 클러스터 간 영향 계수입니다.
        const strong = this.forceAllowed('massBond') ? this.config.strongScale * exposedColor * strongRange * (0.006 + 0.024 * comp) : 0;
        const em = this.forceAllowed('em') ? this.config.electromagneticScale * (a.charge * b.charge) / Math.max(320, r * r / 80) * (0.12 + 0.88 * comp) : 0;
        const weak = this.forceAllowed('weak') ? this.config.weakScale * weakRange * Math.max(0, 2 - a.order - b.order) * 0.0052 * (0.35 + 0.65 * comp) : 0;
        const gravity = (!this.config.disableGravityLike && this.forceAllowed('gravity')) ? this.config.gravityScale * (a.mass * b.mass) * gravityRange * (0.22 + 0.78 * comp) : 0;

        this.forceDecomposition.massBondCohesion += Math.max(0, strong);
        this.forceDecomposition.gravityLike += Math.max(0, gravity);
        if (em >= 0) this.forceDecomposition.electromagneticRepulsion += Math.abs(em); else this.forceDecomposition.electromagneticAttraction += Math.abs(em);

        const net = strong + gravity - em;
        const mode = Math.abs(weak) > Math.abs(net) * 1.35
          ? 'disturb'
          : net >= 0
            ? 'attract'
            : 'repel';

        if (this.particleInteractions.length < 90 && (Math.abs(net) + Math.abs(weak)) > 1e-5) {
          this.particleInteractions.push({
            id: `${this.tick}:${a.id}:${b.id}`,
            a: a.id,
            b: b.id,
            ax: a.cx,
            ay: a.cy,
            bx: b.cx,
            by: b.cy,
            strong,
            em,
            weak,
            gravity,
            net,
            mode
          });
        }

        this.distributeParticleForce(a, nx * net, ny * net, forceX, forceY, energyDelta, scaledDt);
        this.distributeParticleForce(b, -nx * net, -ny * net, forceX, forceY, energyDelta, scaledDt);

        const spinWaveX = Math.sin(this.time + a.id * 0.71 + b.id * 0.37) * weak;
        const spinWaveY = Math.cos(this.time + a.id * 0.43 - b.id * 0.59) * weak;
        this.distributeParticleForce(a, spinWaveX, spinWaveY, forceX, forceY, energyDelta, scaledDt, 'weak');
        this.distributeParticleForce(b, -spinWaveX, -spinWaveY, forceX, forceY, energyDelta, scaledDt, 'weak');
      }
    }

    this.particleInteractions.sort((a, b) => (Math.abs(b.net) + Math.abs(b.weak)) - (Math.abs(a.net) + Math.abs(a.weak)));
    this.particleInteractions = this.particleInteractions.slice(0, 60);
  }

  private distributeParticleForce(p: ParticleInfo, fx: number, fy: number, forceX: number[], forceY: number[], energyDelta: number[], scaledDt: number, kind: 'weak' | 'all' = 'all'): void {
    const count = Math.max(1, p.nodeIds.length);
    const perFx = fx / count;
    const perFy = fy / count;
    const energyKick = (Math.hypot(fx, fy) * 0.0004 + p.solitonScore * 0.0002) * scaledDt / count;
    for (const id of p.nodeIds) {
      forceX[id] += perFx;
      forceY[id] += perFy;
      energyDelta[id] += energyKick;
      const node = this.nodes[id];
      if (kind === 'weak') {
        this.addNodeForce(node, 'weak', perFx, perFy);
      } else {
        this.addNodeForce(node, 'strong', perFx * 0.25, perFy * 0.25);
        this.addNodeForce(node, 'gravity', perFx * 0.55, perFy * 0.55);
        this.addNodeForce(node, 'em', -perFx * 0.20, -perFy * 0.20);
      }
    }
  }

  private applyWeakTransitions(pressure: number[], scaledDt: number): void {
    for (const node of this.nodes) {
      const p = clamp01(pressure[node.id] * scaledDt * 0.012);
      if (this.rng.chance(p)) {
        node.sigma = (node.sigma * -1) as 1 | -1;
        node.weakState = node.weakState === 1 ? -1 : node.weakState === -1 ? 1 : this.rng.pick([-1, 1]);
        node.charge = -node.charge;
        node.phase = wrapAngle(node.phase + Math.PI * this.rng.range(0.45, 0.55));
      }
    }
  }

  private adaptEdges(scaledDt: number): void {
    const survivors: TaegukjaEdge[] = [];
    for (const edge of this.edges) {
      const priorityTarget = this.config.enableResonancePrioritySearch ? edge.priorityScore * 0.52 + edge.historySuccess * 0.26 + edge.loopClosurePotential * 0.22 : edge.resonance * edge.impedanceMatch;
      const target = edge.kind === 'entangled'
        ? 0.98
        : edge.kind === 'cycle-bond'
          ? Math.max(0.78, edge.binding, edge.circulationScore)
          : edge.kind === 'mass-bond'
            ? Math.max(0.72, edge.binding)
            : priorityTarget;

      edge.weight = clamp01(edge.weight + (target - edge.weight) * this.config.linkAdaptationRate * scaledDt);

      // v8.4: 시험 pulse 실패 이력이 많고 우선순위가 낮은 연결은 자연 도태됩니다.
      if (this.config.enableResonancePrioritySearch && edge.kind !== 'entangled' && edge.kind !== 'cycle-bond') {
        const failurePressure = clamp01(edge.pulseFail / Math.max(1, edge.pulseSuccess + edge.pulseFail + 0.1));
        const priorityWeak = clamp01(1 - edge.priorityScore);
        const decay = this.config.failedEdgeDecay * failurePressure * priorityWeak * scaledDt;
        if (decay > 0) {
          edge.weight = clamp01(edge.weight - decay);
          edge.binding = clamp01(edge.binding - decay * 0.45);
          edge.eventContinuity = clamp01(edge.eventContinuity - decay * 0.60);
          this.failedEdgeDecayCount += decay > 0.0001 ? 1 : 0;
        }
      }

      const protectedEdge = edge.kind === 'entangled' || edge.kind === 'mass-bond' || edge.kind === 'cycle-bond';
      if (!protectedEdge && edge.weight < this.config.linkBreakThreshold && this.rng.chance(0.018)) {
        this.edgeMap.delete(edge.id);
        continue;
      }
      survivors.push(edge);
    }
    this.edges = survivors;
  }

  private formNewLinks(): void {
    let attempts = this.config.graphFormationAttempts;
    while (attempts-- > 0 && this.edges.length < this.config.maxLinks) {
      const a = this.rng.int(0, this.nodes.length - 1);
      const b = this.config.topology === 'spatial-local' || this.rng.chance(0.72)
        ? this.pickNearbyNodeIndex(a, Math.max(36, this.config.initialLocalRadius * 2.0))
        : this.rng.int(0, this.nodes.length - 1);
      if (a === b || this.edgeMap.has(this.edgeKey(a, b))) continue;
      const na = this.nodes[a]; const nb = this.nodes[b];
      const priority = this.computeResonancePriority(a, b, Math.max(36, this.config.initialLocalRadius * 2.0));
      const particleAttractor = (na.isParticleCore || nb.isParticleCore) ? 0.08 : 0;
      const score = this.config.randomBondModel
        ? this.rng.range(0.02, 0.32) * priority.proximity
        : clamp01(priority.total + particleAttractor);
      this.recordPriorityCandidate(a, b, priority, score > this.config.resonanceThreshold, 'dynamic-candidate');
      if (score > this.config.resonanceThreshold || this.rng.chance(score * 0.0075)) {
        if (this.addEdge(a, b, 'resonance', clamp01(score))) {
          const edge = this.edgeMap.get(this.edgeKey(a, b));
          if (edge) this.applyPriorityToEdge(edge, priority);
          this.prioritySelected += 1;
        }
      } else {
        this.priorityRejected += 1;
      }
    }
  }

  private detectParticles(): void {
    const adjacency = Array.from({ length: this.nodes.length }, () => [] as number[]);
    const bindingGate = Math.max(0.12, this.config.particleThreshold * 0.58);

    for (const edge of this.edges) {
      if (edge.kind === 'cycle-bond' || edge.kind === 'mass-bond' || edge.circulationScore * edge.eventContinuity > bindingGate * 0.55 || edge.binding * edge.resonance * edge.impedanceMatch > bindingGate) {
        adjacency[edge.a].push(edge.b);
        adjacency[edge.b].push(edge.a);
      }
    }

    for (const node of this.nodes) {
      node.clusterId = -1;
      node.isParticleCore = false;
    }

    const particles: ParticleInfo[] = [];
    const currentKeys = new Set<string>();
    let cid = 0;

    for (const node of this.nodes) {
      if (node.clusterId !== -1) continue;
      const queue = [node.id];
      const ids: number[] = [];
      node.clusterId = cid;

      for (let h = 0; h < queue.length; h += 1) {
        const cur = queue[h];
        ids.push(cur);
        for (const next of adjacency[cur]) {
          if (this.nodes[next].clusterId === -1) {
            this.nodes[next].clusterId = cid;
            queue.push(next);
          }
        }
      }

      if (ids.length >= this.config.minParticleNodes) {
        const particle = this.makeParticle(cid, ids);
        const boundRatio = particle.boundEnergy / Math.max(1e-9, particle.totalEnergy + particle.boundEnergy);
        const visibleCandidate =
          particle.solitonScore >= Math.max(0.16, this.config.particleThreshold * 0.30) ||
          particle.particleScaleFraction >= 0.012 ||
          boundRatio >= 0.025 ||
          particle.size >= this.config.minParticleNodes * 2;

        if (visibleCandidate) {
          particles.push(particle);
          currentKeys.add(this.particleStableKey(particle));
          for (const id of ids) this.nodes[id].isParticleCore = true;
        }
      }
      cid += 1;
    }

    particles.sort((a, b) =>
      b.formationStage * b.solitonScore * Math.log1p(b.size) -
      a.formationStage * a.solitonScore * Math.log1p(a.size)
    );

    const tracked = particles.slice(0, 80);
    const stableCount = tracked.filter((p) => p.lifecycle === 'stable' || p.lifecycle === 'complete').length;

    const newParticles = tracked.filter((p) => !this.previousParticleKeys.has(this.particleStableKey(p)));
    const strongestNew = newParticles.sort((a, b) => b.solitonScore - a.solitonScore)[0];
    if (strongestNew) {
      const eventKind: FormationEvent['kind'] =
        strongestNew.lifecycle === 'forming'
          ? 'forming'
          : strongestNew.lifecycle === 'stable' || strongestNew.lifecycle === 'complete'
            ? 'birth'
            : 'proto';
      this.pushFormationEvent(
        eventKind,
        strongestNew,
        `${strongestNew.lifecycle} 후보 생성 · ${strongestNew.size}셀 · ${(strongestNew.particleScaleFraction * 100).toFixed(1)}%`
      );
    }

    if (stableCount > this.previousStableCount) {
      const strongest = [...tracked].sort((a, b) => b.solitonScore - a.solitonScore)[0];
      if (strongest) this.pushFormationEvent('stabilize', strongest, `안정 후보 증가 ${this.previousStableCount}→${stableCount}`);
    } else if (stableCount < this.previousStableCount) {
      const strongest = [...tracked].sort((a, b) => b.solitonScore - a.solitonScore)[0];
      if (strongest) this.pushFormationEvent('collapse', strongest, `불안정 후보 붕괴/병합 ${this.previousStableCount}→${stableCount}`);
    }

    this.previousStableCount = stableCount;
    this.previousParticleKeys = currentKeys;
    this.particles = tracked;
  }

  private particleStableKey(p: ParticleInfo): string {
    return this.stableClusterKey(p.cx, p.cy, p.size, p.charge);
  }

  private makeParticle(id: number, ids: number[]): ParticleInfo {
    const scale = this.physicalScale();
    let energy = 0, bound = 0, charge = 0, px = 0, py = 0, sx = 0, sy = 0, z = 0, eventActivity = 0, eventContinuity = 0, cycleMemory = 0;
    const colors = [0, 0, 0];
    for (const idn of ids) {
      const n = this.nodes[idn];
      energy += n.energy; bound += n.boundEnergy; charge += n.charge; px += n.x; py += n.y; sx += Math.cos(n.phase); sy += Math.sin(n.phase); z += n.impedance; eventActivity += n.eventActivity; eventContinuity += n.eventContinuity; cycleMemory += n.cycleMemory; colors[n.color] += 1;
    }
    const size = ids.length;
    const cx = px / size; const cy = py / size;
    const order = Math.sqrt(sx * sx + sy * sy) / size;
    const meanImpedance = z / size;
    const colorNeutrality = 1 - (Math.max(...colors) - Math.min(...colors)) / size;
    let radius = 0;
    for (const idn of ids) radius += distance2D(cx, cy, this.nodes[idn].x, this.nodes[idn].y);
    radius = Math.max(14, radius / size);
    const clusterSet = new Set(ids);
    const clusterEdges = this.edges.filter((e) => clusterSet.has(e.a) && clusterSet.has(e.b));
    const meanBinding = clusterEdges.length ? clusterEdges.reduce((s, e) => s + e.binding * e.resonance * e.impedanceMatch, 0) / clusterEdges.length : 0;
    const cycleEdges = clusterEdges.filter((e) => e.kind === 'cycle-bond' || e.circulationScore * e.eventContinuity > this.config.cycleBondThreshold * 0.28);
    const cycleDensity = clamp01(cycleEdges.length / Math.max(1, size * 0.52));
    const cycleContinuity = clamp01((cycleEdges.reduce((s, e) => s + e.circulationScore * 0.55 + e.eventContinuity * 0.45, 0) / Math.max(1, cycleEdges.length)) * 1.25 + (eventContinuity / Math.max(1, size)) * 0.25 + (cycleMemory / Math.max(1, size)) * 0.30);
    const loopClosureScore = clamp01(this.cycleLoops.filter((l) => l.nodeIds.some((id) => clusterSet.has(id))).reduce((s, l) => s + l.score, 0) / Math.max(1, size / 8));
    const spinLike = Math.abs(ids.reduce((s, idn) => s + this.nodes[idn].sigma * this.nodes[idn].omega, 0)) / Math.max(1, size);
    const mass = this.massFromEnergy(energy, bound) * (1 + meanBinding);
    const representedTaegeukjaCount = size * scale.realTaegeukjaPerVisibleNode;
    const particleScaleFraction = representedTaegeukjaCount / Math.max(1e-99, scale.realTaegeukjaPerParticle);
    const completeParticle = particleScaleFraction >= this.config.completeParticleFraction;
    const sizeCompleteness = clamp01(particleScaleFraction / Math.max(1e-9, this.config.completeParticleFraction));
    const solitonScore = clamp01(0.18 * order + 0.18 * meanBinding + 0.14 * colorNeutrality + 0.14 * clamp01(bound / Math.max(energy + bound, 1e-9) * 4) + 0.12 * sizeCompleteness + 0.14 * cycleDensity + 0.10 * cycleContinuity);
    const totalEnergyJ = (energy + bound) * scale.energyUnitJ;
    const massKg = totalEnergyJ / (C_LIGHT * C_LIGHT);
    const key = this.stableClusterKey(cx, cy, size, charge);
    const age = (this.particleAges.get(key) ?? 0) + 1;
    this.particleAges.set(key, age);
    const kind = this.classifyParticle(size, charge, colorNeutrality, mass, solitonScore, completeParticle, particleScaleFraction);
    const boundFraction = clamp01(bound / Math.max(energy + bound, 1e-9));
    const cycleGate = this.config.requireCycleForParticle ? clamp01(0.40 * cycleDensity + 0.40 * cycleContinuity + 0.20 * loopClosureScore) : 1;
    const formationStage = clamp01(
      (0.20 * sizeCompleteness +
      0.24 * solitonScore +
      0.20 * clamp01(age / Math.max(1, this.config.stableParticleAge)) +
      0.14 * clamp01(boundFraction * 5) +
      0.12 * cycleDensity +
      0.10 * cycleContinuity) * (0.55 + 0.45 * cycleGate)
    );
    const cycleReady = !this.config.requireCycleForParticle || cycleGate >= 0.30;
    const lifecycle = completeParticle && age >= this.config.stableParticleAge && cycleReady
      ? 'complete'
      : age >= this.config.stableParticleAge && solitonScore >= 0.34 && cycleReady
        ? 'stable'
        : particleScaleFraction >= 0.10 || solitonScore >= 0.42 || boundFraction >= 0.055 || cycleDensity >= 0.05
          ? 'forming'
          : 'fragment';
    return { id, kind, nodeIds: ids, size, totalEnergy: energy, boundEnergy: bound, totalEnergyJ, mass, massKg, charge, colorNeutrality, spinLike, order, meanImpedance, solitonScore, stabilityAge: age, cx, cy, radius, representedTaegeukjaCount, particleScaleFraction, completeParticle, lifecycle, formationStage, cycleDensity, cycleContinuity, loopClosureScore };
  }

  private stableClusterKey(cx: number, cy: number, size: number, charge: number): string {
    const gx = Math.round(cx / 70);
    const gy = Math.round(cy / 70);
    const gs = Math.round(size / 18);
    const gq = Math.round(charge * 2);
    return `${gx}:${gy}:${gs}:${gq}`;
  }

  private pushFormationEvent(kind: FormationEvent['kind'], p: ParticleInfo, label: string): void {
    this.formationEvents.push({
      id: this.eventSeq++,
      tick: this.tick,
      kind,
      x: p.cx,
      y: p.cy,
      radius: Math.max(18, p.radius * 1.2),
      intensity: clamp01(p.solitonScore),
      label
    });
    this.formationEvents = this.formationEvents.filter((e) => this.tick - e.tick < 180).slice(-24);
  }

  private classifyParticle(size: number, charge: number, colorNeutrality: number, mass: number, solitonScore: number, complete: boolean, fraction: number): ParticleKind {
    if (!complete) return fraction >= 0.20 ? 'proto' : 'pre-particle-fragment';
    if (mass > this.config.energyPerNode * Math.max(12, this.config.nodeCount * 0.10) && solitonScore > 0.88) return 'black-hole-like';
    if (size <= this.config.nodeCount * 0.22 && Math.abs(charge) >= 0.8) return 'lepton-like';
    if (size <= this.config.nodeCount * 0.36 && colorNeutrality > 0.72) return 'meson-like';
    if (size >= this.config.nodeCount * 0.30 && colorNeutrality > 0.62) return 'baryon-like';
    if (Math.abs(charge) < 0.5 && solitonScore > 0.75) return 'gauge-boson-like';
    return 'proto';
  }

  private computeMetrics(driftBefore: number, driftAfter: number, newlyBound: number, globalCorrection: number): SimulationMetrics {
    const scale = this.physicalScale();
    const totalEnergy = this.currentTotalEnergy();
    const boundEnergy = this.nodes.reduce((s, n) => s + n.boundEnergy, 0);
    const freeEnergy = this.nodes.reduce((s, n) => s + n.energy, 0);
    const edgeCount = Math.max(1, this.edges.length);
    const avgResonance = this.edges.reduce((s, e) => s + e.resonance, 0) / edgeCount;
    const avgImpedanceMatch = this.edges.reduce((s, e) => s + e.impedanceMatch, 0) / edgeCount;
    const avgFlowAbs = this.edges.reduce((s, e) => s + Math.abs(e.flow), 0) / edgeCount;
    const sx = this.nodes.reduce((s, n) => s + Math.cos(n.phase), 0);
    const sy = this.nodes.reduce((s, n) => s + Math.sin(n.phase), 0);
    const orderParameter = this.nodes.length ? Math.sqrt(sx * sx + sy * sy) / this.nodes.length : 0;
    const phaseEntropy = this.phaseEntropy(18);
    const graphEntropy = this.graphEntropy();
    const pathStats = this.samplePathStats();
    const strongActivity = this.edges.reduce((s, e) => s + Math.abs(e.strong), 0) / edgeCount;
    const emActivity = this.edges.reduce((s, e) => s + Math.abs(e.em), 0) / edgeCount;
    const weakActivity = this.edges.reduce((s, e) => s + Math.abs(e.weak), 0) / edgeCount;
    const gravityActivity = this.edges.reduce((s, e) => s + Math.abs(e.gravity), 0) / edgeCount;
    const ct = Math.max(this.config.ctRatio, 1);
    const spatial = this.computeSpatialStats();
    const coarseFieldMetrics = this.updateCoarseEventField();
    return {
      tick: this.tick,
      time: this.time,
      totalEnergy,
      boundEnergy,
      freeEnergy,
      totalEnergyJ: totalEnergy * scale.energyUnitJ,
      boundEnergyJ: boundEnergy * scale.energyUnitJ,
      energyDriftBeforeCorrection: driftBefore,
      energyDriftAfterCorrection: driftAfter,
      localEnergyResidual: Math.abs(driftBefore - driftAfter),
      globalEnergyCorrection: globalCorrection,
      linkCount: this.edges.length,
      massBondCount: this.edges.filter((e) => e.kind === 'mass-bond').length,
      avgDegree: this.nodes.reduce((s, n) => s + n.degree, 0) / Math.max(1, this.nodes.length),
      avgResonance,
      avgImpedanceMatch,
      avgFlowAbs,
      avgDTQ: pathStats.avg,
      maxDTQ: pathStats.max,
      unreachableRatio: pathStats.unreachable,
      orderParameter,
      entropy: 0.55 * phaseEntropy + 0.45 * graphEntropy,
      phaseEntropy,
      graphEntropy,
      particleCount: this.particles.length,
      completeParticleCount: this.particles.filter((p) => p.completeParticle).length,
      formingParticleCount: this.particles.filter((p) => p.lifecycle === 'forming').length,
      stableParticleCount: this.particles.filter((p) => p.lifecycle === 'stable' || p.lifecycle === 'complete').length,
      largestParticleSize: this.particles.reduce((m, p) => Math.max(m, p.size), 0),
      largestParticleScaleFraction: this.particles.reduce((m, p) => Math.max(m, p.particleScaleFraction), 0),
      strongestSolitonScore: this.particles.reduce((m, p) => Math.max(m, p.solitonScore), 0),
      totalMass: this.particles.reduce((s, p) => s + p.mass, 0),
      totalMassKg: this.particles.reduce((s, p) => s + p.massKg, 0),
      eStepNormalized: Math.pow(ct, 2.5),
      tauTQNormalized: 1 / Math.max(1e-9, ct),
      lTQNormalized: this.normalizedLTQ(ct),
      forceMetrics: { strongActivity, emActivity, weakActivity, gravityActivity, massFormationRate: newlyBound, particleInfluenceRadius: this.particles.reduce((s, p) => s + p.radius, 0) / Math.max(1, this.particles.length) },
      forceDecomposition: this.finalizeForceDecomposition(spatial),
      eventCycleMetrics: this.computeEventCycleMetrics(),
      pulseGovernorMetrics: this.computePulseGovernorMetrics(),
      priorityMetrics: this.computePriorityMetrics(),
      coarseFieldMetrics,
      performanceMetrics: this.computePerformanceMetrics(),
      spatialSpreadRatio: spatial.spreadRatio,
      fieldOccupancyRatio: spatial.occupancyRatio,
      meanNearestNeighborDistance: spatial.meanNearestDistance,
      cohesionIndex: spatial.cohesionIndex,
      scale
    };
  }

  private emptyMetrics(): SimulationMetrics {
    const scale = this.physicalScale();
    return {
      tick: 0, time: 0, totalEnergy: 0, boundEnergy: 0, freeEnergy: 0, totalEnergyJ: 0, boundEnergyJ: 0,
      energyDriftBeforeCorrection: 0, energyDriftAfterCorrection: 0, localEnergyResidual: 0, globalEnergyCorrection: 0,
      linkCount: 0, massBondCount: 0, avgDegree: 0, avgResonance: 0, avgImpedanceMatch: 0, avgFlowAbs: 0,
      avgDTQ: 0, maxDTQ: 0, unreachableRatio: 0,
      orderParameter: 0, entropy: 0, phaseEntropy: 0, graphEntropy: 0,
      particleCount: 0, completeParticleCount: 0, formingParticleCount: 0, stableParticleCount: 0, largestParticleSize: 0, largestParticleScaleFraction: 0, strongestSolitonScore: 0,
      totalMass: 0, totalMassKg: 0,
      eStepNormalized: 1, tauTQNormalized: 1, lTQNormalized: 1,
      forceMetrics: { strongActivity: 0, emActivity: 0, weakActivity: 0, gravityActivity: 0, massFormationRate: 0, particleInfluenceRadius: 0 },
      forceDecomposition: this.emptyForceDecomposition(),
      eventCycleMetrics: this.emptyEventCycleMetrics(),
      pulseGovernorMetrics: this.emptyPulseGovernorMetrics(),
      priorityMetrics: this.emptyPriorityMetrics(),
      coarseFieldMetrics: this.emptyCoarseFieldMetrics(),
      performanceMetrics: this.computePerformanceMetrics(),
      spatialSpreadRatio: 1,
      fieldOccupancyRatio: 0,
      meanNearestNeighborDistance: 0,
      cohesionIndex: 0,
      scale
    };
  }

  private computeSpatialStats(): { spreadRatio: number; occupancyRatio: number; meanNearestDistance: number; cohesionIndex: number } {
    const n = this.nodes.length;
    if (n === 0) return { spreadRatio: 0, occupancyRatio: 0, meanNearestDistance: 0, cohesionIndex: 0 };

    const cx = this.nodes.reduce((sum, node) => sum + node.x, 0) / n;
    const cy = this.nodes.reduce((sum, node) => sum + node.y, 0) / n;
    const maxMeanRadius = Math.hypot(this.config.width, this.config.height) * 0.34;
    const meanRadius = this.nodes.reduce((sum, node) => sum + distance2D(cx, cy, node.x, node.y), 0) / n;
    const spreadRatio = clamp01(meanRadius / Math.max(1, maxMeanRadius));

    const cols = 14;
    const rows = 9;
    const occupied = new Set<string>();
    for (const node of this.nodes) {
      const gx = clamp(Math.floor((node.x / Math.max(1, this.config.width)) * cols), 0, cols - 1);
      const gy = clamp(Math.floor((node.y / Math.max(1, this.config.height)) * rows), 0, rows - 1);
      occupied.add(`${gx}:${gy}`);
    }
    const occupancyRatio = clamp01(occupied.size / Math.min(n, cols * rows));

    const samples = Math.min(n, n > 2200 ? 90 : 130);
    let nnSum = 0;
    for (let i = 0; i < samples; i += 1) {
      const id = Math.floor((i / Math.max(1, samples)) * n);
      const a = this.nodes[id];
      let best = Infinity;
      for (let j = 0; j < n; j += Math.max(1, Math.floor(n / 900))) {
        if (j === id) continue;
        const b = this.nodes[j];
        const d = distance2D(a.x, a.y, b.x, b.y);
        if (d < best) best = d;
      }
      if (Number.isFinite(best)) nnSum += best;
    }
    const meanNearestDistance = nnSum / Math.max(1, samples);
    const expectedUniformNN = Math.sqrt((this.config.width * this.config.height) / Math.max(1, n)) * 0.55;
    const nnCompression = clamp01(1 - meanNearestDistance / Math.max(1, expectedUniformNN));

    const massBondRatio = clamp01(this.edges.filter((e) => e.kind === 'mass-bond').length / Math.max(1, n * 0.18));
    const particleRatio = clamp01(this.particles.reduce((s, p) => s + p.formationStage, 0) / Math.max(1, n / Math.max(1, this.config.minParticleNodes)));
    const cohesionIndex = clamp01(0.44 * (1 - occupancyRatio) + 0.24 * nnCompression + 0.20 * massBondRatio + 0.12 * particleRatio);

    return { spreadRatio, occupancyRatio, meanNearestDistance, cohesionIndex };
  }

  private samplePathStats(): { avg: number; max: number; unreachable: number } {
    if (this.config.performanceMode && this.tick > 0 && this.tick % Math.max(1, this.config.heavyMetricInterval) !== 0) return this.cachedPathStats;
    const n = this.nodes.length; if (n < 2) return { avg: 0, max: 0, unreachable: 0 };
    const samples = n > 2200 ? 14 : n > 1200 ? 24 : Math.min(70, n); let sum = 0, count = 0, max = 0, miss = 0;
    for (let i = 0; i < samples; i += 1) {
      const a = this.rng.int(0, n - 1); let b = this.rng.int(0, n - 1); if (a === b) b = (b + 1) % n;
      const d = this.shortestPath(a, b).distance;
      if (!Number.isFinite(d)) miss += 1; else { sum += d; count += 1; max = Math.max(max, d); }
    }
    this.cachedPathStats = { avg: count ? sum / count : Infinity, max, unreachable: miss / samples };
    return this.cachedPathStats;
  }

  private phaseEntropy(bins: number): number {
    const hist = Array.from({ length: bins }, () => 0);
    for (const node of this.nodes) hist[Math.floor((wrapAngle(node.phase) / TAU) * bins) % bins] += 1;
    let h = 0; for (const c of hist) { const p = c / Math.max(1, this.nodes.length); if (p > 0) h -= p * safeLog(p); }
    return h / safeLog(bins);
  }

  private graphEntropy(): number {
    const totalDegree = this.nodes.reduce((s, n) => s + n.degree, 0);
    if (totalDegree <= 0) return 0;
    let h = 0; for (const n of this.nodes) { const p = n.degree / totalDegree; if (p > 0) h -= p * safeLog(p); }
    return h / safeLog(this.nodes.length);
  }

  private buildAdjacency(): number[][] {
    const adjacency = Array.from({ length: this.nodes.length }, () => [] as number[]);
    for (const edge of this.edges) { adjacency[edge.a].push(edge.b); adjacency[edge.b].push(edge.a); }
    return adjacency;
  }

  private refreshDegrees(): void {
    for (const node of this.nodes) node.degree = 0;
    for (const edge of this.edges) { this.nodes[edge.a].degree += 1; this.nodes[edge.b].degree += 1; }
  }

  private correctEnergyConservation(): number {
    if (this.config.disableEnergyCorrection) return 0;
    const current = this.currentTotalEnergy();
    if (current <= 0) return 0;
    const residual = this.initialTotalEnergy - current;
    if (Math.abs(residual) < 1e-9) return 0;

    // v7: 전역 스케일 재정규화 대신, 아주 작은 잔차만 자유 에너지에 분배합니다.
    // 엣지 흐름과 결합 전환은 이미 국소적으로 보존되며, 이 함수는 수치 누적 오차의 완충 장치입니다.
    const freeTotal = this.nodes.reduce((sum, n) => sum + n.energy, 0);
    if (freeTotal <= 0) return residual;
    const correction = clamp(residual / freeTotal, -0.018, 0.018);
    for (const node of this.nodes) {
      node.energy = Math.max(1e-6, node.energy * (1 + correction));
      node.massLike = this.massFromEnergy(node.energy, node.boundEnergy);
    }
    this.updatePhysicalFields();
    return correction * freeTotal;
  }

  private updatePhysicalFields(): void {
    const scale = this.physicalScale();
    for (const node of this.nodes) {
      node.representedTaegeukjaCount = scale.realTaegeukjaPerVisibleNode;
      node.physicalEnergyJ = (node.energy + node.boundEnergy) * scale.energyUnitJ;
    }
  }




  private emptyPriorityMetrics(): PriorityMetrics {
    return {
      avgPriorityScore: 0,
      avgSelectedPriority: 0,
      avgPulseHistory: 0,
      candidateCount: 0,
      selectedCount: 0,
      rejectedCount: 0,
      failedEdgeDecayCount: 0,
      loopPotentialAvg: 0
    };
  }

  private computePriorityMetrics(): PriorityMetrics {
    const edgeCount = Math.max(1, this.edges.length);
    const avgPriorityScore = this.edges.reduce((s, e) => s + e.priorityScore, 0) / edgeCount;
    const avgPulseHistory = this.edges.reduce((s, e) => s + e.historySuccess, 0) / edgeCount;
    const loopPotentialAvg = this.edges.reduce((s, e) => s + e.loopClosurePotential, 0) / edgeCount;
    const selected = this.priorityCandidates.filter((c) => c.selected);
    const avgSelectedPriority = selected.length ? selected.reduce((s, c) => s + c.breakdown.total, 0) / selected.length : 0;
    return {
      avgPriorityScore,
      avgSelectedPriority,
      avgPulseHistory,
      candidateCount: this.priorityCandidates.length,
      selectedCount: this.prioritySelected,
      rejectedCount: this.priorityRejected,
      failedEdgeDecayCount: this.failedEdgeDecayCount,
      loopPotentialAvg
    };
  }




  private computePerformanceMetrics(): PerformanceMetrics {
    return {
      snapshotFps: this.config.renderSnapshotFps,
      renderedEdgeBudget: this.config.maxRenderedEdges,
      renderedNodeBudget: this.config.maxRenderedNodes,
      heavyMetricInterval: this.config.heavyMetricInterval,
      particleDetectionInterval: this.config.particleDetectionInterval,
      cycleDetectionInterval: this.config.cycleDetectionInterval,
      coarseFieldInterval: this.config.coarseFieldInterval
    };
  }

  private emptyCoarseFieldMetrics(): CoarseFieldMetrics {
    return {
      cols: this.config.coarseGridCols || 1,
      rows: this.config.coarseGridRows || 1,
      maxPulseDensity: 0,
      maxContinuity: 0,
      maxLoopClosure: 0,
      maxParticlePotential: 0,
      activeCellRatio: 0,
      meanActiveEnergy: 0
    };
  }

  private updateCoarseEventField(): CoarseFieldMetrics {
    if (this.config.performanceMode && this.tick > 0 && this.tick % Math.max(1, this.config.coarseFieldInterval) !== 0) return this.cachedCoarseFieldMetrics;
    if (!this.config.enableCoarseEventField || !this.config.showCoarseEventField) {
      this.coarseField = [];
      this.cachedCoarseFieldMetrics = this.emptyCoarseFieldMetrics();
      return this.cachedCoarseFieldMetrics;
    }

    const cols = Math.max(6, Math.min(80, Math.round(this.config.coarseGridCols)));
    const rows = Math.max(4, Math.min(60, Math.round(this.config.coarseGridRows)));
    const w = this.config.width / cols;
    const h = this.config.height / rows;
    const count = cols * rows;
    const raw = Array.from({ length: count }, (_, idx) => {
      const gx = idx % cols;
      const gy = Math.floor(idx / cols);
      return {
        gx,
        gy,
        x: gx * w,
        y: gy * h,
        w,
        h,
        pulseDensity: 0,
        eventContinuity: 0,
        loopClosure: 0,
        resonancePriority: 0,
        particlePotential: 0,
        activeEnergy: 0
      } as CoarseFieldCell;
    });

    const add = (x: number, y: number, key: keyof Pick<CoarseFieldCell, 'pulseDensity' | 'eventContinuity' | 'loopClosure' | 'resonancePriority' | 'particlePotential' | 'activeEnergy'>, value: number, radiusCells = 1) => {
      const cx = clamp(Math.floor((x / Math.max(1, this.config.width)) * cols), 0, cols - 1);
      const cy = clamp(Math.floor((y / Math.max(1, this.config.height)) * rows), 0, rows - 1);
      for (let dy = -radiusCells; dy <= radiusCells; dy += 1) {
        for (let dx = -radiusCells; dx <= radiusCells; dx += 1) {
          const gx = cx + dx;
          const gy = cy + dy;
          if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) continue;
          const dist = Math.hypot(dx, dy);
          const falloff = Math.exp(-dist * 0.85);
          const cell = raw[gy * cols + gx];
          cell[key] += value * falloff;
        }
      }
    };

    if (!this.config.showFieldParticlesOnly) {
      const nodeStride = Math.max(1, Math.floor(this.nodes.length / 1600));
      for (let i = 0; i < this.nodes.length; i += nodeStride) {
        const n = this.nodes[i];
        const active = Math.max(n.eventActivity, n.eventContinuity, n.cycleMemory);
        add(n.x, n.y, 'eventContinuity', n.eventContinuity * 0.55 + n.cycleMemory * 0.45, 1);
        add(n.x, n.y, 'activeEnergy', (n.energy + n.boundEnergy) * active * 0.02, 1);
      }

      for (const p of this.eventPulses.slice(0, this.config.maxVisiblePulses)) {
        const life = Math.max(8, p.visualLife || 48);
        const t = clamp01((p.age + (p.visualOffset || 0)) / life);
        const sx = p.x + (p.tx - p.x) * t;
        const sy = p.y + (p.ty - p.y) * t;
        add(sx, sy, 'pulseDensity', p.intensity * 1.9, 1);
      }
    }

    for (const loop of this.cycleLoops.slice(0, 120)) {
      add(loop.cx, loop.cy, 'loopClosure', loop.score * (1 + loop.continuity), 2);
      add(loop.cx, loop.cy, 'particlePotential', loop.score * 0.55, 2);
    }

    if (!this.config.showFieldParticlesOnly) {
      for (const edge of this.edges.slice(0, Math.min(this.edges.length, 9000))) {
        if (edge.priorityScore < 0.36 && edge.circulationScore < 0.12) continue;
        const a = this.nodes[edge.a];
        const b = this.nodes[edge.b];
        add((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, 'resonancePriority', Math.max(edge.priorityScore, edge.circulationScore) * 0.10, 1);
      }
    }

    for (const p of this.particles.slice(0, 100)) {
      add(p.cx, p.cy, 'particlePotential', (p.formationStage * 1.7 + p.cycleDensity) * 1.15, 2);
      add(p.cx, p.cy, 'loopClosure', p.loopClosureScore * 0.55, 2);
    }

    let maxPulseDensity = 0;
    let maxContinuity = 0;
    let maxLoopClosure = 0;
    let maxParticlePotential = 0;
    let activeSum = 0;
    for (const c of raw) {
      maxPulseDensity = Math.max(maxPulseDensity, c.pulseDensity);
      maxContinuity = Math.max(maxContinuity, c.eventContinuity);
      maxLoopClosure = Math.max(maxLoopClosure, c.loopClosure);
      maxParticlePotential = Math.max(maxParticlePotential, c.particlePotential);
      activeSum += c.activeEnergy;
    }

    const smooth = clamp01(this.config.coarseFieldSmoothing);
    const prev = this.coarseField.length === raw.length ? this.coarseField : raw;
    const next = raw.map((c, i) => {
      const old = prev[i] ?? c;
      return {
        ...c,
        pulseDensity: old.pulseDensity * smooth + c.pulseDensity * (1 - smooth),
        eventContinuity: old.eventContinuity * smooth + c.eventContinuity * (1 - smooth),
        loopClosure: old.loopClosure * smooth + c.loopClosure * (1 - smooth),
        resonancePriority: old.resonancePriority * smooth + c.resonancePriority * (1 - smooth),
        particlePotential: old.particlePotential * smooth + c.particlePotential * (1 - smooth),
        activeEnergy: old.activeEnergy * smooth + c.activeEnergy * (1 - smooth)
      };
    });

    const normalize = (v: number, max: number) => clamp01(v / Math.max(1e-9, max));
    const boost = Math.max(0.05, this.config.coarseFieldIntensity);
    this.coarseField = next.map((c) => ({
      ...c,
      pulseDensity: clamp01(normalize(c.pulseDensity, maxPulseDensity) * boost),
      eventContinuity: clamp01(normalize(c.eventContinuity, maxContinuity) * boost),
      loopClosure: clamp01(normalize(c.loopClosure, maxLoopClosure) * boost),
      particlePotential: clamp01(normalize(c.particlePotential, maxParticlePotential) * boost),
      activeEnergy: clamp01((c.activeEnergy / Math.max(1e-9, activeSum / Math.max(1, count) * 4)) * boost),
      resonancePriority: clamp01(c.resonancePriority * boost)
    }));

    const activeCellRatio = this.coarseField.filter((c) => c.pulseDensity + c.eventContinuity + c.loopClosure + c.particlePotential > 0.18).length / Math.max(1, count);
    const meanActiveEnergy = this.coarseField.reduce((s, c) => s + c.activeEnergy, 0) / Math.max(1, count);

    this.cachedCoarseFieldMetrics = { cols, rows, maxPulseDensity, maxContinuity, maxLoopClosure, maxParticlePotential, activeCellRatio, meanActiveEnergy };
    return this.cachedCoarseFieldMetrics;
  }

  private emptyPulseGovernorMetrics(): PulseGovernorMetrics {
    return {
      activePulseCount: 0,
      targetPulseCount: 0,
      densityRatio: 0,
      governorScale: 1,
      emissionBudget: 0,
      emittedThisStep: 0,
      suppressedThisStep: 0,
      avgPulseIntensity: 0
    };
  }

  private computePulseGovernorMetrics(): PulseGovernorMetrics {
    const targetPulseCount = Math.max(12, Math.min(this.config.maxVisiblePulses, Math.floor(this.edges.length * this.config.targetPulseDensity)));
    const activePulseCount = this.eventPulses.length;
    const densityRatio = activePulseCount / Math.max(1, targetPulseCount);
    const avgPulseIntensity = activePulseCount ? this.eventPulses.reduce((s, p) => s + p.intensity, 0) / activePulseCount : 0;
    return {
      activePulseCount,
      targetPulseCount,
      densityRatio,
      governorScale: this.lastGovernorScale,
      emissionBudget: this.lastEmissionBudget,
      emittedThisStep: this.emittedPulseCount,
      suppressedThisStep: this.suppressedPulseCount,
      avgPulseIntensity
    };
  }

  private emptyEventCycleMetrics(): EventCycleMetrics {
    return {
      activePulseCount: 0,
      cycleBondCount: 0,
      avgEventActivity: 0,
      avgEventContinuity: 0,
      avgCycleContinuity: 0,
      stableLoopCount: 0,
      avgLoopClosureError: 0,
      energyActivity: 0,
      voidNodeRatio: 1
    };
  }

  private computeEventCycleMetrics(): EventCycleMetrics {
    const n = Math.max(1, this.nodes.length);
    const avgEventActivity = this.nodes.reduce((s, node) => s + node.eventActivity, 0) / n;
    const avgEventContinuity = this.nodes.reduce((s, node) => s + node.eventContinuity, 0) / n;
    const energyActivity = this.nodes.reduce((s, node) => s + (node.energy + node.boundEnergy) * Math.max(node.eventActivity, node.eventContinuity, node.cycleMemory), 0) / Math.max(1e-9, this.currentTotalEnergy());
    const voidNodeRatio = this.nodes.filter((node) => node.eventActivity < 0.015 && node.eventContinuity < 0.015 && node.cycleMemory < 0.015).length / n;
    const cycleBondCount = this.edges.filter((e) => e.kind === 'cycle-bond').length;
    const stableLoops = this.cycleLoops.filter((l) => l.score >= this.config.cycleBondThreshold * 0.72);
    const avgLoopClosureError = this.cycleLoops.length ? this.cycleLoops.reduce((s, l) => s + l.phaseClosureError, 0) / this.cycleLoops.length : 0;
    const avgCycleContinuity = this.cycleLoops.length ? this.cycleLoops.reduce((s, l) => s + l.continuity, 0) / this.cycleLoops.length : 0;
    return {
      activePulseCount: this.eventPulses.length,
      cycleBondCount,
      avgEventActivity,
      avgEventContinuity,
      avgCycleContinuity,
      stableLoopCount: stableLoops.length,
      avgLoopClosureError,
      energyActivity,
      voidNodeRatio
    };
  }

  private emptyForceDecomposition(): ForceDecompositionMetrics {
    return {
      resonanceAttraction: 0,
      impedanceAlignment: 0,
      massBondCohesion: 0,
      gravityLike: 0,
      electromagneticAttraction: 0,
      electromagneticRepulsion: 0,
      dampingLoss: 0,
      randomMotion: 0,
      centerBias: 0,
      boundaryEffect: 0,
      totalCohesion: 0,
      totalDispersion: 0,
      normalizedCohesion: 0,
      localClusterBias: 0
    };
  }

  private forceAllowed(kind: 'resonance' | 'impedance' | 'massBond' | 'gravity' | 'em' | 'weak' | 'damping' | 'random'): boolean {
    const mode = this.config.forceIsolationMode;
    if (mode === 'resonance-only') return kind === 'resonance' || kind === 'damping' || kind === 'random';
    if (mode === 'impedance-only') return kind === 'impedance' || kind === 'damping' || kind === 'random';
    if (mode === 'mass-bond-only') return kind === 'massBond' || kind === 'damping' || kind === 'random';
    return true;
  }

  private finalizeForceDecomposition(spatial: { spreadRatio: number; occupancyRatio: number; meanNearestDistance: number; cohesionIndex: number }): ForceDecompositionMetrics {
    const f = { ...this.forceDecomposition };
    f.gravityLike = this.config.disableGravityLike ? 0 : f.gravityLike;
    f.dampingLoss = this.config.disableDamping ? 0 : f.dampingLoss;

    f.totalCohesion =
      f.resonanceAttraction +
      f.impedanceAlignment * 0.45 +
      f.massBondCohesion +
      f.gravityLike +
      f.electromagneticAttraction;

    f.totalDispersion =
      f.electromagneticRepulsion +
      f.dampingLoss * 0.35 +
      f.randomMotion * 0.25 +
      f.boundaryEffect * 0.30;

    f.normalizedCohesion = f.totalCohesion / Math.max(1e-9, f.totalCohesion + f.totalDispersion);
    // 높을수록 “국소적으로 뭉치되 화면 전체 중심으로 한 덩어리 수렴하지 않는” 형태에 가깝습니다.
    f.localClusterBias = clamp01(spatial.cohesionIndex * (0.35 + 0.65 * spatial.occupancyRatio) * (1 - clamp01(f.centerBias / Math.max(1e-6, f.totalCohesion + f.totalDispersion))));
    return f;
  }

  private currentTotalEnergy(): number { return this.nodes.reduce((sum, n) => sum + n.energy + n.boundEnergy, 0); }
  private massFromEnergy(e: number, bound: number): number { return (e + 1.8 * bound) / Math.max(1, this.config.ctRatio * this.config.ctRatio); }
  private normalizedLTQ(ct: number): number { return Math.pow(ct, -1.5); }
  private ctSimulationFactor(): number { return clamp(1 + Math.log10(Math.max(this.config.ctRatio, 1)) * 0.16, 0.2, 2.8); }
  private edgeKey(a: number, b: number): string { return a < b ? `${a}-${b}` : `${b}-${a}`; }
  private colorComplement(a: number, b: number): boolean { return a !== b; }

  private targetRestEnergyJ(): number {
    if (this.config.targetParticlePreset === 'proton') return PROTON_REST_ENERGY_J;
    if (this.config.targetParticlePreset === 'custom') return Math.max(1e-99, this.config.customTargetRestEnergyJ);
    return ELECTRON_REST_ENERGY_J;
  }

  private physicalScale(): PhysicalScaleInfo {
    const planckLengthM = Math.max(1e-99, this.config.planckLengthM);
    const planckEnergyJ = Math.max(1e-99, this.config.planckEnergyJ);
    const planckTimeS = Math.max(1e-99, this.config.planckTimeS);
    const timeCompressionFactor = Math.max(1, this.config.timeCompressionFactor);
    const crossingVisualSeconds = Math.max(1, this.config.crossingVisualSeconds);
    const visualStepsPerSecond = Math.max(1, this.config.visualStepsPerSecond);
    const measuredStepsPerSecond = Math.max(0, this.config.measuredStepsPerSecond);
    const effectiveStepsPerSecond = measuredStepsPerSecond > 0.5 ? measuredStepsPerSecond : visualStepsPerSecond;
    const particleEffectiveRadiusM = Math.max(planckLengthM, this.config.particleEffectiveRadiusM);
    const targetRestEnergyJ = this.targetRestEnergyJ();

    const linearRatio = particleEffectiveRadiusM / planckLengthM;
    const realTaegeukjaPerParticle = Math.pow(linearRatio, 3);
    const visibleNodesPerParticle = Math.max(1, this.config.nodesPerParticleBase || 100);
    const realTaegeukjaPerVisibleNode = realTaegeukjaPerParticle / visibleNodesPerParticle;
    const totalParticleCapacityInView = this.config.nodeCount / visibleNodesPerParticle;

    const particleRadiusCrossingTimeS = particleEffectiveRadiusM / C_LIGHT;
    const particleRadiusCrossingTicks = particleRadiusCrossingTimeS / planckTimeS;
    const particleDiameterCrossingTimeS = 2 * particleRadiusCrossingTimeS;
    const particleDiameterCrossingTicks = 2 * particleRadiusCrossingTicks;

    const electronComptonPeriodS = PLANCK_CONSTANT_H / ELECTRON_REST_ENERGY_J;
    const electronComptonTicks = electronComptonPeriodS / planckTimeS;
    const protonComptonPeriodS = PLANCK_CONSTANT_H / PROTON_REST_ENERGY_J;
    const protonComptonTicks = protonComptonPeriodS / planckTimeS;

    const physicalSecondsPerVisualStep = planckTimeS * timeCompressionFactor;
    const physicalSecondsPerVisualSecond = physicalSecondsPerVisualStep * effectiveStepsPerSecond;
    const expectedCrossingVisualSeconds = particleRadiusCrossingTicks / Math.max(1e-99, timeCompressionFactor * effectiveStepsPerSecond);
    const elapsedVisualSecondsAtCurrentSps = this.tick / effectiveStepsPerSecond;
    const elapsedPlanckTicks = this.tick * timeCompressionFactor;
    const elapsedPhysicalSeconds = elapsedPlanckTicks * planckTimeS;
    const crossingProgressFraction = elapsedPlanckTicks / Math.max(1e-99, particleRadiusCrossingTicks);
    const electronComptonProgressFraction = elapsedPlanckTicks / Math.max(1e-99, electronComptonTicks);
    const protonComptonProgressFraction = elapsedPlanckTicks / Math.max(1e-99, protonComptonTicks);

    const effectiveEnergyPerRealTaegeukjaJ = targetRestEnergyJ / realTaegeukjaPerParticle;
    const effectiveEnergyOccupancyOfPlanck = effectiveEnergyPerRealTaegeukjaJ / planckEnergyJ;
    const representativeEnergyPerNodeJ = targetRestEnergyJ / visibleNodesPerParticle;
    const energyUnitJ = representativeEnergyPerNodeJ / Math.max(1e-9, this.config.energyPerNode);
    const massUnitKg = energyUnitJ / (C_LIGHT * C_LIGHT);

    return {
      planckLengthM,
      planckEnergyJ,
      planckTimeS,
      timeCompressionFactor,
      crossingVisualSeconds,
      visualStepsPerSecond,
      measuredStepsPerSecond,
      autoCalibrateTimeCompression: this.config.autoCalibrateTimeCompression,
      effectiveStepsPerSecond,
      particleEffectiveRadiusM,
      targetRestEnergyJ,
      linearRatio,
      realTaegeukjaPerParticle,
      visibleNodesPerParticle,
      realTaegeukjaPerVisibleNode,
      totalParticleCapacityInView,
      particleRadiusCrossingTimeS,
      particleRadiusCrossingTicks,
      particleDiameterCrossingTimeS,
      particleDiameterCrossingTicks,
      electronComptonPeriodS,
      electronComptonTicks,
      protonComptonPeriodS,
      protonComptonTicks,
      physicalSecondsPerVisualStep,
      physicalSecondsPerVisualSecond,
      expectedCrossingVisualSeconds,
      elapsedVisualSecondsAtCurrentSps,
      elapsedPlanckTicks,
      elapsedPhysicalSeconds,
      crossingProgressFraction,
      electronComptonProgressFraction,
      protonComptonProgressFraction,
      effectiveEnergyPerRealTaegeukjaJ,
      effectiveEnergyOccupancyOfPlanck,
      representativeEnergyPerNodeJ,
      energyUnitJ,
      massUnitKg,
      completeParticleFraction: this.config.completeParticleFraction,
      stableParticleAge: this.config.stableParticleAge,
      adaptiveNodeRendering: this.config.adaptiveNodeRendering,
      disableResonanceTerm: this.config.disableResonanceTerm,
      disableImpedanceTerm: this.config.disableImpedanceTerm,
      disableColorTerm: this.config.disableColorTerm,
      disableEnergyCorrection: this.config.disableEnergyCorrection,
      randomBondModel: this.config.randomBondModel
    };
  }

  private clearForceAccumulators(n: TaegukjaNode): void { n.forceStrongX = n.forceStrongY = n.forceEmX = n.forceEmY = n.forceWeakX = n.forceWeakY = n.forceGravityX = n.forceGravityY = 0; }
  private addNodeForce(n: TaegukjaNode, kind: 'strong' | 'em' | 'weak' | 'gravity', fx: number, fy: number): void {
    if (kind === 'strong') { n.forceStrongX += fx; n.forceStrongY += fy; }
    if (kind === 'em') { n.forceEmX += fx; n.forceEmY += fy; }
    if (kind === 'weak') { n.forceWeakX += fx; n.forceWeakY += fy; }
    if (kind === 'gravity') { n.forceGravityX += fx; n.forceGravityY += fy; }
  }
}
