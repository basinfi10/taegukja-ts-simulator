
# Taegeukja Simulator v8.4.1 — Resonance Priority Search Engine

## 버전 확인

현재 패키지 버전은 `8.4.1`입니다.

```bash
node -p "require('./package.json').version"
```

예상 출력:

```txt
8.4.1
```

## Git 업로드 준비

압축을 푼 뒤 아래 순서로 Git 저장소를 초기화하고, 기본 브랜치를 `main`으로 맞출 수 있습니다.

```bash
git init
git add .
git commit -m "Initial commit: Taegeukja simulator v8.4.1"
git branch -M main
```

원격 저장소를 이미 만들었다면 다음처럼 연결합니다.

```bash
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```

이미 Git 저장소가 있는 폴더라면 `git init`은 생략해도 됩니다. 핵심은 기본 브랜치를 다음 명령으로 `main`에 맞추는 것입니다.

```bash
git branch -M main
```

## 실행

```bash
npm install
npm run dev
```

## 빌드 검증

```bash
npm run build
```


## v8.4.1 핵심 기능 요약

이 버전은 v8.3의 이벤트 순환 엔진 위에 **공진 우선순위 탐색 엔진**을 추가한 패키지입니다.

핵심 질문:

```txt
태극자들은 서로 공진을 어떻게 “알고” 연결 우선순위가 생기는가?
```

v8.4.1의 답은 다음입니다.

```txt
태극자가 미리 아는 것이 아니라,
후보 연결에 시험 pulse를 흘려보고,
위상·주파수·임피던스·에너지 흐름·이벤트 연속성·과거 pulse 성공률·루프 폐합 가능성이 높은 연결만 살아남습니다.
```

연결 우선순위 계산 항목:

```txt
1. 공간 근접성
2. 전달 지연을 포함한 위상 정합
3. 주파수 정수비 공진
4. 임피던스 정합
5. 에너지 흐름 가능성
6. 이벤트 연속성
7. 과거 pulse 성공률
8. 루프 폐합 가능성
```

새 UI:

```txt
- 연결 우선순위 패널
- 선택/보류 후보 표시
- Canvas 후보 점선 표시
- 평균 edge 우선순위
- pulse 성공 이력
- 루프 폐합 가능성
- 실패 연결 약화 카운트
```



---

# 태극자 TypeScript 시뮬레이터 v8.4.1 - 공진 우선순위 탐색 엔진

이 프로젝트는 태극자 우주론 문서의 개념을 TypeScript + React + Canvas 기반으로 옮긴 연구용 시뮬레이터입니다.

v8.4.1의 핵심 목표는 단순히 “입자가 보이게 만드는 것”이 아니라, **입자 생성이 태극자 규칙에 의존하는지**를 검증하는 것입니다. 정상 규칙과 대조군을 같은 seed 계열로 반복 실행해, 입자가 공진·임피던스·색 보완성·에너지 보존 구조 때문에 생기는지, 아니면 코드가 과결합되어 아무 조건에서도 입자가 생기는지를 비교합니다.

```txt
정상 태극자 규칙
vs
공진 OFF
임피던스 OFF
색 보완성 OFF
에너지 보정 OFF
랜덤 결합 모델
```

## 실행 방법

```bash
cd taegukja-ts-simulator-v8-4-1-resonance-priority
npm install
npm run dev
```

브라우저 주소:

```txt
http://localhost:5173
```

빌드 확인:

```bash
npm run build
```

## v8.4.1까지 누적된 핵심

### 1. 반증 모드

새 패널:

```txt
v8 반증 모드 · 반복 검증
```

기본값은 다음입니다.

```txt
모드당 반복: 20회
run당 스텝: 420
```

각 모드마다 같은 seed 계열로 반복 실행하고 다음 값을 집계합니다.

```txt
stable 성공률
complete 성공률
평균 stable 수
평균 mass-bond 수
평균 최대 입자 스케일
평균 soliton score
평균 에너지 drift
```

### 2. 검증 모드 목록

```txt
1. 정상 태극자 규칙
2. 공진 OFF
3. 임피던스 OFF
4. 색 보완성 OFF
5. 에너지 보정 OFF
6. 랜덤 결합 모델
```

정상 규칙에서만 안정/완성 후보가 잘 생기고, 대조군에서 급감하면 내부 모델의 규칙 의존성이 커집니다. 반대로 대조군에서도 비슷하게 생기면 현재 엔진은 이론 규칙보다 그래프/결합 임계값 자체가 입자를 만들고 있을 가능성이 있습니다.

### 3. 엔진 플래그

`SimulationConfig`에 다음 플래그가 추가되었습니다.

```ts
disableResonanceTerm: boolean;
disableImpedanceTerm: boolean;
disableColorTerm: boolean;
disableEnergyCorrection: boolean;
randomBondModel: boolean;
```

`src/model/verification.ts`가 이 플래그를 사용해 정상 모델과 대조군을 자동 생성합니다.

## 스케일 정의

```txt
태극자 길이 ℓ_TQ = 1.616255 × 10^-35 m
소립자 유효 반경 r = 1 × 10^-19 m

N_particle = (r / ℓ_TQ)^3
           ≈ 2.37 × 10^47
```

v8 기준:

```txt
대표 셀 1000개 = 소립자 1개 스케일
대표 셀 1개 = 2.37 × 10^47 / 1000
             ≈ 2.37 × 10^44 실제 태극자 대표
```

