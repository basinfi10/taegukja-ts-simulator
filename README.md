# Taegeukja Simulator v8.5.6 — Visual Flow + Export

## 버전 확인

```bash
node -p "require('./package.json').name"
node -p "require('./package.json').version"
```

예상 출력:

```txt
taegukja-ts-simulator-v8-5-6-visual-export
8.5.6
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

## v8.5.6 핵심 수정

사용자 캡처 기준으로 확인된 문제:

```txt
1. 실측 SPS가 0.6까지 떨어짐
2. 화면에 formation event label 텍스트가 너무 많이 표시됨
3. mass-bond 노란 edge가 너무 많이 굵게 렌더링됨
4. 시각적 움직임이 느리거나 단계별로 보임
5. 진행 결과를 저장할 수 없어 후속 분석이 어려움
```

수정:

```txt
1. 엔진 스텝/프레임, catch-up step, 시뮬레이션 속도 배율 추가
2. formation label 기본 OFF
3. particle interaction line 기본 OFF
4. mass-bond/cycle-bond 표시 비율 조절
5. edge 투명도 기본 축소
6. edge/node 기본 렌더링 예산 축소
7. 결과 보고서 JSON 저장
8. 전체 상태 JSON 저장
```

## 저장 기능

상단 선택 태극자 카드에 버튼이 추가됩니다.

```txt
결과 보고서 저장
전체 상태 저장
```

- 결과 보고서: metrics, particles, events, priority candidates, cycle loops, coarse field
- 전체 상태: config, snapshot 전체, 요약값

이 JSON 파일을 다시 ChatGPT에 올리면 결과 분석과 파라미터 튜닝을 이어갈 수 있습니다.
