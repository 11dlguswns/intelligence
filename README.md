# Claude Condition Monitor

당신의 **Claude 플랜(구독) 계정**으로, 각 Claude 모델이 **자기 평소 상태(기준선)** 대비 지금
컨디션이 떨어졌는지 — 즉 **과부하·스로틀링·자원 축소로 인한 저하**를 추적하는 도구입니다.

> 모델 간 비교(벤치마크)가 **아닙니다.** 각 모델을 **자기 자신**과 비교합니다.

---

## 실험으로 알게 된 핵심 (왜 "지연 중심"인가)

처음엔 정답률로 "멍청해짐"을 잡으려 했지만, 실험 결과:

> **프런티어 모델은 객관·기계적 과제에선 effort를 낮춰도 거의 무적입니다.**
> haiku(가장 약한 모델)조차 effort=low로 **8자리×7자리 곱셈, 7^16 mod 1000, 26단어 다중제약 형식**을
> 전부 정확히 풀었습니다 (난이도 L24까지 100%).

즉 **정확도는 천장**이라 미세한 저하가 안 잡힙니다. 그래서:

| 신호 | 역할 |
|---|---|
| **응답 지연 (TTFT)** | **주 신호.** 과부하·스로틀링·자원 축소의 가장 직접적인 지표 |
| **정확도 (고정 난이도)** | **트립와이어.** 평상시 100%, 진짜 능력 저하가 오면 그때 떨어짐 → 경보 |
| **자기일관성 · 출력 토큰** | 보조 신호 (샘플링/양자화·동작 변화) |

**컨디션 판정** = 현재 TTFT를 모델의 **고정 기준선**과 비교 (정확도 급락은 강한 override).

---

## 아키텍처 (수집 ↔ 표시 분리)

구독 OAuth는 공개 서버에 못 올리므로, **로컬 러너가 측정**하고 **결과 JSON만 정적 사이트**에 올립니다.

```
 [당신 PC] 러너 (claude 로그인)              [GitHub Pages] 정적 대시보드
   bench → JSON (지연·정확도·기준선)  ── git push ──▶  컨디션/추이 표시
```

- 러너 `packages/runner` (의존성 0): `claude -p` 헤드리스, 도구 OFF·최소 시스템 프롬프트·**effort 고정(low)**.
- 웹 `packages/web` (Vite+React): 컨디션 카드·TTFT 추이(+기준선)·정확도 트립와이어·일관성·문제군 레이더·드릴다운.

문제는 매 측정마다 **새로 생성**(시드 기반)되어 캐시·암기를 무력화하고, 고정 난이도(`FIXED_LEVEL`)를 유지합니다.

---

## 빠른 시작

```bash
npm install

# 컨디션 측정. 처음 몇 번은 기준선을 형성하고, 그 뒤부터 이탈을 감시합니다.
npm run bench -- --models opus,sonnet,haiku

# 대시보드 로컬 미리보기
npm run web:dev      # http://localhost:5173/intelligence/
```

기준선은 초기 `BASELINE_RUNS`회 측정으로 **고정**됩니다. 이후 매일 측정해 추이를 쌓으세요.
(같은 시각에 측정하면 지연 비교가 더 정확합니다.)

---

## 배포 (GitHub Pages)

1. GitHub repo 생성 후 push → **Settings → Pages → Source = GitHub Actions**
2. push 하면 `.github/workflows/deploy.yml`가 빌드·배포. base 경로는 repo 이름으로 자동.
3. 공개 URL: `https://<아이디>.github.io/<repo>/`

## 자동화 (매일 측정 → 게시)

```powershell
./packages/runner/run-and-publish.ps1 -Models "opus,sonnet,haiku"   # 측정 후 커밋·push
./packages/runner/schedule.ps1 -Time "09:00"                         # 매일 자동
```

---

## 데이터 형식

- `baselines.json` — 모델별 고정 기준선(TTFT 평균·표준편차, 정확도, 표본), 고정 여부.
- `history.json` — 런별 모델별 지연·정확도·일관성·문제군별 점수·컨디션.
- `latest.json` — 최근 런 전체 상세(생성된 문제·정답·모델 답안).
- `meta.json` — 문제군 카탈로그·고정 레벨·프로파일.

## 튜닝 (`packages/runner/src/config.mjs`)

`FIXED_LEVEL`(트립와이어 난이도) · `BASELINE_RUNS` · `BENCH_INSTANCES`/`BENCH_REPS` ·
`LAT_WARN`/`LAT_DEGRADED`(지연 임계 배수) · `ACC_WARN`/`ACC_DEGRADED`(정확도 트립와이어) ·
`DEFAULT_EFFORT`(**고정**; 바꾸면 지연 기준선이 무의미해짐).

## 한계 / 주의

- **레이트 리밋**: 측정 호출이 누적됩니다. Opus는 특히 보수적으로.
- Anthropic과 무관한 비공식 측정. 절대 공시값이 아니라 *상대적 컨디션(특히 지연) 변화*를 봅니다.
- 지연은 네트워크·시간대 영향도 받습니다. 같은 환경·시각에서 비교하세요.
- 기준선·레벨·effort를 바꾸면 새 시리즈로 보는 게 맞습니다.

## 확장(나중)

GPT·Gemini 어댑터는 v2. 현재는 **Claude 특화**.