3000개 노드는 `2.37e47 / 3000`으로 다시 나누는 것이 아니라, 기본 1000셀 1입자 기준에서 입자 후보를 약 3개까지 담는 연구용 상한입니다.

## 해석 기준

v8.4.1에서 입자가 생성된다고 해서 태극자 이론이 실제 물리학적으로 증명되는 것은 아닙니다. 현재 의미는 다음입니다.

```txt
입자 생성 있음
= 태극자 문서의 공진·임피던스·결합·에너지 보존 규칙을 코드로 옮겼을 때
  안정 질량-like 클러스터가 생길 수 있음

입자 생성 있음
≠ 전자·쿼크·양성자가 실제로 태극자로 구성된다는 실험적 증명
```

반증 모드의 목적은 다음 질문에 답하는 것입니다.

```txt
입자가 규칙 때문에 생기는가?
아니면 그냥 어떤 조건에서도 생기도록 코드가 과결합되었는가?
```

## 파일 구조

```txt
src/model/taegukjaEngine.ts        핵심 시뮬레이션 엔진
src/model/verification.ts          v8 반증 검증 실행기
src/model/types.ts                 타입 정의
src/model/defaults.ts              기본 설정
src/model/math.ts                  수학 보조 함수
src/model/prng.ts                  재현 가능한 난수
src/model/theoryNotes.ts           이론 설명 카드

src/components/CanvasView.tsx      캔버스 렌더링
src/components/Controls.tsx        설정 UI
src/components/MetricsPanel.tsx    관측값 UI
src/components/ParticleCandidates.tsx 입자 후보 UI
src/components/FormationLog.tsx    형성/붕괴/상호작용 로그
src/components/VerificationPanel.tsx v8 반증 검증 UI
src/components/Manual.tsx          이론-코드 대응 설명
```

## 이론-코드 대응

| 이론 개념 | 코드 구현 |
|---|---|
| 태극자 대표 셀 | `TaegukjaNode` |
| 공간 그래프 | `nodes`, `edges` |
| 연결 거리 `d_TQ` | `shortestPath()` |
| 순환 고리 | `phase`, `omega`, `sigma` |
| 태극 이중성 | `sigma`, `charge`, `weakState` |
| 공진 | `edge.resonance` |
| 임피던스 정합 | `edge.impedanceMatch` |
| 색 보완성 | `colorComplement()` |
| 에너지 흐름 | `edge.flow` |
| 질량 결합 | `edge.binding`, `mass-bond` |
| 입자 후보 | `detectParticles()`, `makeParticle()` |
| 입자쌍 효과장 | `applyParticlePairInteractions()` |
| 반증 검증 | `runVerificationSuite()` |

## 주의

이 시뮬레이터는 표준모형이나 양자장론을 대체하는 물리 엔진이 아닙니다. 태극자 문서의 아이디어를 계산 가능한 현상론적 구조로 옮긴 연구용 도구입니다. v8.4.1은 이 구조가 스스로를 검증/반증할 수 있도록 대조군 비교를 추가한 버전입니다.


## v8.4.1 초기 로드 분산장 보강

v8.4.1의 핵심 수정은 초기 태극자 로드가 이미 중심에 뭉쳐 있는 문제를 제거한 것입니다.

- 기본 초기 배치: `전 화면 균일 랜덤장`
- 기본 초기 연결: `공간 근접 연결`
- 1000개든 3000개든 화면 전체에 먼저 퍼진 상태에서 시작
- 이후 근접 연결, 에너지 흐름, 공진 정합, 임피던스 정합을 거쳐 국소 뭉침이 생기는지 관찰
- 관측값에 `분산도`, `격자 점유율`, `최근접 거리`, `뭉침 지수` 추가

중심 구름 배치는 비교용으로 남겨두었지만, 기본값은 사용하지 않습니다. 이론 검증 관점에서는 처음부터 뭉쳐 있으면 안 되고, 분산 상태에서 공진으로 효율적 순환 경로가 생기며 뭉치는지를 봐야 합니다.


## v8.4.1 추가: 뭉침 원인 분해와 중앙 끌림 검증

v8.4.1는 넓게 퍼진 태극자 로드가 시간이 지나며 뭉칠 때, 그 원인이 무엇인지 숨기지 않고 수치로 표시합니다.

추가된 관측값:

- 공진 기여도
- 임피던스 정합 기여도
- mass-bond 응집 기여도
- 중력-like 기여도
- 전자기 인력/반발 기여도
- damping 영향
- 랜덤/초기 운동 영향
- 중앙 수렴 편향(centerBias)
- 국소 클러스터성(localClusterBias)

추가된 설정:

- 전체 힘 사용
- 공진 인력만 보기
- 임피던스 정합만 보기
- mass-bond만 보기
- 중력-like OFF
- damping OFF
- 중앙 끌림 완전 차단
- 전체 평균 위치 고정 금지

중요한 검증 기준:

정상 규칙에서만 국소 클러스터가 생기고, 공진 OFF/임피던스 OFF/랜덤 결합 모델에서 안정 클러스터가 급격히 줄어야 태극자 규칙의 내부 동역학 의미가 커집니다. 반대로 대조군에서도 똑같이 잘 뭉치면 코드 편향입니다.


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


## 이번 ZIP 검증 기록

```txt
package.json version: 8.4.1
Git branch command: git branch -M main
Build command: npm run build
```

아래 명령으로 사용자가 직접 확인할 수 있습니다.

```bash
node -p "require('./package.json').name"
node -p "require('./package.json').version"
git branch --show-current
npm run build
```

예상 버전 출력:

```txt
8.4.1
```
