# MetroLens — 군자역 3D 역사 복원 및 웹 길찾기 구현 지시서

## 1. Codex에게 전달할 목표

너는 컴퓨터 비전, 3D 모델링 및 풀스택 개발을 담당한다. 사용자가 직접 촬영한 군자역 내부 영상(MP4/MOV), 사진(JPG/PNG), 역사 안내도 이미지를 이용해 안내도와 동일한 층별 공간 연결 구조를 갖는 편집 가능한 3D 역사를 구축하고, 실제 사진과 유사한 외형을 적용한 웹 길찾기 서비스를 구현하라.

최종 결과는 단순한 360도 사진 뷰어나 포인트 클라우드가 아니라 벽, 바닥, 계단, 통로, 개찰구가 구분된 GLB 메시 모델과 그 위에서 이동하는 캐릭터다. 역사 안내도를 구조적 기준으로 사용하고, 영상 및 사진은 기하 보정과 외형 복원에 사용한다. 안내도 자체가 실제 축척의 설계도라는 가정은 하지 않는다.

### 범위
- 군자역의 공개적으로 통행 가능한 구역만 대상으로 한다. 실제 제공 자료에서 확인되는 층과 시설만 모델링한다.
- MVP: 한 구간에서 복원 실험 → 해당 층 전체 → 층간 연결 → 웹 길찾기.
- AR, 실시간 사용자 위치 추적, 승차권 구매 안내, 다른 역 확장은 이번 범위에서 제외한다.
- 촬영되지 않은 부분을 실제처럼 임의 생성하지 않는다. 추정 구조는 별도 표시한다.

## 2. 작업 원칙

1. 먼저 현재 저장소의 README, AGENTS.md, 파일 구조, package.json, Gradle 설정을 확인한다. 기존 프로젝트가 있으면 이를 보존하며 중복 프로젝트를 만들지 않는다.
2. 입력 자료를 목록화하고 실제 파일 존재 여부, 해상도, 길이, 층별 분류를 확인한다. 원본은 수정하거나 삭제하지 않는다.
3. 도구와 모델 버전 및 설치 명령은 공식 문서에서 확인한다. 검증하지 않은 CLI 옵션, 라이브러리 API, 다운로드 주소를 만들지 않는다.
4. 각 단계마다 실행 가능한 코드, 실제 실행 명령, 결과 파일, 검증 로그를 남긴다. GPU 또는 자료 부족으로 실패하면 원인을 기록하고 다음 단계에서 사용할 수 있는 대체 입력 계약을 유지한다.
5. 자동 인식 결과를 확정된 사실로 취급하지 않는다. 사용자 보정이 가능한 중간 JSON과 시각화 이미지를 반드시 생성한다.
6. 사진 속 얼굴, 개인 식별 정보는 공개 웹 결과물에서 제거하거나 흐리게 처리한다. 촬영 및 배포 권한을 확인한다.
7. 기존 코드의 불필요한 전면 수정, 비밀키 커밋, 원본 영상 외부 서비스 업로드를 금지한다.
8. GPU 작업 전 환경을 검사하고, 짧은 샘플이 통과하기 전에는 전체 영상 학습을 시작하지 않는다. 실제 테스트 없이 완료라고 보고하지 않는다.

## 3. 기술 스택 및 역할

| 구성 | 기술 | 역할 |
|---|---|---|
| 개발 환경 | Windows + WSL2 Ubuntu, NVIDIA RTX 4070 | 로컬 GPU 연산 |
| 전처리 | Python, FFmpeg, OpenCV | 영상 프레임 추출, 안내도 보정 |
| 안내도 분석 | OpenCV, 필요 시 CubiCasa5K | 벽/통로/시설 후보 추출 |
| 공간 복원 | VGGT, 대안 COLMAP | 카메라 자세, 깊이, 포인트 클라우드 |
| 정합 | Open3D, NumPy | 층별 좌표 정렬, 스케일 보정 |
| 메시 생성 | Blender Python (headless) | 편집 가능한 구조와 텍스처, GLB 출력 |
| 프론트엔드 | React, Vite, TypeScript, Three.js / React Three Fiber | 3D 렌더링, 캐릭터, 경로 표시 |
| 백엔드 | Java Spring Boot, Gradle | 층/시설/경로 API |
| 길찾기 | A* 또는 Dijkstra | 실제 통행 가능 경로 계산 |

