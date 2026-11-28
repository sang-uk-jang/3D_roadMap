# 배포와 QR

## 구성
- 정적 화면: `app/dist` (Vite 빌드)
- 서버리스 함수(`app/api/`): API 키를 브라우저에 노출하지 않고 중계
  - `GET /api/facilities` — 엘리베이터·에스컬레이터 실시간 가동 상태 (5분 캐시)
  - `GET /api/arrivals` — 열차 도착정보 (30초 캐시)
  - `POST /api/locate` — 표지판 사진 LLM 판별 (마지막 수단)
- 키가 없는 기능은 501을 돌려주고 화면에서 조용히 빠진다.

## 환경변수 (호스팅 설정 화면에 입력)
| 이름 | 필요 여부 | 발급처 |
|---|---|---|
| `STATION_API_KEY` | 권장 (실시간 시설 상태) | 공공데이터포털 서울교통공사_편의시설위치정보 |
| `SEOUL_API_KEY` | 선택 (열차 도착정보) | 서울 열린데이터광장 지하철 실시간 도착정보 |
| `ANTHROPIC_API_KEY` | 선택 (사진 LLM 판별, 호출마다 과금) | Anthropic Console |

`VITE_`로 시작하는 이름을 쓰면 브라우저 번들에 들어가므로 쓰지 않는다.

## Vercel로 배포 (설정 파일: `app/vercel.json`)
1. Vercel에 로그인하고, 프로젝트 루트 디렉터리를 `app`으로 지정해 가져온다(또는 `app` 폴더에서 `npx vercel` 실행).
2. 위 환경변수를 Project Settings → Environment Variables에 넣는다.
3. 배포 후 `https://<주소>/api/facilities`가 JSON을 돌려주는지 확인한다.

확인 필요: `app/api/*.ts`는 웹 표준 `export async function GET/POST(request)` 형식이다. 배포한 런타임에서 이 형식이 인식되는지 첫 배포 때 위 3번으로 확인한다.

## QR 만들기
```powershell
npm run --prefix app qr -- https://<배포주소>/
```
`docs/qr/station-guide-qr.png`(1024px), `.svg`가 생긴다. 오류 정정 수준 H라 일부가 가려져도 읽힌다.
