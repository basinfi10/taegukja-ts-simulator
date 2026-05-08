# Taegeukja Simulator v8.5.8 — Run Diagnostics + Fixed Run Controls

## 버전 확인

```bash
node -p "require('./package.json').name"
node -p "require('./package.json').version"
```

예상 출력:

```txt
taegukja-ts-simulator-v8-5-8-run-diagnostics
8.5.8
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

## 이번 수정의 핵심

이전 버전의 실행 버튼은 토글 방식이었습니다.

```txt
실행 버튼 1회 클릭 → 실행
다시 클릭 → 정지
```

따라서 사용자가 계속 실행시키려고 여러 번 누르면 실제로는 실행/정지가 반복될 수 있었습니다.

v8.5.8에서는 버튼을 분리했습니다.

```txt
실행 고정
일시정지
1스텝
터보 300스텝
재생성
```

## 확인 방법

1. 화면을 열면 자동 실행 상태입니다.
2. 정지 상태라면 `실행 고정`을 누릅니다.
3. 즉시 진행 여부를 확인하려면 `터보 300스텝`을 누릅니다.
4. 중앙 화면 하단의 tick/time/pulse 값을 봅니다.
5. 결과 보고서 저장으로 JSON을 내려받아 분석할 수 있습니다.

## 여전히 진행이 약할 때

```txt
시뮬레이션 속도 배율: 3.2 → 5.0
엔진 스텝/프레임: 5 → 8
터보 300스텝 클릭
edge 예산: 900 이하 유지
형성 이벤트 텍스트: OFF 유지
```