VGGT와 COLMAP은 복원 단계의 대안이며 반드시 모두 실행할 필요는 없다. Gaussian Splatting은 비교 실험용 선택 사항이며 최종 충돌 메시를 대신하지 않는다. CubiCasa5K는 일반 건축 평면도 중심이므로 지하철 안내도에서 신뢰도를 검증한 뒤 사용한다.

## 4. 입력 및 출력 디렉터리

기존 저장소 구조에 맞게 조정하되 다음 책임 분리는 유지한다.

```text
metrolens/
  data/
    raw/
      floorplans/       # 역사 안내도 원본
      photos/           # 실제 사진 원본
      videos/           # 실제 영상 원본
      manifest.json     # 파일별 층, 위치, 방향, 출처
    processed/
      frames/
      floorplans/
      reconstruction/
      alignment/
      textures/
    annotations/        # 사용자 보정 JSON
  pipeline/
    preprocess.py
    parse_floorplan.py
    reconstruct.py
    align.py
    build_scene.py      # Blender 내부 실행 스크립트
    export_navigation.py
    validate.py
    requirements.txt
  frontend/
  backend/
  artifacts/
    models/
    navigation/
    previews/
    reports/
  README.md
  .gitignore
```

원본 영상, 사진, 대형 모델 가중치, 캐시 및 생성 중간 데이터는 기본적으로 Git 추적에서 제외한다. 소스 코드, 스키마, 설정 예시, 작은 테스트 fixture는 추적한다. 생성물 배포 위치는 별도로 결정한다.

### manifest.json 예시 (실제 파일명과 층은 확인 후 작성)

```json
{
  "stationId": "gunja",
  "assets": [
    {"id":"map-01","type":"floorplan","path":"floorplans/map.png","floorId":null},
    {"id":"video-01","type":"video","path":"videos/sample.mp4","floorId":null,"segmentId":"sample","notes":"층과 시작 위치 확인 필요"}
  ]
}
```

알 수 없는 층이나 촬영 위치는 null로 기록하고 추후 보정한다.

## 5. 단계별 구현

### Phase 0 — 환경 확인 및 샘플 선정

- `nvidia-smi`, Python, FFmpeg, Blender, Node, Java 버전을 확인한다.
- PyTorch CUDA 사용 가능 여부와 실제 VRAM 용량을 확인한다. RTX 4070의 메모리 용량을 제품명만 보고 확정하지 않는다.
- VGGT 등 모델의 공식 설치 조건을 확인하여 독립 가상환경을 구성한다. 서로 충돌하는 CUDA/PyTorch 의존성은 별도 환경으로 분리한다.
- 영상 중 하나의 연속적인 통로 또는 개찰구 구간 약 20~30초를 선정한다. 입력이 없으면 샘플 선정 대신 입력 안내 문서와 스키마를 구현한다.
- `artifacts/reports/environment.md`에 결과를 기록한다.

### Phase 1 — 영상 및 사진 전처리

- FFmpeg로 우선 초당 1~2장의 프레임을 추출하고 필요에 따라 조정한다.
- 흐림, 중복, 과노출, 움직이는 사람에 의해 대부분 가려진 프레임을 선별한다. 인접 프레임 사이 충분한 겹침을 유지한다.
- EXIF 및 영상 회전 정보를 반영하고 원본과 프레임 간 매핑을 저장한다.
- 안내도 사진이 비스듬히 촬영되었다면 원근 변환을 적용하되 원본과 보정 이미지를 함께 보관한다.

실행 예시:

```bash
ffmpeg -i data/raw/videos/sample.mp4 -vf fps=2 data/processed/frames/sample/%06d.jpg
```

출력 폴더는 먼저 생성한다. 실제 경로는 manifest를 통해 결정한다.

완료 기준: 프레임 목록, 원본 시간 위치, 품질 점검 이미지가 생성되어야 한다.

### Phase 2 — 역사 안내도에서 구조 추출

1. 안내도에서 층별 그림 영역, 벽 경계, 통로 영역, 출입구/개찰구, 기둥, 계단/에스컬레이터/엘리베이터, 승강장 후보를 추출한다.
2. OpenCV의 색상 분리, 이진화, morphology, contour, 선분 검출 및 polygon simplification을 조합한다. 범례, 텍스트, 노선 색상, 화살표를 벽으로 잘못 추출하지 않도록 한다.
3. 안내도가 원근감 있는 입체 안내도라면 단순 평면 이미지로 간주하지 않는다. 층별 수동 기준점 또는 벡터 보정 과정을 지원한다.
4. 결과를 SVG 또는 오버레이 PNG로 저장하고, 구조 JSON에서 좌표와 연결관계를 수정할 수 있게 한다. 자동화가 실패하면 안내도 위에서 다각형/선분을 직접 지정할 수 있는 최소 편집 도구를 구현한다.
5. 실제 사진으로 확인 가능한 벽, 기둥, 통로 위치를 대조한다. 벽 두께, 천장 높이, 계단 길이처럼 알 수 없는 치수는 추정값으로 표시한다.

