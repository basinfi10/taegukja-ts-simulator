# v8 코드 설명

## 핵심 엔진

```txt
src/model/taegukjaEngine.ts
```

`TaegukjaEngine`이 전체 시뮬레이션을 담당합니다.

## step() 계산 흐름

```txt
refreshEdgePhysics()
→ 공진/임피던스/에너지 흐름 계산
→ mass-bond 결합 누적
→ 입자 주변 효과장 적용
→ 입자쌍 효과장 적용
→ 약력형 상태 전이
→ 위치·위상·에너지 갱신
→ 작은 에너지 잔차 보정
→ 연결 적응/새 연결 생성
→ 입자 후보 탐지
→ 관측값 계산
```

## v8 반증 플래그

`SimulationConfig`에 다음 플래그가 추가되었습니다.

```ts
disableResonanceTerm: boolean;
disableImpedanceTerm: boolean;
disableColorTerm: boolean;
disableEnergyCorrection: boolean;
randomBondModel: boolean;
```

이 플래그들은 `src/model/verification.ts`에서 자동으로 켜고 끄며, 같은 설정과 같은 seed 계열로 정상 모델과 대조군을 비교합니다.

## 반증 검증 실행기

```txt
src/model/verification.ts
```

주요 함수:

```txt
applyVerificationMode()
runVerificationSuite()
```

`runVerificationSuite()`는 다음 모드를 반복 실행합니다.

```txt
normal
resonance-off
impedance-off
color-off
energy-correction-off
random-bond
```

각 run은 새 `TaegukjaEngine`을 만들고 지정된 스텝 수만큼 진행한 뒤 다음 값을 수집합니다.

```txt
stableCount
completeCount
formingCount
massBondCount
largestScaleFraction
strongestSolitonScore
avgResonance
avgImpedanceMatch
energyDriftAfterCorrection
```

## 반증 판정 논리

정상 규칙에서 입자가 생기고, 대조군에서 생성률이 급감하면 `supports-model`로 표시합니다.

```txt
정상 규칙: stable/complete 생성률 높음
대조군: stable/complete 생성률 급감
→ 규칙 의존성 있음
```

반대로 대조군에서도 정상 규칙과 비슷하게 입자가 생기면 `weakens-model`로 표시합니다.

```txt
공진 OFF 또는 임피던스 OFF 또는 랜덤 결합 모델에서도 입자 생성률이 비슷함
→ 코드 과결합 또는 결합 임계값 문제 가능성
```

정상 규칙 자체에서 입자가 거의 생기지 않거나 차이가 애매하면 `inconclusive`로 표시합니다.

## 입자 후보 탐지

`detectParticles()`는 mass-bond 또는 높은 binding을 가진 연결 성분을 찾아 후보 클러스터를 만듭니다.

```txt
fragment: 작은 mass-bond 조각
forming: 공진/결합/스케일이 충분히 커지는 중
stable: 일정 틱 이상 유지된 후보
complete: 대표 셀 스케일상 완성 입자 조건을 만족한 후보
```

## 입자 후보 점수

`makeParticle()`는 다음 값을 조합해 `solitonScore`와 `formationStage`를 계산합니다.

```txt
위상 질서도
평균 결합도
색 중성도
결합 에너지 비율
대표 실제 태극자 수 완성률
안정 유지 시간
```

## 에너지 보존

v8은 v7과 같은 지역 보존 중심 구조를 유지합니다.

```txt
1. 엣지 에너지 흐름은 한쪽에서 빠진 만큼 다른 쪽에 더해짐
2. 자유 에너지 → 결합 에너지 전환은 국소 연결 안에서 발생
3. 마지막에 생기는 작은 수치 오차만 자유 에너지에 분산 보정
```

단, `energy-correction-off` 검증 모드에서는 `correctEnergyConservation()`의 전역 보정이 꺼집니다. 이때 입자 안정성이 크게 무너지면 전역 보정 의존성이 있었다는 뜻이고, 영향이 작으면 국소 흐름 자체가 비교적 안정적이라는 뜻입니다.

## UI

```txt
Controls.tsx              설정 변경
MetricsPanel.tsx          수치 관측
ParticleCandidates.tsx    상위 입자 후보
FormationLog.tsx          이벤트/상호작용 로그
VerificationPanel.tsx     v8 반증 검증 패널
Manual.tsx                이론 설명
```

## 빌드 검증

```bash
npm install
npm run build
```

## v8.2 분산장 수정

기존 중심 원반형 초기 배치는 입자 생성 검증에 불리했습니다. 초기 상태가 이미 중심 쪽에 모여 있으면 공진 규칙으로 뭉치는지, 단순히 뭉쳐 있는 상태를 유지하는지 분리하기 어렵기 때문입니다.

수정 사항:

1. `initialDistribution` 추가
   - `uniform-field`: 전 화면 균일 랜덤장
   - `grid-jitter`: 격자 기반 균일 분산
   - `ring-shell`: 외곽 링 셸
   - `center-cloud`: 비교용 중심 구름

