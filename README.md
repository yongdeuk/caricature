# 캐리커처 메이커

사진을 촬영하거나 업로드하면 브라우저에서 바로 캐리커처 스타일로 변환해주는 정적 웹앱입니다.
서버나 API 키 없이 클라이언트에서만 동작하며, 이미지는 외부로 전송되지 않습니다.

## 동작 방식

1. [face-api.js](https://github.com/justadudewhohacks/face-api.js)(정확히는 [@vladmandic/face-api](https://github.com/vladmandic/face-api) 빌드, MIT 라이선스)로 얼굴 랜드마크(눈, 입, 얼굴 윤곽)를 인식합니다. 라이브러리와 모델 가중치는 `vendor/`, `models/`에 함께 포함되어 있어 외부 CDN 없이 완전히 오프라인으로 동작합니다.
2. 랜드마크를 기준으로 눈/입을 확대하고 얼굴 폭을 좁히는 왜곡(bulge/pinch warp)을 적용합니다.
3. 색상 포스터라이즈와 Sobel 외곽선 검출로 카툰 느낌의 스타일을 입힙니다.
4. 결과 이미지를 PNG로 다운로드할 수 있습니다.

## 사용 방법

정적 파일이므로 별도 빌드 과정이 필요 없습니다.

```bash
# 로컬에서 실행 (아무 정적 서버나 사용 가능)
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

카메라 접근은 보안 컨텍스트(https 또는 localhost)에서만 허용되므로,
`file://`로 직접 열면 카메라 기능은 동작하지 않을 수 있습니다(업로드 기능은 정상 동작).

## GitHub Pages로 배포하기

1. 저장소 Settings → Pages
2. Source를 `main` 브랜치 / root로 설정
3. 배포된 URL로 접속하면 카메라 기능까지 정상 동작합니다(https 제공).

## 커스터마이징

- `script.js`의 슬라이더 기본값(`눈 크기`, `입 크기`, `얼굴 폭`, `카툰 강도`)으로 왜곡 정도를 조절합니다.
- 더 정교한 얼굴 왜곡(코, 턱 등)을 원하면 `applyWarp` 호출부에 랜드마크 기반 영역을 추가하면 됩니다.

## 제한 사항 (로컬 필터 방식)

- 한 장의 사진에서 얼굴 하나만 인식합니다(가장 크게 나온 얼굴 기준).
- 조명이 어둡거나 얼굴이 작게 나온 사진은 인식률이 떨어질 수 있습니다.
- AI가 스타일을 새로 "생성"하는 방식이 아니라, 원본 사진을 기하학적으로 왜곡 + 색상 단순화하는 방식이라 완성도에 한계가 있습니다.

## AI 캐리커처 생성 (Gemini, 선택 기능)

화면 아래쪽 "AI 캐리커처 생성" 섹션은 Google Gemini 이미지 모델(`gemini-2.5-flash-image`)로
실제 그림체의 캐리커처를 생성합니다. 정적 사이트에서 API 키를 안전하게 숨기기 위해
Cloudflare Workers를 중계 서버로 사용합니다.

### 1. Gemini API 키 발급

[Google AI Studio](https://aistudio.google.com/apikey)에서 API 키를 발급받습니다.

### 2. Cloudflare Worker 배포

```bash
cd worker
npm install -g wrangler   # 최초 1회
wrangler login            # Cloudflare 계정 로그인 (브라우저 창이 열립니다)
wrangler deploy           # worker/index.js 배포
wrangler secret put GEMINI_API_KEY   # 발급받은 Gemini API 키 입력
```

배포가 끝나면 `https://caricature-gemini-relay.<your-subdomain>.workers.dev` 형태의 주소가 출력됩니다.

`worker/wrangler.toml`의 `ALLOWED_ORIGIN`을 본인의 GitHub Pages 주소로 맞춰두면
다른 사이트에서 이 Worker를 가져다 쓰는 것을 줄일 수 있습니다(브라우저 기준 CORS 제한이며,
완전한 차단은 아닙니다 — Cloudflare 대시보드의 Rate Limiting 규칙을 추가로 설정하는 것을 권장합니다).

### 3. 사이트에 Worker 주소 등록

배포된 사이트에서 "AI 캐리커처 생성" → "중계 서버(Worker) 주소 설정"을 펼쳐
위에서 받은 Worker 주소를 입력하고 저장합니다. 이 주소는 브라우저의 localStorage에만
저장되며, 저장소 코드에는 포함되지 않습니다.

### 비용

Gemini 이미지 생성 API 호출마다 Google AI 쪽에 과금됩니다(무료 등급 한도 내에서는 무료).
사용량은 [Google AI Studio](https://aistudio.google.com/)에서 확인할 수 있습니다.