#### 구조 데이터 계약

```json
{
  "stationId": "gunja",
  "coordinateSystem": {"unit":"meter","upAxis":"Y","scaleStatus":"estimated"},
  "floors": [
    {
      "id":"floor-demo",
      "elevation":0,
      "walls":[{"id":"w1","start":[0,0],"end":[8,0],"height":3,"thickness":0.2,"status":"estimated"}],
      "walkableAreas":[{"id":"a1","polygon":[[0,0],[8,0],[8,4],[0,4]],"status":"estimated"}],
      "facilities":[],
      "connectors":[]
    }
  ]
}
```

위 좌표는 스키마를 보여주기 위한 가상 데이터이며 군자역 실제 치수가 아니다. 벽/바닥 평면 좌표는 [x,z], 전체 위치는 [x,y,z]로 통일한다. 층간 연결 객체에는 양쪽 층 ID와 진입/도착 위치, 연결 종류, 통행 방향, 확인 상태를 저장한다.

완료 기준: `floorplan.json`, 층별 오버레이 PNG, 보정이 필요한 항목 목록이 생성된다.

### Phase 3 — 사진 및 영상의 3D 공간 복원

우선 VGGT 공식 구현을 사용한다. 영상 프레임과 동일 구간 사진을 입력하고 카메라 내/외부 파라미터, 깊이 또는 world points, 신뢰도 정보를 추출한다. 모델이 제공하는 출력 종류와 좌표계를 공식 코드로 확인한다.

- 전체 역을 한 번에 GPU에 입력하지 않는다. VRAM 측정 후 작은 중첩 구간으로 분할한다.
- CUDA OOM 발생 시 프레임 수/해상도를 줄이고 공식 지원 방식으로 추론한다. 구간 경계에서 공통 프레임과 기준점을 유지한다.
- VGGT가 실행되지 않거나 결과가 불안정하면 COLMAP의 feature extraction, matching, SfM을 사용한다. 필요 시 dense reconstruction을 추가한다.
- 사람과 움직이는 물체를 가능한 범위에서 제외하고 신뢰도가 낮은 점을 제거한다.
- 영상이 복도 한 방향으로만 촬영되었거나 특징이 부족하면 복원 품질이 낮을 수 있다. 필요한 추가 촬영 위치를 구체적으로 기록한다.

출력: 구간별 PLY 포인트 클라우드, 카메라 파라미터 JSON, 신뢰도 및 복원 보고서. 실제 출력 형식은 adapter를 통해 공통 계약으로 변환한다.

완료 기준: 동일 공간의 여러 프레임에서 일관된 주요 벽/기둥/바닥 구조를 확인한다. 포인트 클라우드 자체를 최종 GLB 메시라고 보고하지 않는다.

### Phase 4 — 안내도와 3D 복원 결과 정합

이 단계가 프로젝트의 핵심이다.

- 동일 층/구간임을 확인한 뒤 기둥 중심, 통로 모서리, 개찰구 양끝, 계단 입구 등의 대응점을 안내도와 복원 결과에 지정한다.
- 가능하면 실제 측정 거리(통로 너비 등)를 하나 이상 사용해 미터 스케일을 보정한다. 없다면 상대 스케일로 유지하고 정확한 거리라고 표시하지 않는다.
- 평면 방향 및 위치를 정렬하고 충분히 분포된 기준점(최소 3개 비공선점 권장)을 사용해 similarity transform을 구한다.
- Open3D ICP는 초기 정렬 이후 실제 대응하는 표면이나 점 데이터가 있을 때만 보조적으로 사용한다. 2D 안내도 이미지와 3D 포인트 클라우드를 그대로 ICP에 입력하지 않는다.
- 층마다 정합하고 계단 등의 연결점을 확인한다. 서로 다른 구간은 공통 영역에서 정합한다.
- 안내도가 비축척 또는 왜곡된 경우 하나의 변환으로 전체를 맞출 수 없으므로 구간별 보정과 연결 위상 보존을 우선한다.
- 안내도와 영상이 충돌하면 자동으로 한쪽을 덮어쓰지 말고 근거 및 잔차를 보고한다.

