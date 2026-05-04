import type { SimulationSnapshot } from '../model/types';

function fmtSci(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '∞';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e4 || abs < 1e-3) return value.toExponential(digits);
  return value.toFixed(digits);
}

function Bar({ label, value, max = 1 }: { label: string; value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className="bar-row"><span>{label}</span><div><i style={{ width: `${pct}%` }} /></div><b>{fmtSci(value, 2)}</b></div>;
}

export function MetricsPanel({ snapshot }: { snapshot: SimulationSnapshot }) {
  const m = snapshot.metrics;
  const s = m.scale;
  const f = m.forceDecomposition;
  const c = m.eventCycleMetrics;
  const q = m.priorityMetrics;
  const g = m.pulseGovernorMetrics;
  const cf = m.coarseFieldMetrics;
  const pm = m.performanceMetrics;
  return (
    <aside className="panel metrics">
      <div className="panel-title">관측값 · v8.5.6 성능 병목/coarse 사건장</div>
      <div className="scale-card">
        <b>소립자 1개 목표 스케일</b>
        <code>N_real = (r / ℓ_TQ)³</code>
        <div><span>선형 비율 r/ℓ_TQ</span><strong>{fmtSci(s.linearRatio)}</strong></div>
        <div><span>실제 태극자/입자</span><strong>{fmtSci(s.realTaegeukjaPerParticle)}</strong></div>
        <div><span>대표 셀 1개 대표량</span><strong>{fmtSci(s.realTaegeukjaPerVisibleNode)}</strong></div>
        <div><span>입자 1개당 대표 셀</span><strong>{fmtSci(s.visibleNodesPerParticle)}</strong></div>
        <div><span>현재 화면 입자 수용량</span><strong>{fmtSci(s.totalParticleCapacityInView)}</strong></div>
        <div><span>유효 에너지 점유율</span><strong>{fmtSci(s.effectiveEnergyOccupancyOfPlanck)}</strong></div>
        <div><span>노드 1개 에너지</span><strong>{fmtSci(s.representativeEnergyPerNodeJ)} J</strong></div>
      </div>

      <div className="scale-card time-card">
        <b>실제 시간 스케일 · 태극자 1 변화 = 1 플랑크 틱</b>
        <code>1 TQ event = 1 t_P = {fmtSci(s.planckTimeS)} s</code>
        <div><span>시간 압축 K_t</span><strong>{fmtSci(s.timeCompressionFactor)} ticks/step</strong></div>
        <div><span>화면 스텝 1개 실제 시간</span><strong>{fmtSci(s.physicalSecondsPerVisualStep)} s</strong></div>
        <div><span>실측 SPS</span><strong>{s.measuredStepsPerSecond > 0 ? s.measuredStepsPerSecond.toFixed(1) : '측정 전'}</strong></div>
        <div><span>적용 SPS</span><strong>{s.effectiveStepsPerSecond.toFixed(1)}</strong></div>
        <div><span>자동 시간 보정</span><strong>{s.autoCalibrateTimeCompression ? 'ON' : 'OFF'}</strong></div>
        <div><span>화면 1초 실제 시간</span><strong>{fmtSci(s.physicalSecondsPerVisualSecond)} s</strong></div>
        <div><span>반경 crossing 시간</span><strong>{fmtSci(s.particleRadiusCrossingTimeS)} s</strong></div>
        <div><span>반경 crossing ticks</span><strong>{fmtSci(s.particleRadiusCrossingTicks)}</strong></div>
        <div><span>전자 Compton 주기/ticks</span><strong>{fmtSci(s.electronComptonPeriodS)} s / {fmtSci(s.electronComptonTicks)}</strong></div>
        <div><span>양성자 Compton 주기/ticks</span><strong>{fmtSci(s.protonComptonPeriodS)} s / {fmtSci(s.protonComptonTicks)}</strong></div>
        <div><span>누적 플랑크 틱</span><strong>{fmtSci(s.elapsedPlanckTicks)}</strong></div>
        <div><span>누적 실제 시간</span><strong>{fmtSci(s.elapsedPhysicalSeconds)} s</strong></div>
        <div><span>예상 crossing 화면 시간</span><strong>{s.expectedCrossingVisualSeconds.toFixed(1)} s</strong></div>
        <div><span>실측 기준 경과 화면 시간</span><strong>{s.elapsedVisualSecondsAtCurrentSps.toFixed(1)} s</strong></div>
        <div><span>crossing 진행률</span><strong>{(s.crossingProgressFraction * 100).toFixed(3)}%</strong></div>
        <div><span>전자 Compton 진행률</span><strong>{(s.electronComptonProgressFraction * 100).toFixed(6)}%</strong></div>
      </div>

      <div className="metric-grid">
        <div><span>시뮬레이션 시간</span><b>{m.time.toFixed(2)}</b></div>
        <div><span>총 에너지</span><b>{m.totalEnergy.toFixed(2)}</b></div>
        <div><span>실제 에너지</span><b>{fmtSci(m.totalEnergyJ)} J</b></div>
        <div><span>자유/결합</span><b>{m.freeEnergy.toFixed(1)} / {m.boundEnergy.toFixed(1)}</b></div>
        <div><span>지역 보존 잔차</span><b>{fmtSci(m.localEnergyResidual)}</b></div>
        <div><span>전역 보정량</span><b>{fmtSci(m.globalEnergyCorrection)}</b></div>
        <div><span>입자 후보</span><b>{m.particleCount}</b></div>
        <div><span>형성/안정</span><b>{m.formingParticleCount} / {m.stableParticleCount}</b></div>
        <div><span>완성 입자</span><b>{m.completeParticleCount}</b></div>
        <div><span>최대 완성률</span><b>{(m.largestParticleScaleFraction * 100).toFixed(1)}%</b></div>
        <div><span>질량 총합</span><b>{fmtSci(m.totalMassKg)} kg</b></div>
        <div><span>mass-bond</span><b>{m.massBondCount}</b></div>
        <div><span>cycle-bond</span><b>{c.cycleBondCount}</b></div>
        <div><span>활성 pulse</span><b>{c.activePulseCount}</b></div>
        <div><span>pulse 목표/비율</span><b>{g.targetPulseCount} / {(g.densityRatio * 100).toFixed(0)}%</b></div>
        <div><span>pulse 방출/억제</span><b>{g.emittedThisStep} / {g.suppressedThisStep}</b></div>
        <div><span>coarse field</span><b>{cf.cols}×{cf.rows}</b></div>
        <div><span>활성 field cell</span><b>{(cf.activeCellRatio * 100).toFixed(0)}%</b></div>
        <div><span>snapshot FPS</span><b>{pm.snapshotFps}</b></div>
        <div><span>edge/node 예산</span><b>{pm.renderedEdgeBudget} / {pm.renderedNodeBudget}</b></div>
        <div><span>우선순위 후보</span><b>{q.candidateCount}</b></div>
        <div><span>선택/보류</span><b>{q.selectedCount} / {q.rejectedCount}</b></div>
        <div><span>평균 d_TQ</span><b>{Number.isFinite(m.avgDTQ) ? m.avgDTQ.toFixed(2) : '∞'}</b></div>
        <div><span>분산도</span><b>{(m.spatialSpreadRatio * 100).toFixed(0)}%</b></div>
        <div><span>격자 점유</span><b>{(m.fieldOccupancyRatio * 100).toFixed(0)}%</b></div>
        <div><span>최근접 거리</span><b>{m.meanNearestNeighborDistance.toFixed(1)} px</b></div>
        <div><span>뭉침 지수</span><b>{(m.cohesionIndex * 100).toFixed(0)}%</b></div>
      </div>
      <Bar label="crossing 진행률" value={Math.min(1, s.crossingProgressFraction)} />
      <Bar label="전자 Compton 진행률" value={Math.min(1, s.electronComptonProgressFraction)} />
      <Bar label="초기장 분산도" value={m.spatialSpreadRatio} />
      <Bar label="화면 격자 점유율" value={m.fieldOccupancyRatio} />
      <Bar label="뭉침 지수" value={m.cohesionIndex} />
      <div className="force-decomp-card performance-card">
        <b>v8.5.6 PC 성능 병목 점검</b>
        <small>전체 step은 계속 돌리되, React snapshot 복사·Canvas edge 렌더링·무거운 통계 계산을 제한합니다.</small>
        <div className="decomp-summary">
          <span>snapshot <b>{pm.snapshotFps} fps</b></span>
          <span>edge budget <b>{pm.renderedEdgeBudget}</b></span>
          <span>node budget <b>{pm.renderedNodeBudget}</b></span>
        </div>
        <div className="decomp-summary">
          <span>metric 간격 <b>{pm.heavyMetricInterval}</b></span>
          <span>particle 간격 <b>{pm.particleDetectionInterval}</b></span>
          <span>cycle/coarse <b>{pm.cycleDetectionInterval}/{pm.coarseFieldInterval}</b></span>
        </div>
        <code>주요 병목: getSnapshot 전체 복사 + Canvas 전체 edge 렌더링 + shortestPath/particle/cycle/coarse 통계</code>
        <code>해결: snapshot throttling + render budget + interval scheduling + coarse smoothing 유지</code>
      </div>

      <div className="force-decomp-card coarse-field-card">
        <b>v8.5.3 계층적 coarse-graining 사건장</b>
        <small>미시 사건 전체를 직접 표시하지 않고, 대표 pulse 밀도·연속성·루프 폐합률·입자 잠재장을 격자장으로 압축합니다.</small>
        <Bar label="pulse density max" value={cf.maxPulseDensity} />
        <Bar label="continuity max" value={cf.maxContinuity} />
        <Bar label="loop closure max" value={cf.maxLoopClosure} />
        <Bar label="particle potential max" value={cf.maxParticlePotential} />
        <Bar label="active cell ratio" value={cf.activeCellRatio} />
        <Bar label="mean active energy" value={cf.meanActiveEnergy} />
        <div className="decomp-summary">
          <span>grid <b>{cf.cols}×{cf.rows}</b></span>
          <span>active <b>{(cf.activeCellRatio * 100).toFixed(0)}%</b></span>
          <span>energy <b>{fmtSci(cf.meanActiveEnergy)}</b></span>
        </div>
        <code>field = pulseDensity + eventContinuity + loopClosure + particlePotential</code>
        <code>particle candidate = stabilized representative event field</code>
      </div>

      <div className="force-decomp-card pulse-governor-card">
        <b>v8.5.2 pulse density governor</b>
        <small>전체 태극자 사건을 모두 렌더링하지 않고, 대표 pulse 밀도를 목표값 근처로 유지합니다. 낮으면 보강하고, 높으면 억제합니다.</small>
        <Bar label="pulse 밀도 비율" value={g.densityRatio} max={2} />
        <Bar label="governor scale" value={g.governorScale} max={1.5} />
        <Bar label="평균 pulse 세기" value={g.avgPulseIntensity} />
        <div className="decomp-summary">
          <span>활성 <b>{g.activePulseCount}</b></span>
          <span>목표 <b>{g.targetPulseCount}</b></span>
          <span>예산 <b>{g.emissionBudget}</b></span>
        </div>
        <code>densityRatio = activePulse / targetPulse</code>
        <code>governorScale ↓ when density &gt; target, boost ↑ when density is too low</code>
      </div>

      <div className="force-decomp-card cycle-card">
        <b>v8.3 에너지 보존 순환 이벤트</b>
        <small>에너지는 정지한 값이 아니라, trigger → pulse → loop → cycle-bond로 이어지는 변화 사건의 연속성으로 해석합니다.</small>
        <Bar label="평균 이벤트 활동" value={c.avgEventActivity} />
        <Bar label="평균 이벤트 연속성" value={c.avgEventContinuity} />
        <Bar label="순환 루프 연속성" value={c.avgCycleContinuity} />
        <Bar label="에너지 활동성" value={c.energyActivity} />
        <Bar label="무화 노드 비율" value={c.voidNodeRatio} />
        <div className="decomp-summary">
          <span>pulse <b>{c.activePulseCount}</b></span>
          <span>cycle-bond <b>{c.cycleBondCount}</b></span>
          <span>stable loop <b>{c.stableLoopCount}</b></span>
        </div>
        <code>energy activity ≈ Σ(Eᵢ · max(activity, continuity, cycleMemory)) / ΣEᵢ</code>
        <code>cycle-bond 조건 ≈ phase closure + impedance continuity + event continuity</code>
      </div>
      <div className="force-decomp-card priority-card">
        <b>v8.4 공진 우선순위 탐색</b>
        <small>태극자가 서로를 “아는” 것이 아니라, 시험 pulse가 잘 이어지고 루프가 닫히는 연결만 우선순위가 올라갑니다.</small>
        <Bar label="평균 edge 우선순위" value={q.avgPriorityScore} />
        <Bar label="선택 후보 평균" value={q.avgSelectedPriority} />
        <Bar label="pulse 성공 이력" value={q.avgPulseHistory} />
        <Bar label="루프 폐합 가능성" value={q.loopPotentialAvg} />
        <div className="decomp-summary">
          <span>후보 <b>{q.candidateCount}</b></span>
          <span>선택 <b>{q.selectedCount}</b></span>
          <span>약화 <b>{q.failedEdgeDecayCount}</b></span>
        </div>
        <code>priority = distance + phase + integer-ratio frequency + impedance + flow + continuity + history + loop</code>
        <code>selection = test pulse success + closed-loop survival</code>
      </div>

      <div className="force-decomp-card">
        <b>v8.2 뭉침 원인 분해</b>
        <small>값은 물리 절대 단위가 아니라, 이번 프레임에서 뭉침/분산에 기여한 상대 활동량입니다.</small>
        <Bar label="공진 기여" value={f.resonanceAttraction} max={Math.max(1e-6, f.totalCohesion + f.totalDispersion)} />
        <Bar label="임피던스 정합" value={f.impedanceAlignment} max={Math.max(1e-6, f.totalCohesion + f.totalDispersion)} />
        <Bar label="mass-bond 응집" value={f.massBondCohesion} max={Math.max(1e-6, f.totalCohesion + f.totalDispersion)} />
        <Bar label="중력-like" value={f.gravityLike} max={Math.max(1e-6, f.totalCohesion + f.totalDispersion)} />
        <Bar label="전자기 인력" value={f.electromagneticAttraction} max={Math.max(1e-6, f.totalCohesion + f.totalDispersion)} />
        <Bar label="전자기 반발" value={f.electromagneticRepulsion} max={Math.max(1e-6, f.totalCohesion + f.totalDispersion)} />
        <Bar label="damping 영향" value={f.dampingLoss} max={Math.max(1e-6, f.totalCohesion + f.totalDispersion)} />
        <Bar label="랜덤/초기 운동" value={f.randomMotion} max={Math.max(1e-6, f.totalCohesion + f.totalDispersion)} />
        <Bar label="중앙 수렴 편향" value={f.centerBias} max={Math.max(1e-6, f.totalCohesion + f.totalDispersion)} />
        <Bar label="국소 클러스터성" value={f.localClusterBias} />
        <div className="decomp-summary">
          <span>총 응집 <b>{fmtSci(f.totalCohesion)}</b></span>
          <span>총 분산 <b>{fmtSci(f.totalDispersion)}</b></span>
          <span>응집 비율 <b>{(f.normalizedCohesion * 100).toFixed(1)}%</b></span>
        </div>
      </div>
      <Bar label="위상 질서도" value={m.orderParameter} />
      <Bar label="평균 공진" value={m.avgResonance} />
      <Bar label="임피던스 정합" value={m.avgImpedanceMatch} />
      <Bar label="엔트로피" value={m.entropy} />
      <Bar label="최대 솔리톤 점수" value={m.strongestSolitonScore} />
      <Bar label="최대 입자 완성률" value={m.largestParticleScaleFraction} />
      <Bar label="강력 활동" value={m.forceMetrics.strongActivity} max={2} />
      <Bar label="전자기 활동" value={m.forceMetrics.emActivity} max={1} />
      <Bar label="약력 활동" value={m.forceMetrics.weakActivity} max={1} />
      <Bar label="중력 활동" value={m.forceMetrics.gravityActivity} max={1} />
      <div className="formula-card">
        <b>v8 적용 관계식</b>
        <code>N_particle = (r_particle / ℓ_TQ)³</code>
        <code>N_visible_cell = N_particle / 1000  (기본 입자 1개 기준)</code>
        <code>ε_eff = E_rest / N_particle</code>
        <code>occupancy = ε_eff / E_P</code>
        <code>local ΔE_flow + ΔB_bind ≈ 0</code>
        <code>Σ(Eᵢ + Bᵢ) = constant + residual correction</code>
        <code>centerBias = Σ max(0, Fᵢ·(-rᵢ/|rᵢ|))</code>
        <code>localClusterBias ≈ cohesion × occupancy × (1 - centerBias)</code>
        <code>E_active ∝ event_rate × amplitude × circulation_continuity</code>
        <code>cycle-bond = stable(trigger loop) not just mass-bond</code>
      </div>
    </aside>
  );
}
