# Taegeukja Simulator v8.5.6 — Performance Governor + Coarse Event Field

## 버전 확인

```bash
node -p "require('./package.json').name"
node -p "require('./package.json').version"
```

예상 출력:

```txt
taegukja-ts-simulator-v8-5-4-performance
8.5.4
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

## Git main 브랜치 준비

```bash
git init
git add .
git commit -m "Initial commit: Taegeukja simulator v8.5.6"
git branch -M main
```

---

## v8.5.6 핵심: 어디에서 시간이 많이 걸렸나?

v8.5.3의 주요 병목은 다음이었습니다.

```txt
1. requestAnimationFrame마다 getSnapshot()이 nodes/edges 전체를 복사
2. Canvas가 매 snapshot마다 최대 12,000개 edge를 전부 렌더링
3. 기본 forceView='all'로 노드마다 여러 힘 벡터를 렌더링
4. samplePathStats에서 shortestPath를 여러 번 실행
5. detectParticles, detectEventCycles, updateCoarseEventField가 매 step 무겁게 실행
6. coarseField가 step마다 비워져 smoothing 효과가 약해짐
```

## v8.5.6 수정

```txt
1. snapshot 갱신 FPS 제한: 기본 24fps
2. edge 렌더링 예산 제한: 기본 3200개
3. node 렌더링 예산 제한: 기본 1600개
4. 기본 forceView='event'로 변경해 힘 벡터 렌더링 OFF
5. shortestPath 기반 heavy metric 캐싱
6. particle/cycle/coarse field 탐지 간격 설정
7. coarseField step별 초기화 제거
8. 성능 패널과 설정 추가
```

## 해석

엔진 step은 계속 진행하되, React state 복사와 Canvas 표시 비용을 줄입니다.  
움직임이 적어 보이면 다음 순서로 확인하세요.

```txt
1. measured SPS가 낮은가?
2. edge/node 예산이 너무 높은가?
3. snapshot FPS가 너무 낮은가?
4. coarse field smoothing이 너무 높은가?
5. forceView가 all인지 확인
```

일반 PC에서는 `forceView='event'`, edge 예산 2500~4000, snapshot 20~30fps가 적당합니다.
