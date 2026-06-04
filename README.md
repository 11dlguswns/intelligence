# Claude Intelligence Monitor

당신의 **Claude 플랜(구독) 계정**으로, Claude가 시간이 지나며 체감상 "멍청해지는지"를
**저토큰 · 객관채점 · 반복측정**으로 추적하는 도구입니다. 공식 공시 벤치마크가 아니라,
*당신이 실제로 쓰는 경로(구독)* 를 통해 같은 질문을 매일 던지고 점수의 추이를 봅니다.

> 한 줄 요약: "출시 때 지표는 좋았는데 쓰다 보면 멍청해진다"는 가설을, 고정된 질문 세트로
> 매일 측정해 **수치와 그래프로** 확인합니다.

---

## 왜 이런 구조인가 (아키텍처)

- **API가 아니라 구독 계정**을 프로그램으로 쓰는 유일한 정식 경로는
  Claude Code 헤드리스(`claude -p`)입니다. 이 도구는 그걸 통로로 씁니다.
- 구독 토큰(OAuth)은 **공개 서버에 올릴 수 없고**, "방문자가 버튼 누르면 Claude 실시간 호출"
  방식은 당신의 **레이트 리밋**을 태웁니다.
- 그래서 **수집(로컬)과 표시(정적 웹)를 분리**합니다:

```
 [당신 PC]  러너 (claude 로그인됨)                 [GitHub Pages]  정적 대시보드
   스케줄 측정 → 채점 → JSON 생성   ── git push ──▶   history.json 읽어 추이/지능지수 표시
   * 구독 안전, 레이트리밋 통제                         * 방문자는 Claude를 건드릴 수 없음
```

- **러너** `packages/runner` — 외부 의존성 0, 순수 Node. `claude -p`를 호출하고 채점.
- **웹** `packages/web` — Vite + React. 빌드 시 `public/data/*.json`을 그대로 정적 호스팅.

---

## 측정 방식 — "순수 모델 능력" 프로파일

하네스(도구·시스템 프롬프트)가 측정을 오염시키지 않도록 최대한 벗겨냅니다:

| 항목 | 설정 | 이유 |
|---|---|---|
| 시스템 프롬프트 | `--system-prompt` 로 **최소 프롬프트 교체** | Claude Code 거대 에이전트 프롬프트 제거 → 오염·토큰 ↓ |
| 도구 | `--tools ""` (전부 OFF) | 순수 추론만 측정 |
| MCP | `--strict-mcp-config` | 외부 MCP 무시 |
| 추론 강도 | `--effort high` **(고정 상수)** | effort는 지능에 직접 영향 → 재현성 위해 고정 |
| 세션 | `--no-session-persistence` | 디스크 오염 방지 |

> `--bare`는 쓰지 않습니다. OAuth를 막고 API 키를 강제하기 때문에 **구독과 호환되지 않습니다.**

### 질문 차원 (저토큰 · 객관채점)

| 차원 | 측정하는 것 | 예시 |
|---|---|---|
| `counting` | 문자 단위 정밀성 | "strawberry"의 r 개수 |
| `math` | 다단계 산술 | (17×24) − (348÷4) |
| `crt` | 인지 반사(함정 회피) | 배트와 공, 위젯 문제 |
| `logic` | 연역/관계 추론 | 삼단논법, 키 순서 |
| `instruction` | 형식 준수 정확성 | "정확히 소문자 3단어" |
| `constraint` | 제약 충족 | q로 시작·k로 끝나는 5글자 단어 |

각 질문을 N회 반복해 **통과율**과 **자기일관성**(같은 답을 내는 비율)을 함께 측정합니다.
일관성 하락은 과도한 샘플링/양자화의 신호일 수 있습니다.

### 지능지수(Index)

차원별 평균 통과율을 구한 뒤 **차원들을 균등 평균**해 0~100으로 환산합니다.
(질문 수가 많은 차원이 점수를 독점하지 못하도록.)

---

## 빠른 시작

```bash
npm install

# 측정 (기본: haiku, repeat 5)
npm run bench

# 모델 전체 비교 (레이트리밋 주의)
npm run bench:all          # = --models opus,sonnet,haiku --repeat 5

# 옵션 직접 지정
node packages/runner/src/bench.mjs --models sonnet,haiku --repeat 3 --only counting,crt

# 대시보드 로컬 미리보기
npm run web:dev            # http://localhost:5173/intelligence/
```

측정 결과는 `packages/web/public/data/` 에 쌓입니다.

---

## 배포 (GitHub Pages)

1. GitHub에 빈 repo 생성 후 이 폴더를 push.
2. repo **Settings → Pages → Build and deployment → Source = GitHub Actions**.
3. push 하면 `.github/workflows/deploy.yml` 가 빌드·배포합니다.
   - base 경로는 **repo 이름으로 자동 설정**(`/<repo>/`)되므로 repo 이름은 자유입니다.
   - 공개 URL: `https://<당신아이디>.github.io/<repo>/`

로컬 빌드 확인:

```bash
npm run web:build          # packages/web/dist 생성
```

---

## 자동화 (매일 측정 → 자동 게시)

- `packages/runner/run-and-publish.ps1` — 측정 후 결과를 커밋·push (Pages 재배포 트리거).
- `packages/runner/schedule.ps1` — 위 스크립트를 매일 정해진 시각에 실행하도록 Windows 작업 스케줄러에 등록.

```powershell
# 매일 09:00, 세 모델 측정 후 자동 게시
./packages/runner/schedule.ps1 -Models "opus,sonnet,haiku" -Repeat 5 -Time "09:00"
```

---

## 데이터 형식

- `data/history.json` — 압축 시계열(차트용). 런별 모델별 index·consistency·latency·차원점수.
- `data/latest.json` — 가장 최근 런의 전체 상세(질문별 통과율·표본 답안).
- `data/runs/<runId>.json` — 런별 전체 상세 아카이브.
- `data/meta.json` — 질문 카탈로그·프로파일 설명.

---

## 한계 / 주의

- **레이트 리밋**: 모델 수 × 질문 수 × 반복 수만큼 호출이 발생합니다. Opus는 특히 보수적으로.
- 이 도구는 **Anthropic과 무관한 비공식 측정**입니다. "구독 경로로 전달되는 Claude"의
  상대적 변화를 보는 용도이며, 절대적 모델 성능 공시값이 아닙니다.
- 하네스를 **항상 동일하게 고정**해야 시계열 비교가 유효합니다(effort·시스템프롬프트 변경 시 새 시리즈로).

## 확장(나중)

GPT·Gemini 등은 v2에서 어댑터로 추가 예정. 현재는 **Claude 특화** 단계입니다.
