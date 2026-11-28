# 개인 테스트 방법

## PC에서
```powershell
npm run --prefix app dev
```
브라우저에서 `http://localhost:5180/` (포트는 터미널에 표시된 값)

## 휴대폰에서 (같은 와이파이)
1. PC에서 휴대폰 접속용으로 실행
```powershell
npm run --prefix app dev:phone
```
2. 이 PC의 와이파이 주소로 QR 만들기 → `docs/qr/station-guide-qr.png`
```powershell
npm run --prefix app qr
```
3. 휴대폰 카메라로 QR을 찍어 접속. 처음 접속 때 Windows 방화벽이 Node.js 허용을 물으면 **개인 네트워크**만 허용한다.

주의: 와이파이 주소가 바뀌면 QR을 다시 만든다. http 접속이라 서비스 워커(오프라인 캐시)는 휴대폰에서 동작하지 않는다(배포 빌드·https에서만).

## 시험해 볼 흐름
| 흐름 | 방법 | 확인할 것 |
|---|---|---|
| 출구 → 다른 역 | 출구 8 → "광화문", 승차권 구매 체크 | 발매기 단계와 발권 안내, 마지막에 다음 열차(시간표) |
| 환승 | "열차에서 내렸어요" → 5호선 → "건대입구" | 개찰구 단계 없이 계단 2번 |
| 계단 없이 | 출구 4 → "노원", 계단 없이 체크 | 엘리베이터만 사용, 1번 출구로 하면 4·7번 출구 안내 |
| 길 잃음 | "길을 잃었어요" → 샘플 사진 → 표지판 끌어 지정 → 읽기 | 번호 확인 버튼, 현재 위치 표시, 이어서 안내 |
| 실시간 시설 | 입력 화면 아래 "실시간 시설 상태" | 멈춘 에스컬레이터가 3D에 빨갛게 표시 |
| 영어 | 오른쪽 위 EN | 안내 문장·표지판 영문 병기 |

## 자동 점검
```powershell
npm run --prefix app test
```
```powershell
npm run --prefix app eval:signs
```
합성 표지판 측정: 개발 서버 실행 후 `http://localhost:5180/eval.html` (끝나면 화면에 요약)

## 키 (프로젝트 루트 `.env.local`, 직접 입력)
| 이름 | 없으면 |
|---|---|
| `STATION_API_KEY` | 실시간 시설 상태가 안 보임 (현재 설정됨) |
| `SEOUL_API_KEY` | 시간표 기준 다음 열차로 표시 |
| `ANTHROPIC_API_KEY` | "AI로 다시 확인" 버튼이 쓸 수 없다고 표시 |
