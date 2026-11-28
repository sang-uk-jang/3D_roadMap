# 지하철역 실내 길안내 (군자·도봉산)

3D_roadMap(MetroLens) 저장소와 따로 관리하는 브랜치(`station-guide`)입니다. master에 합치지 않습니다.

- 앱: `app/` (Vite + React + react-three-fiber). 실행: `npm --prefix app install`, `npm --prefix app run dev` → 군자역, `?station=dobongsan` → 도봉산역
- 역 데이터 생성: `app/scripts/build-gunja.mjs`, `app/scripts/build-dobongsan.mjs`
- 결과 문서: `docs/RESULTS.md`(군자), `docs/RESULTS-dobongsan.md`(도봉산, 두 역 이어서 안내)
- 새 역 추가 절차: `docs/PROMPT_new_station.md`
- 원자료: `data/raw/` (서울교통공사 안내도, 편의시설 API 응답, 공공데이터포털 CSV)
- API 키는 `.env.local`(저장소에 넣지 않음)의 `STATION_API_KEY`
