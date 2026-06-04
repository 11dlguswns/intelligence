import { Fragment, useState } from 'react';
import type { RunDetail } from '../types';
import { modelColor, modelLabel } from '../lib/model';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const cls = (r: number) => (r >= 0.999 ? 'pass-full' : r <= 0.001 ? 'pass-zero' : 'pass-part');

// Drill-down for the latest run: per problem-family pass rates, plus a sample
// generated problem and the model's actual answers (with the computed correct one).
export function FamilyTable({ latest, models }: { latest: RunDetail; models: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const present = models.filter((m) => latest.models.some((mm) => mm.resolved === m));
  const byModel = new Map(latest.models.map((m) => [m.resolved, m]));
  const base = present[0] ? byModel.get(present[0]) : latest.models[0];
  const fams = base?.families ?? [];

  if (present.length === 0) return <p className="muted">선택된 모델이 최근 런에 없습니다.</p>;

  return (
    <div className="qtable-wrap">
      <table className="qtable">
        <thead>
          <tr>
            <th>문제군</th>
            {present.map((m, i) => (
              <th key={m} style={{ color: modelColor(m, i) }}>
                {modelLabel(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fams.map((fam) => {
            const isOpen = open === fam.id;
            return (
              <Fragment key={fam.id}>
                <tr className="qrow" onClick={() => setOpen(isOpen ? null : fam.id)}>
                  <td className="qcell">
                    <span className="qchevron">{isOpen ? '▾' : '▸'}</span>
                    <span className="qtitle">{fam.title}</span>
                    <span className="qdim">{fam.id}</span>
                  </td>
                  {present.map((m) => {
                    const f = byModel.get(m)?.families.find((x) => x.id === fam.id);
                    if (!f) return <td key={m}>–</td>;
                    return (
                      <td key={m} className={`scorecell ${cls(f.passRate)}`}>
                        <span className="qpct">{pct(f.passRate)}</span>
                        <span className="qmodal">일관성 {pct(f.consistency)}</span>
                      </td>
                    );
                  })}
                </tr>
                {isOpen && (
                  <tr className="qdetail">
                    <td colSpan={present.length + 1}>
                      <div className="qsamples">
                        {present.map((m) => {
                          const f = byModel.get(m)?.families.find((x) => x.id === fam.id);
                          const inst = f?.instances?.[0];
                          return (
                            <div key={m} className="qsample">
                              <div className="qsample-head">
                                <span style={{ color: modelColor(m) }}>
                                  {modelLabel(m)} · L{byModel.get(m)?.level}
                                </span>
                              </div>
                              {inst && (
                                <>
                                  <div className="qprompt-mono">{inst.prompt}</div>
                                  <div className="qexpect">
                                    정답 <code>{inst.answer}</code>
                                  </div>
                                  <div className="qsample-answers">
                                    {inst.attempts.map((a, idx) => (
                                      <code
                                        key={idx}
                                        className={a.error ? 'ans-err' : a.correct ? 'ans-ok' : 'ans-bad'}
                                        title={a.error ?? a.raw}
                                      >
                                        {a.error ? '⚠ error' : a.raw?.slice(0, 44) || '∅'}
                                      </code>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
