# Taegeukja Simulator v8.6 — Stable Particle Verifier

## 버전 확인

```bash
node -p "require('./package.json').name"
node -p "require('./package.json').version"
```

예상 출력:

```txt
taegukja-ts-simulator-v8-6-stable-verifier
8.6.0
```

## 실행

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
```

## v8.6 핵심 목표

v8.5.9에서는 전역 포화를 줄이고 10개 안팎의 지역 입자 후보가 생겼습니다.  
v8.6은 여기서 한 단계 더 나아가 “입자 후보가 정말 안정적으로 살아남는가?”를 검증합니다.

## 새 기능

### 1. Stable Particle Verifier

각 입자 후보에 대해 다음 값을 추적합니다.

```txt
survivalTicks
stableVerifierScore
internalBondRatio
externalBondRatio
continuityTrend
mergeRisk
decayRisk
verifierStatus
```

### 2. 안정 판정 강화

기존 stable 판정은 후보 age와 solitonScore 중심이었습니다.  
v8.6에서는 다음 조건을 함께 봅니다.

```txt
생존 시간
crossing 진행률
cycle continuity history
내부 결합 비율
외부 결합 비율
verifier score
```

### 3. Merge / Decay Event

후보가 외부 결합에 먹힐 위험이 크면 `merge-risk`, 일정 시간 사라지면 `decay` 이벤트를 기록합니다.

### 4. 저장 데이터 확장

JSON 저장에 다음이 추가됩니다.

```txt
particleHistories
particleTransitions
stableVerifierMetrics
```

## 관찰 목표

```txt
particleCount: 8~15
completeParticleCount: 5~12
verifiedStableCount: 2~5
largestParticleScaleFraction: 0.8~1.8
avgEventContinuity: 0.65~0.90
avgInternalBondRatio: 0.55 이상
avgExternalBondRatio: 0.45 이하
```