출력: `alignment.json` (변환 행렬, 기준점, 스케일 상태, 잔차, 검증 상태), 상면 비교 이미지, 정렬된 PLY.

완료 기준: 안내도와 복원 결과의 주요 통로 연결과 대응점을 사람이 검증할 수 있어야 한다.

### Phase 5 — Blender Python으로 실제 3D 메시 생성

Blender를 headless로 실행하는 스크립트를 작성한다. 일반 Python 환경에 `bpy`가 있다고 가정하지 않는다.

- Phase 2 구조 JSON과 Phase 4 정합 결과를 읽어 바닥, 벽, 기둥, 계단, 승강장, 개찰구 등을 개별 객체로 생성한다.
- 출입구와 통로 연결을 막는 벽을 만들지 않는다. 계단의 단차와 층별 연결을 검증한다.
- 렌더링 메시와 단순화된 충돌/이동용 메시를 분리한다.
- Blender Z-up과 웹 GLTF Y-up의 변환을 명시적으로 관리하고 내보낸 모델과 navigation 좌표가 일치하는지 테스트한다.
- 사진을 벽/바닥/시설물 재질에 적용한다. 카메라 보정이 가능한 경우 가시성 및 투영을 고려하여 텍스처를 베이크하고, 그렇지 않으면 확인된 사진을 수동 지정할 수 있게 한다.
- 이미지 한 장 전체를 무조건 벽에 늘려 붙이지 않는다. 사람/반사/가려짐 및 여러 사진의 경계 문제를 처리한다.
- 관측되지 않은 외형은 중립 재질을 사용하고 추정 상태를 메타데이터에 기록한다.
- 텍스처 아틀라스, 메시 단순화 등은 원본 품질을 확인한 뒤 적용한다.

예시 실행 계약(구현할 자체 스크립트):

```bash
blender -b -P pipeline/build_scene.py -- --layout artifacts/navigation/floorplan.json --alignment data/processed/alignment/alignment.json --output artifacts/models/gunja.glb
```

출력: `gunja.blend`, `gunja.glb`, `gunja_collision.glb`, 층별 프리뷰 및 모델 통계.

완료 기준: GLB를 Blender 또는 독립 glTF 뷰어에서 열 수 있고 층/벽/시설이 별도 객체로 존재한다.

### Phase 6 — 길찾기 그래프 및 캐릭터 이동

- 통로 분기점, 출입구, 개찰구, 계단 입구, 층간 연결점을 노드로 생성한다.
- 동일 층의 통행 가능한 영역을 따라 간선을 생성한다. 층간 간선은 확인된 연결점으로만 구성한다.
- 벽 관통, 비통행 영역 진입, 승강장 선로 진입이 없도록 검사한다.
- A*를 사용하되 비용과 휴리스틱이 일관되지 않으면 Dijkstra를 사용한다. 미확인 또는 차단된 연결은 기본 경로에서 제외한다.
- MVP는 검증된 그래프를 따라 캐릭터를 보간 이동시킨다. 자유 이동과 장애물 회피가 필요할 때 NavMesh를 추가한다.
- 그래프 간선에 중간 경유점이 필요한 경우 polyline을 저장하여 캐릭터가 모서리를 가로질러 벽을 통과하지 않게 한다.
- 접근성 정보는 확인된 경우에만 표시한다. 엘리베이터 경로를 자동으로 보장하지 않는다.

출력: `navigation.json` (nodes, edges, floorId, position, geometry, status), 테스트 경로 JSON.

### Phase 7 — Spring Boot API

기존 프로젝트의 Java/Gradle 버전을 따른다. MVP에서는 버전 관리되는 JSON 결과를 로드하고 필요 시 DB를 후속 도입한다.

| Method | Endpoint | 설명 |
|---|---|---|
| GET | /api/stations/gunja | 역사 메타데이터 및 모델 URL |
| GET | /api/stations/gunja/floors | 층 목록 |
| GET | /api/stations/gunja/facilities | 출발/목적지 후보 |
| GET | /api/stations/gunja/navigation | 그래프 및 좌표 정보 |
| POST | /api/stations/gunja/routes | 출발/목적지 기반 경로 탐색 |

