# Claude Intelligence Monitor

당신의 **Claude 플랜(구독) 계정**으로, 각 Claude 모델이 **자기 최고 실력 대비** 지금 얼마나 떨어졌는지
— 즉 "쓰다 보니 멍청해졌나"를 시간단위로 추적하는 도구입니다.

> 🔗 라이브: https://11dlguswns.github.io/intelligence/

---

## 무엇을, 왜 이렇게 재나

처음엔 정답률로 지능을 재려 했지만 실험 결과:

- **객관식 정답은 천장**입니다 — haiku(가장 작은 모델)도 AIME 경시 문제를 effort=low로 풉니다.
  정답 점수는 항상 ~100 → 변별·저하 감지 불가.
- 사람들이 "똑똑/멍청"으로 느끼는 건 정답 여부가 아니라 **추론의 질**입니다.

그래서 **AI 심사위원 지능 점수**를 씁니다:

1. 어려운 개방형 난문 10개(12공 저울·몬티홀·기사와 건달·확률 함정 등)를 모델이 풉니다.
2. **독립된 Opus 심사위원**이 답변 품질을 **0~100** 채점합니다.
   - 정확도 개선(리서치 반영): **레퍼런스 기반 채점**(정답을 함께 제공) + 명시적 루브릭 + 장황함 페널티.
3. 각 모델의 **최고점(역대 최고 점수 = 진짜 실력)** 을 기준으로, **현재가 얼마나 떨어졌는지**를 봅니다.
   - 최고점보다 8점↓ = 🟡 주의, 18점↓ = 🔴 멍청해짐.
   - 난문은 모델이 들쭉날쭉(노이즈)이라, "최고점 대비 하락"이 한 번의 운을 평탄화하고 *지속 하락*이 진짜 저하.

---

## 아키텍처 (수집 ↔ 표시 분리)

구독 OAuth는 공개 서버에 못 올리므로, **로컬 러너가 측정**하고 **결과 JSON만 정적 사이트**에 올립니다.

```
 [당신 PC] 러너 (claude 로그인)                 [GitHub Pages] 정적 대시보드
   답변 → Opus 심사위원 채점 → JSON   ── git push ──▶   최고점 대비 현재 + 시간별 추이
```

- 러너 `packages/runner` (의존성 0): `claude -p` 헤드리스, 도구 OFF·최소 시스템 프롬프트·effort 고정.
- 웹 `packages/web` (Vite+React): 모델별 현재 점수·최고점·하락폭·스파크라인, LIVE·25초 자동 새로고침.

---

## 빠른 시작

```bash
npm install
npm run bench -- --models opus,sonnet,haiku   # 1회 측정 (반복 시 최고점/기준 형성)
npm run web:dev                                # http://localhost:5173/intelligence/
```

## 시간단위 자동 측정 (실시간 추적)

```powershell
# 새 PowerShell 창에서 (프로젝트 폴더)
./packages/runner/schedule.ps1 -IntervalMinutes 60     # 매시간 측정→push→자동 배포
#   -IntervalMinutes 30 / -Models "opus" 등으로 조절. 0 = 매일 1회(-Time)
# 제거: Unregister-ScheduledTask -TaskName "ClaudeIntelligenceMonitor" -Confirm:$false
```

> ⚠️ 비용: 매시간 × N모델 × (질문 2배 호출). Opus 심사위원 부담이 큽니다 — 레이트리밋에 걸리면 간격↑/모델↓.

## 배포 (GitHub Pages)

repo push → Settings → Pages → Source = GitHub Actions. `.github/workflows/deploy.yml`가 빌드·배포(base 경로 자동).

---

## 한계 / 주의

- **노이즈**: 난문은 모델이 비결정적이라 한 번의 점수는 출렁입니다. 최고점 기준·임계값·시간별 추이로 완화하되,
  단일 측정의 하락은 "그 시점 약함"일 수 있습니다(지속 하락이 진짜 저하).
- **심사위원 편향**: LLM 채점은 자기선호·장황함 편향이 있습니다. 레퍼런스·루브릭으로 줄였고, 각 모델을
  자기 기준과 비교하므로 일정한 편향은 상쇄됩니다. 비공식 측정입니다.
- 질문·심사위원·effort를 바꾸면 새 시리즈로 보세요.

## 확장(나중)

GPT·Gemini 어댑터는 v2. 현재는 **Claude 특화**.