2. `spatial-local` topology 추가
   - ID 순서 링 연결 대신 화면상 가까운 태극자끼리 약한 local edge를 만듭니다.
   - 이후 공진·임피던스·색 보완성이 맞는 연결만 강화되어 mass-bond로 성장합니다.

3. 동적 연결 생성 보정
   - 매 스텝 새 연결 후보를 완전 무작위가 아니라 근접 후보 위주로 탐색합니다.
   - 분산장에서 국소 에너지 순환망이 생긴 뒤 공진으로 강화되는 과정을 관찰하기 위한 변경입니다.

4. 공간 관측값 추가
   - `spatialSpreadRatio`
   - `fieldOccupancyRatio`
   - `meanNearestNeighborDistance`
   - `cohesionIndex`

이제 관찰 순서는 “초기 균일 분산 → 약한 근접 연결 → 에너지 흐름 → 공진 강화 → 국소 뭉침 → 안정/완성 후보 판정”입니다.


## v8.2 코드 변경 요약

### 핵심 파일

- `src/model/types.ts`
  - `ForceIsolationMode`
  - `ForceDecompositionMetrics`
  - `SimulationConfig.forceIsolationMode`
  - `disableGravityLike`, `disableDamping`, `blockCenterPull`, `forbidMeanPositionLock`

- `src/model/taegukjaEngine.ts`
  - `forceDecomposition` 누적 필드 추가
  - `edgeMechanicalForce()`를 공진/임피던스/mass-bond/전자기/중력-like 항으로 분리
  - `forceAllowed()`로 격리 모드 적용
  - `centerBias` 계산: 각 노드 힘이 전체 중심 방향으로 향하는 투영량을 누적
  - 명시적 중앙 끌림 항은 사용하지 않음. 중앙 수렴은 관측값으로만 감시

- `src/components/MetricsPanel.tsx`
  - v8.2 뭉침 원인 분해 카드 추가

- `src/components/Controls.tsx`
  - 힘 격리 모드
  - 중력-like OFF
  - damping OFF
  - 중앙 끌림 차단
  - 평균 위치 고정 금지 스위치 추가


## v8.3 에너지 보존 순환 이벤트 엔진

v8.3은 “에너지는 정지한 값이 아니라, 변화 이벤트가 연속적으로 이어질 때 유지된다”는 태극자 관점을 코드에 추가한 버전입니다.

추가된 구조:

- node.eventClock: 태극자 내부 변화 시계
- node.triggerPotential: 다음 사건을 유발할 잠재성
- node.eventActivity: 현재 변화 사건 활동성
- node.eventContinuity: 변화가 끊기지 않고 이어지는 정도
- edge.triggerDelay: 한 태극자의 변화가 다른 태극자에 도달하는 지연
- edge.pulseStrength: 엣지를 따라 전달되는 사건 pulse
- edge.eventContinuity: 엣지 전달 사건의 연속성
- edge.circulationScore: 닫힌 순환 루프에 참여하는 정도
- edge.kind = cycle-bond: 단순 mass-bond가 아니라 안정 순환 이벤트가 잠긴 결합

v8.3의 입자 후보는 단순히 노드가 뭉친 덩어리가 아니라, cycle-bond 루프 밀도와 이벤트 연속성을 함께 반영합니다.

검증 관점:

- eventActivity가 낮으면 에너지는 수치값으로는 남아도 “활동성 없는 무화 상태”에 가까움
- pulse가 edge를 타고 전달되어야 변화가 유지됨
- 닫힌 루프의 phase closure가 좋아야 cycle-bond가 생김
- requireCycleForParticle가 ON이면 mass-bond만으로 stable/complete 판정이 어려움


## v8.4 공진 우선순위 탐색 엔진

v8.4는 “태극자끼리 서로 공진을 어떻게 알고 연결 우선순위가 생기는가?”에 답하기 위해 추가된 버전입니다.

핵심 원리:

태극자는 미리 아는 것이 아니라, 후보 연결에 시험 pulse를 흘려보고 그 pulse가 더 잘 이어지는 연결만 살아남습니다.  
따라서 연결 우선순위는 사전 지식이 아니라 국소적 사건 반응과 반복 이력의 결과입니다.

추가된 연결 우선순위 항목:

- 공간 근접성
- 전달 지연을 포함한 위상 정합
- 주파수 정수비 공진 후보: 1:1, 1:2, 2:1, 2:3, 3:2 등
- 임피던스 정합
- 에너지 흐름 가능성
- 이벤트 연속성
- 과거 pulse 성공률
- 루프 폐합 가능성

추가된 구조:

- PriorityBreakdown
- PriorityCandidate
- PriorityMetrics
- edge.priorityScore
- edge.historySuccess
- edge.loopClosurePotential
- edge.pulseSuccess / pulseFail
- 실패 연결 자동 약화
- 선택/보류 후보 표시 패널

해석:

