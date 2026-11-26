# 군자역 3D 길 안내

`artifacts/guide/gunja-route-guide.html`을 Chrome이나 Edge에서 열면 바로 사용할 수 있다. 4번 출구에서 5호선 아차산 방면까지 예시 경로가 처음 표시된다. 출구 합류부, 층 도착, 큰 방향 전환과 목적지를 확인 지점으로 안내한다. 짧은 중간참은 이동 안내에 포함된다. 각 지점에 도착했을 때 **도착했어요**를 누르면 다음 지점이 표시된다. **재생**은 캐릭터 눈높이에서 현재 확인 지점까지 이동한 뒤 멈춘다. 지점 도착 여부는 사용자가 직접 확인한다. 화면을 드래그하면 주변을 둘러볼 수 있고, **전체 지도**에서는 모델을 회전·확대하고 층별로 볼 수 있다.

## 모델과 영상 근거

- `artifacts/previews/gunja-3d.png`와 `data/annotations/floorplan.json`을 기준으로 B1~B3 배치, 승강장 방향, 출구와 환승 연결을 잡았다. 보강한 `gunja-guide.blend`와 `gunja-guide.glb`는 `artifacts/models`에 있다.
- `gunja1.mp4`의 00:09~00:37에서 4번 출구 표지와 유리·금속 에스컬레이터를 확인했다. 00:48~01:04에 나오는 하부 계단, 흰 타일, 점자블록을 해당 연결부와 대합실에 반영했다. 에스컬레이터와 계단은 기존 출구 시점과 B1 도착점 사이에 배치했다.
- `gunja1.mp4`의 01:44~02:18과 02:50~03:07에서는 금속 개찰구, 상태 표시, 파란 발권·충전기 외형을 참고했다. `gunja2.mp4`의 00:06~00:51에서는 돌계단과 에스컬레이터 마감을 대조했다. 두 번째 영상의 출구 번호와 시설 세부 좌표는 미확인이다.
- 화장실은 안내도 단면과 중앙 환승부 표기에 맞춰 B1에 배치했다. 발권·충전기는 B1 중앙 환승부와 어린이대공원 쪽 대합실에 배치했다. 엘리베이터, 발권·충전기, 화장실, 개찰구는 Blender에서 편집 가능한 개별 컬렉션이다. 길 안내에서는 장비 전면과 입구까지 이동한다. 모듈 위치와 충돌을 피하기 위해 조정한 1·3번 출구 하부 계단 접점은 `data/annotations/facility-modules.json`에 기록했다.
- B1~B3 대합실, 환승통로와 승강장의 바깥쪽에는 높이를 올린 벽을 배치했다. 복도 안쪽과 계단·에스컬레이터 옆 벽에는 촬영 영상의 밝은 타일과 회색 석재 하부 마감을 반영했다. 층간 연결부와 환승통로 입구는 열어 두었고, 승강장 선로 쪽은 스크린도어 형태의 차단벽으로 모델링했다. 벽 높이, 두께와 타일 치수는 추정값이다.
- 출구 2·3번의 계단 사이에 별도의 수평 중간참을 만들었다. 1·2번, 3·4번, 5·6번은 각 합류부에서 B1 공용 계단을 이용한다. 7번의 두 계단과 자전거 바퀴 홈, 8번의 나란한 에스컬레이터는 B1의 같은 합류 구역으로 이어진다. 중간참의 바닥과 합류부는 3D 메시 및 경로 그래프에 모두 연결했다. 출구별 기준점과 높이 추정치는 `data/annotations/exit-landings.json`에 있다.
- `gunja1.mp4` 01:03의 바닥 석재와 `gunja2.mp4` 00:23의 계단 석재·벽 타일은 인물과 글자가 없는 영역을 잘라 반복 가능한 표면 재질로 사용했다. B1 천장 패널과 줄 조명은 `gunja1.mp4` 대합실 장면을 참고했다. 천장과 마감의 배치는 영상에서 보이는 양식을 바탕으로 추정했다.
- `gunja1.mp4` 00:35~01:03과 `gunja2.mp4` 00:00~00:51을 대조해 4번 출구 아래 합류부, 공용 계단의 푸른 천장 보와 3·4번 번호 기둥을 보강했다. 모형에서 4번 출구 하행 방향, 합류부 통로와 B1 공용 계단의 방향을 같은 축으로 맞췄다.
- `gunja1.mp4` 01:14~01:23과 02:06~02:19에서 확인한 금속 개찰구, 둥근 타일 기둥, 유리 전면과 칸막이, 7호선 상부 표지와 점자블록을 7·8번 쪽 B1 구역에 배치했다. 위치·간격과 개찰구 수는 영상의 상대 배치와 안내도를 기준으로 한 모형 값이다.
- `gunja1.mp4` 00:46, 01:01~01:08, 01:23~01:53, 02:15~03:17 및 `gunja2.mp4` 00:00에 나타나는 기둥을 B1 통로, 개찰구 주변, 발권기 주변, 3·4번 합류부와 5·6번 접근부에 배치했다. 원형 타일, 유광 백색, 사각 타일, 금속 보호띠 및 번호·노선 표지의 차이를 모델링했다. 각 기둥의 영상 시각과 추정 좌표는 `data/annotations/facility-modules.json`에 있고, Blender에서는 `Module · Column` 컬렉션에서 편집한다.
- 높이, 폭, 발권기 위치와 개수는 모형 값이다. 경로는 모형에서 접점과 통과 여부를 검사한 안내도 기반 시뮬레이션이다. 에스컬레이터 운행 방향과 승강장 이용 가능 여부는 현장 표지 기준이다. 두 영상의 장면별 근거는 `data/annotations/video-details.json`에 있다.

