# Taegeukja Simulator v8.5.9 — Anti-Saturation + Local Particle Splitting

## 버전 확인

```bash
node -p "require('./package.json').name"
node -p "require('./package.json').version"
```

예상 출력:

```txt
taegukja-ts-simulator-v8-5-9-anti-saturation
8.5.9
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

## v8.5.9 수정 이유

업로드된 v8.5.8 상태 데이터에서 다음 문제가 확인되었습니다.

```txt
tick: 315
running: true
measured SPS: 약 0.94
linkCount: 12000 최대치
massBondCount: 2633
cycleBondCount: 302
activePulseCount: 259 / target 260
avgEventActivity: 1
avgEventContinuity: 1
largestParticleSize: 1349
largestParticleScaleFraction: 13.49
```

즉 실행이 안 된 것이 아니라, 너무 빨리 과포화되어 하나의 거대 입자장으로 잠겼습니다.

## v8.5.9 핵심

```txt
1. 이벤트 포화 방지
2. eventActivity/continuity가 1에 붙는 현상 감쇠
3. 거대 connected component를 지역 입자 후보로 분리
4. maxLinks와 event coupling 기본값 완화
5. mass-bond/cycle-bond 과다 생성을 줄임
6. pulse governor 목표 밀도 하향
```

## 새 설정

```txt
enableAntiSaturation
targetEventActivity
eventSaturationDamping
splitLargeParticleComponents
maxParticleComponentFactor
```

## 관찰 목표

v8.5.9에서는 하나의 1349-node 거대 입자가 아니라, 100~180 node급 지역 입자 후보 여러 개가 생기는지 확인합니다.
