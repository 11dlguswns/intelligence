import { PROBLEMS, generateInstances, gradeInstance, formatAnswer } from './problems.mjs';

let fails = 0;
const seeds = ['2026-06-05T10-00-00-aaa', '2026-06-05T12-00-00-bbb', '2026-06-05T14-00-00-ccc', 'xyz-42', 'seed-99'];

// 1) generation never throws + correct answer always grades 100
for (const seed of seeds) {
  const inst = generateInstances(seed);
  for (const q of inst) {
    const correctReply = `풀이 생략.\n정답: ${formatAnswer(q)}`;
    const sc = gradeInstance(q, correctReply);
    if (sc !== 100) {
      console.log(`✗ [${q.id}] correct answer scored ${sc} (seed ${seed}) ans=${formatAnswer(q)}`);
      fails++;
    }
  }
}

// 2) a deliberately wrong answer should NOT score 100
{
  const inst = generateInstances('wrongcheck');
  for (const q of inst) {
    let wrong;
    if (q.type === 'int') wrong = `정답: ${q.answer + 7}`;
    else if (q.type === 'frac') wrong = `정답: ${q.answer.n + 1}/${q.answer.d + 3}`;
    else if (q.type === 'set') wrong = `정답: ${q.meta.people.filter((p) => !q.answer.includes(p)).join(', ') || '없음'}`; // invert
    else if (q.type === 'seq') wrong = `정답: ${[...q.answer].reverse().join(', ')}`;
    const sc = gradeInstance(q, wrong);
    if (sc === 100) {
      console.log(`✗ [${q.id}] WRONG answer scored 100 — grader too loose. ans=${formatAnswer(q)} wrong=${wrong}`);
      fails++;
    }
  }
}

// 3) show one full sample set for eyeballing
console.log('\n──── sample instances (seed demo) ────');
for (const q of generateInstances('demo-seed-1')) {
  console.log(`\n● [${q.dimension}/${q.id}] ${q.title}`);
  console.log(q.prompt);
  console.log(`  ⟶ 정답: ${formatAnswer(q)}`);
}

console.log(`\n${fails === 0 ? '✔ ALL CHECKS PASSED' : '✗ ' + fails + ' FAILURES'} · families=${PROBLEMS.length}`);
process.exit(fails === 0 ? 0 : 1);