정상적인 모델에서는 공진 우선순위가 높은 연결이 pulse 성공률과 cycle-bond 형성률을 높여야 합니다.  
랜덤 결합이나 공진 OFF 상태에서도 비슷하게 잘 연결된다면 코드 편향을 의심해야 합니다.


## v8.4.1 패키징 변경

- `package.json` 버전을 `8.4.1`로 갱신했습니다.
- README에 Git 초기화, `git branch -M main`, 원격 저장소 연결, push 절차를 추가했습니다.
- v8.4의 공진 우선순위 탐색 엔진 기능 자체는 유지했습니다.


## v8.5 시간 압축/다입자 스케일 변경

- `nodesPerParticleBase` 기본값을 `100`으로 변경했습니다.
- 대표 로드 1개는 `2.37e47 / 100 ≈ 2.37e45` 실제 태극자를 대표합니다.
- `planckTimeS`, `timeCompressionFactor`, `crossingVisualSeconds`, `visualStepsPerSecond`, `measuredStepsPerSecond`, `autoCalibrateTimeCompression`을 추가했습니다.
- 브라우저 실행 중 실제 처리 SPS를 측정하고, `autoCalibrateTimeCompression`이 켜져 있으면 `timeCompressionFactor`를 자동 보정합니다.
- 목표식: `timeCompressionFactor = particleRadiusCrossingTicks / (crossingVisualSeconds × measuredSPS)`.
- 컴퓨터 처리 속도에 따라 5분 체감 crossing 시간이 유지되도록 합니다.


## v8.5 코드 변경 요약

- `SimulationConfig`에 `planckTimeS`, `timeCompressionFactor`, `crossingVisualSeconds`, `visualStepsPerSecond`, `measuredStepsPerSecond`, `autoCalibrateTimeCompression` 추가
- `PhysicalScaleInfo`에 실제 시간 스케일, crossing tick, Compton tick, 진행률 추가
- `App.tsx`에서 브라우저 실제 처리 SPS를 측정하고 자동 시간 보정 수행
- `nodesPerParticleBase` 기본값을 100으로 변경
- `MetricsPanel`에 실제 시간 스케일 카드 추가
- `Controls`에 시간 압축/실측 SPS 설정 추가


## v8.5.1 동작성 수정

점검 결과 v8.5.0은 시간 스케일 UI는 정상이나, 이벤트 순환 엔진이 기본값에서 너무 보수적으로 설정되어 pulse가 거의 발생하지 않았습니다.

수정 사항:

```ts
const testPulseDrive =
  testPulseStrength * priorityScore * (...) * (0.45 + activity)

const drive =
  eventCouplingStrength * resonance * impedance * (...) * closureGate
  + testPulseDrive
```

기본값도 조정했습니다.

```txt
eventTriggerThreshold: 0.026
eventPulseDecay: 0.94
eventCouplingStrength: 1.85
activityDecay: 0.992
continuityGain: 0.18
continuityDecay: 0.012
cycleBondThreshold: 0.36
```

이제 기본 실행에서 pulse, cycle-bond, 우선순위 후보가 관측되어야 합니다.


## v8.5.2 코드 변경 요약

- `SimulationConfig`에 pulse density governor 설정 추가
- `EventPulse`에 `visualLife`, `visualOffset`, `visualSpeed` 추가
- `PulseGovernorMetrics` 추가
- `processEventCirculation()`에서 target pulse count, density ratio, governorScale, emissionBudget 계산
- pulse 과밀 시 발생 억제, 부족 시 저밀도 boost 적용
- `CanvasView`에서 pulse 이동을 smoothstep 보간으로 표시
- `MetricsPanel`에 pulse governor card 추가
- `Controls`에 pulse governor 설정 추가


## v8.5.3 코드 변경 요약

- `CoarseFieldCell`, `CoarseFieldMetrics` 추가
- `SimulationSnapshot.coarseField` 추가
- `SimulationMetrics.coarseFieldMetrics` 추가
- `TaegukjaEngine.updateCoarseEventField()` 추가
- `CanvasView`에 coarse event field 배경 렌더링 추가
- `Controls`에 coarse field 설정 추가
- `MetricsPanel`에 coarse field 관측 카드 추가


## v8.5.6 성능 패치 요약

- `SimulationConfig.performanceMode` 추가
- `renderSnapshotFps`, `heavyMetricInterval`, `particleDetectionInterval`, `cycleDetectionInterval`, `coarseFieldInterval` 추가
- `maxRenderedEdges`, `maxRenderedNodes` 추가
- `PerformanceMetrics` 추가
- `App.tsx`에서 snapshot 갱신을 renderSnapshotFps로 throttling
- `CanvasView`에서 전체 edge 렌더링 대신 중요 edge + stride sampling
- `CanvasView`에서 forceView 기본 event일 때 힘 벡터 렌더링 생략
- `TaegukjaEngine.samplePathStats()` 캐싱
- `detectParticles()`, `detectEventCycles()`, `updateCoarseEventField()` interval scheduling
- step마다 coarseField를 비우던 문제 제거
