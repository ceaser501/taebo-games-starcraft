# StarCraft

브루드워 1:1 (브라우저). 개발 서버에서는 `/starcraft/`로 열립니다.

## 원본 데이터

스타크래프트 리마스터 설치 폴더(`Data/` CASC 저장소)에서 필요한 파일만 꺼내 비공개 저장소
`ceaser501/taebo-games-starcraft-assets`에 둡니다. CascView는 Windows 전용이라 Node 도구를 씁니다.

```bash
node starcraft/tools/casc.mjs list "$SC" > casc-list.txt          # 파일 목록과 크기
node starcraft/tools/casc.mjs extract "$SC" ~/sc-assets 'arr/' 'scripts/' ...   # 꺼내기 (* 와 ! 지원)
```

`npm run sc:pack -- <assets 경로>`가 그 데이터를 `starcraft/assets/sc/`(git에 안 올림)로 바꿉니다.

| 결과 | 내용 |
|---|---|
| `data/core.bin.gz` + `.idx` | 유닛·무기 표, 애니메이션 스크립트, 유닛 그림(GRP), 지형 속성 |
| `data/<타일셋>.bin.gz` + `.idx` | 타일셋 그림, 팔레트, 조명표 (맵의 타일셋만 받음) |
| `sound/**.wav` | 효과음·음성 (원작 22kHz, 처음 재생할 때 받음) |
| `maps/**` + `maps.json` | 맵 (.scm/.scx 그대로) |

## 엔진

`engine/`의 OpenBW(헤더만, `engine/openbw/VENDORED.md`에 고친 점)와 `engine/game.cpp`(페이지와 잇는 C 함수)를
Emscripten으로 `js/engine/bw.mjs` + `bw.wasm`으로 빌드합니다. 빌드 결과는 저장소에 들어 있어서,
엔진을 고칠 때만 Emscripten이 필요합니다(`npm run sc:engine`).

- 게임 계산은 원작과 같습니다(정수 계산, 원작 난수). 그래서 같은 명령을 같은 프레임에 넣으면 두 컴퓨터의 결과가 같습니다.
- 그림은 원작 SD 그래픽을 8비트 팔레트 그대로 그립니다. 안개는 타일 사이를 부드럽게 섞습니다.
- `engine/build-test.sh`는 같은 코드를 네이티브로 빌드한 시험 프로그램(`test.cpp`)입니다. 스크린샷과 상태 해시를 냅니다.

## 조작

| 입력 | 동작 |
|---|---|
| 왼쪽 클릭 / 드래그 | 선택 (Shift 추가·빼기, 더블클릭·Ctrl 화면 안 같은 유닛 전부) |
| 오른쪽 클릭 | 이동·공격·채취·수리 (Shift 예약) |
| 방향키, 미니맵 클릭·드래그 | 화면 이동 (전체화면에서는 화면 끝으로도) |
| 미니맵 오른쪽 클릭 | 그곳으로 명령 |
| Ctrl+숫자 / 숫자 / Shift+숫자 | 부대 지정 / 부르기 (두 번 누르면 화면 이동) / 추가 |
| 명령 단축키 | 원작과 같음 (M 이동, S 정지, A 공격, P 정찰, H 위치 사수, G 채취, C 반납, B 건설) |
| Esc | 명령·건설 취소, 생산 취소 |
| F10 | 메뉴 |

## 구조

| 파일 | 내용 |
|---|---|
| `js/app.js` | 비밀번호 화면, 메뉴, 게임 시작 |
| `js/engine.js` | 엔진(wasm)과 데이터 불러오기, C 함수 감싸기 |
| `js/game.js` | 게임 루프(Fastest, 프레임당 42ms), 화면, 입력, 패널, 락스텝 연결 |
| `js/units.js` | 유닛 이름, 명령 카드(버튼·단축키·아이콘) |
| `js/sound.js` | 효과음·음성 재생 (Web Audio, 동시 8개) |
| `engine/game.cpp` | 엔진 쪽 함수: 시작, 프레임, 명령, 그리기, 안개, 미니맵, 선택 |
| `engine/platform.cpp` | SDL 대신 메모리 화면 |
| `tools/casc.mjs` | 리마스터 CASC 저장소 읽기 |
| `tools/pack-data.mjs` | 데이터 묶기 |
