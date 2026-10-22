# taebo-games-starcraft

브루드워 1:1 (브라우저). 게임은 [`starcraft/`](starcraft/README.md) 폴더에 있고, 사이트 첫 화면은 `starcraft/`로 바로 넘어갑니다.

- 게임 엔진: [OpenBW](https://github.com/OpenBW/openbw)(원작과 같은 계산을 하는 C++ 재구현)를 WebAssembly로 빌드해서 씁니다 (`starcraft/engine/`).
- 원본 데이터: 비공개 저장소 `ceaser501/taebo-games-starcraft-assets` (꺼내는 방법은 `starcraft/README.md`)

## 실행

```bash
npm install
npm run sc:pack -- ../taebo-games-starcraft-assets   # 원본 데이터 변환 (최초 1회, 데이터가 바뀌면 다시)
npm start                                            # 개발 서버
npm run build                                        # dist/ 로 빌드
```

## 웹 배포 (Cloudflare Pages)

원본 데이터가 내 PC에만 있으므로 배포도 내 PC에서 합니다.

```bash
SITE_PASSWORD='비밀번호' npm run build
npm run deploy          # dist/ 를 Cloudflare Pages 프로젝트 taesu-starcraft 로 올림
```

처음 한 번은 `npx wrangler login`(브라우저 로그인)과
`npx wrangler pages project create taesu-starcraft --production-branch main`이 필요합니다. 주소는 `https://taesu-starcraft.pages.dev`입니다.
`SITE_PASSWORD` 없이 빌드하면 비밀번호 화면이 없습니다(파일 주소를 알면 우회되는 간이 잠금).
