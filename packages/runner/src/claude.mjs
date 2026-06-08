// Drives Claude through the subscription/Plan account via Claude Code headless mode.
// This is the ONLY supported way to use a Plan account programmatically (no API key).

import { execFileSync } from 'node:child_process';
import { SYSTEM_PROMPT, DEFAULT_EFFORT, PER_CALL_TIMEOUT_MS } from './config.mjs';

let _bin = null;

// A transient SERVER-side limit ("not your usage limit") or overload — retryable. We must
// NOT score these as 0, or a momentary rate-limit reads as the model "getting dumber".
const RETRYABLE = /rate.?limit|temporarily limiting|overloaded|529|503|502|timeout|ETIMEDOUT|ECONNRESET/i;
const RETRY_BACKOFF_MS = [4000, 12000, 30000]; // up to 3 retries, exponential-ish
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Resolve the `claude` executable once (honour CLAUDE_BIN, else PATH lookup). */
export function resolveClaudeBin() {
  if (_bin) return _bin;
  if (process.env.CLAUDE_BIN) return (_bin = process.env.CLAUDE_BIN);
  const which = process.platform === 'win32' ? 'where' : 'which';
  try {
    const out = execFileSync(which, ['claude'], { encoding: 'utf8' });
    const first = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    if (first) return (_bin = first);
  } catch {
    /* fall through */
  }
  return (_bin = 'claude');
}

// Claude Code can report MULTIPLE models in modelUsage: the requested model PLUS
// an auxiliary haiku it uses internally. Naively taking Object.keys()[0] can grab
// that haiku key (e.g. `--model sonnet` mis-recorded as haiku, colliding with the
// real haiku row). Pick the key matching the requested family instead.
function pickResolvedModel(json, requested) {
  if (!json || !json.modelUsage) return requested;
  const keys = Object.keys(json.modelUsage);
  if (keys.length === 0) return requested;
  const fam = (/(opus|sonnet|haiku)/i.exec(requested) || [])[1];
  if (fam) {
    const hit = keys.find((k) => k.toLowerCase().includes(fam.toLowerCase()));
    if (hit) return hit;
  }
  return keys.find((k) => /(opus|sonnet|haiku)/i.test(k)) || keys[0];
}

/**
 * Ask Claude a single prompt under the pure-capability profile.
 *
 * Flags: tools off, MCP ignored, slash-commands off, no session files, minimal
 * system prompt, pinned effort. (Note: --bare is intentionally NOT used — it
 * forces API-key auth and would bypass the subscription.)
 *
 * @returns {{ok:boolean, result:string, ttftMs:number|null, durationMs:number|null,
 *            outputTokens:number|null, stopReason:string|null, resolvedModel:string,
 *            error:string|null}}
 */
export function askClaude(model, prompt, { effort = DEFAULT_EFFORT } = {}) {
  let last = null;
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    const r = _askOnce(model, prompt, effort);
    // success, or a NON-retryable failure (e.g. genuinely wrong/empty for another reason)
    if (r.ok || !r.error || !RETRYABLE.test(r.error)) return r;
    last = r;
    if (attempt < RETRY_BACKOFF_MS.length) {
      const wait = RETRY_BACKOFF_MS[attempt];
      process.stderr.write(`    ⟳ ${model} rate-limited, retry ${attempt + 1}/${RETRY_BACKOFF_MS.length} in ${wait / 1000}s\n`);
      sleepSync(wait);
    }
  }
  return { ...last, retriesExhausted: true };
}

function _askOnce(model, prompt, effort) {
  const bin = resolveClaudeBin();
  const args = [
    '-p',
    '--output-format', 'json',
    '--model', model,
    '--effort', effort,
    '--tools', '',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--disable-slash-commands',
    '--system-prompt', SYSTEM_PROMPT,
    prompt,
  ];

  try {
    const stdout = execFileSync(bin, args, {
      encoding: 'utf8',
      timeout: PER_CALL_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    const json = JSON.parse(stdout);
    const resolvedModel = pickResolvedModel(json, model);
    return {
      ok: json.is_error !== true && json.subtype === 'success',
      result: typeof json.result === 'string' ? json.result : '',
      ttftMs: json.ttft_ms ?? null,
      durationMs: json.duration_ms ?? null,
      outputTokens: json.usage?.output_tokens ?? null,
      stopReason: json.stop_reason ?? null,
      resolvedModel,
      error: null,
    };
  } catch (err) {
    // Non-zero exit (rate limit / overload), timeout, or unparseable output.
    let detail = err && err.message ? err.message : String(err);
    if (err && err.stdout) {
      try {
        const j = JSON.parse(err.stdout.toString());
        detail = j.result || j.error || detail;
      } catch {
        /* keep detail */
      }
    }
    return {
      ok: false, result: '', ttftMs: null, durationMs: null, outputTokens: null,
      stopReason: 'error', resolvedModel: model, error: detail,
    };
  }
}
