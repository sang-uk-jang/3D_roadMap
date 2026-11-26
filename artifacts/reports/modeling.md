# 군자역 안내도 기반 3D 모델

입력은 작업 폴더의 `56.-7호선-군자역.jpg`다. 입체 안내도에서 층별 외곽과 계단 시작·도착점을 수동으로 지정했다. B1 대합실, B2 7호선 대합실과 5호선 승강장, B3 7호선 승강장과 환승통로를 별도 객체로 만들었다. 출구 1~8번, 선로와 열차, 안내도에서 식별 가능한 시설물을 표시했다.

통행 공간의 외곽을 벽으로 닫고, 선로에 접한 승강장에는 차단벽을 만들었다. 계단과 통로가 만나는 지점에는 개구부를 두었다. 지붕을 생략한 모형이므로 회전해서 내부를 볼 수 있다.

층간 높이, 벽 위치와 치수, 시설물 세부 배치 및 일부 엘리베이터 정차층은 안내도에서 해석한 값이다. 안내도와 비슷한 각도에서 층이 잘 드러나도록 상대 층간 간격을 설정했다. 현장 실측과 영상 대조는 이후 작업에 해당한다.

## 파일

- `artifacts/models/gunja.blend`는 층별 컬렉션과 개별 객체가 들어 있는 Blender 원본이다.
- `artifacts/models/gunja.glb`는 추정 여부를 객체 속성에 포함한 GLB다.
- `data/annotations/floorplan.json`에서 평면 외곽, 층간 연결과 추정 구조를 수정할 수 있다.
- `artifacts/previews/gunja-3d.png`, `gunja-walls.png`, `gunja-source-overlay.png`는 전체 모델, 위쪽 시점, 원본 안내도 대조 이미지다.

## 재생성 및 검증

Blender 4.5.17 LTS로 생성했다. 프로젝트 루트의 PowerShell에서 실행한다.

```powershell
blender -b --python-exit-code 3 -P pipeline/build_scene.py -- --layout data/annotations/floorplan.json --output artifacts/models --preview-dir artifacts/previews
blender -b --python-exit-code 3 -P pipeline/validate_model.py -- artifacts/models/gunja.glb data/annotations/floorplan.json
& ([ScriptBlock]::Create((Get-Content -Raw -Encoding UTF8 pipeline/make_previews.ps1)))
```

GLB를 Blender에서 다시 불러와 메시 74개와 주요 객체 41개를 확인했다. 계단 및 에스컬레이터 18개 연결부의 바닥 접점과 중심선이 모델의 벽 및 차단벽에 막히는지 검사했다. 전체 폭의 통행성 및 실제 역의 구조는 현장 대조가 필요하다. 세부 실행 결과는 같은 폴더의 `build.log`와 `validation.log`에 있다.