경로 요청: `startNodeId`, `endNodeId`, 선택적 `accessibleOnly`. 응답: 노드 ID 순서, 3D polyline, 층간 이동 정보, 거리(실측 보정된 경우만), 검증 상태. 존재하지 않는 노드는 400 또는 404, 경로가 없으면 명시적인 오류 응답. CORS는 개발 origin을 설정으로 관리한다.

### Phase 8 — React + Vite 웹 구현

- React Three Fiber와 Three.js GLTFLoader 계열로 GLB 모델을 불러온다.
- 초기 화면: 층 선택, 시작 위치/목적지 선택, 길찾기 버튼.
- 3D 화면: 전체 역사 보기, 확대/회전, 층별 표시, 캐릭터 추적 카메라, 경로 화살표, 다음 이동 안내.
- 캐릭터는 경로 polyline을 따라 이동한다. 회전은 진행 방향에 맞춘다. 재생/일시정지/초기화 및 이동 속도 조절을 제공한다.
- 영어/한국어 시설 명칭을 지원하되 확인되지 않은 명칭은 임의 생성하지 않는다.
- 모바일 화면에서도 터치 카메라 및 조작이 가능해야 한다. 모델 로딩 진행률, 오류 상태, WebGL 미지원 안내를 구현한다.
- 층별 모델 분할 및 지연 로딩을 지원하고 저사양 기기에서는 렌더링 품질을 낮춘다.
- 사용자에게 현재 캐릭터 위치가 실제 스마트폰 위치가 아닌 시뮬레이션임을 명확히 표시한다.

## 6. 테스트 및 완료 기준

| 검사 | 합격 기준 |
|---|---|
| 안내도 구조 | 확인된 주요 통로/분기/층간 연결이 원본과 일치 |
| 정합 | 기준점 및 잔차 보고서 존재, 불일치 구간 표시 |
| 3D 모델 | GLB 정상 로드, 벽/바닥/계단 구분, 좌표계 일치 |
| 외형 | 확인된 구간을 실제 사진과 비교할 수 있는 프리뷰 제공 |
| 경로 | 확인된 통로만 사용, 벽 및 비통행 영역 관통 없음 |
| 층간 이동 | 연결된 노드 쌍을 통해서만 이동 |
| 웹 | 데스크톱/모바일 테스트, 모델 및 경로 오류 처리 |
| 재현성 | README 명령으로 샘플 파이프라인 재실행 가능 |
| 데이터 무결성 | 원본 보존, 추정/미확인 구간 표시, 개인정보 제거 |

가능하면 단위 테스트로 좌표 변환, 그래프 연결, A* 결과, 접근성 필터 및 GLB-그래프 위치 일치를 검증한다. 실측 자료가 없으면 치수 정확도 목표를 임의로 설정하지 말고 측정 불가로 기록한다.

## 7. 실행 순서 및 산출물

첫 작업에서는 Phase 0~2와 한 구간의 Phase 3 복원 실험에 집중한다. 샘플 정합과 GLB 생성이 검증되면 전체 층으로 확장하고 이후 웹 기능을 연결한다. 필요한 Python CLI/실행 스크립트와 테스트를 실제로 작성한 뒤 README에 명령을 기록한다.

최종 산출물:
- 원본 보존 및 입력 manifest
- 안내도 구조 JSON 및 오버레이
- 구간별 복원 PLY 및 카메라 데이터
- 정합 JSON 및 비교 보고서
- 편집 가능한 Blender 파일, GLB, 충돌 메시
- 길찾기 그래프 및 검증 로그
- React/Vite 웹, Spring Boot API, 테스트 및 실행 README

작업 종료 시 실제로 완료한 단계, 변경 파일, 실행 명령, 테스트 통과/실패, 남은 보정 작업, 필요한 추가 사진/치수 목록을 보고한다. 입력 자료 또는 환경 때문에 실행할 수 없는 단계를 완료로 표기하지 않는다.

## 8. 공식 참고 자료

- VGGT: https://github.com/facebookresearch/vggt
- COLMAP: https://colmap.github.io/
- OpenCV: https://docs.opencv.org/
- CubiCasa5K: https://github.com/CubiCasa/CubiCasa5k
- Open3D: https://www.open3d.org/docs/
- Blender Python: https://docs.blender.org/api/current/
- FFmpeg: https://ffmpeg.org/documentation.html
- Three.js: https://threejs.org/docs/
- React Three Fiber: https://r3f.docs.pmnd.rs/
- Spring Boot: https://docs.spring.io/spring-boot/

참고 URL과 버전별 사용법은 작업 시점에 검증한다.