두 영상은 30 fps, HEVC로 촬영됐고, 재생 길이는 각각 3분 32.89초와 58.35초다. FFmpeg로 로컬 프레임을 샘플링하고, 참조 구간의 마감을 3D 재질과 객체로 재현했다. HTML과 서버 배포물에는 3D 메시, 경로 그래프, 안내도 기반 렌더만 포함된다.

## 개발 및 서버 실행

프로젝트 루트의 PowerShell에서 실행한다. 웹은 Node.js와 npm을 사용한다. 서버는 JDK 21과 Gradle 8.14.x를 사용한다.

```powershell
npm ci --prefix frontend
npm run --prefix frontend dev
```

Spring Boot API와 웹 화면을 함께 실행하려면 다음 명령 후 `http://127.0.0.1:8080`을 연다.

```powershell
npm run --prefix frontend build
gradle -p backend bootRun
```

Spring Boot는 `/api/stations/gunja`에서 역 정보를 제공한다. 하위 `/floors`, `/facilities`, `/navigation`은 GET, `/routes`는 POST를 사용한다. 경로 요청은 `startNodeId`, `endNodeId`, 선택 항목 `accessibleOnly`를 받는다. 응답에는 노드, 3D 경로, 단계별 연결 데이터가 들어 있다.

## 모델 재생성 및 검증

```powershell
blender -b --python-exit-code 3 -P pipeline/build_scene.py -- --layout data/annotations/floorplan.json --details data/annotations/video-details.json --modules data/annotations/facility-modules.json --exit-landings data/annotations/exit-landings.json --video-textures data/processed/textures --basename gunja-guide --output artifacts/models --preview-dir artifacts/previews
blender -b artifacts/models/gunja-guide.blend --python-exit-code 3 -P pipeline/build_navigation.py -- artifacts/navigation/navigation.json
blender -b --python-exit-code 3 -P pipeline/validate_model.py -- artifacts/models/gunja-guide.glb data/annotations/floorplan.json data/annotations/video-details.json data/annotations/facility-modules.json data/annotations/exit-landings.json
npm run --prefix frontend test
npm run --prefix frontend build
npm run --prefix frontend package:offline
```

계단·에스컬레이터 연결부 24곳에서 발판 표면 높이와 캐릭터 통과 폭을 샘플링했다. 캐릭터는 발판을 밟고, 1인칭 카메라는 계단의 연속적인 경사선을 따라 이동한다. 이동 그래프는 벽, 난간, 시설물, 인접 계단과 교차하는 구간을 제외하고 출발·도착 후보 20곳을 연결한다. 영상은 외형 보강에 사용했다. 실측 및 영상과의 3D 좌표 정합은 이후 현장 검증 항목이다.

Chrome을 설치한 환경에서는 `METROLENS_CHROME`에 Chrome 실행 파일 경로를 지정한 후 `node frontend/test/browser.mjs`로 HTML의 기능을 확인할 수 있다. 실행 중인 서버를 검사할 때는 `METROLENS_TEST_URL`에 서버 주소를 지정하고 같은 브라우저 스크립트와 `node frontend/test/api.mjs`를 실행한다.
