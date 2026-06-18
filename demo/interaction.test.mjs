// interaction.test.mjs
// Loads interaction-logic.json, builds initialState, and runs every flow:
//   - for each step: look up the action def, apply it with the step args, then
//     check the step's "expect" ops.
//   - flows / steps marked expectError:true must throw during apply (precondition
//     failure); we assert that and that any "failsPre" expect op is satisfied.
//   - prints "PASS/FAIL <flow>.<step>" per case + a final "N passed, M failed".
//   - exits non-zero if any case fails.
//
// Pure, deterministic, no deps, no browser. Run:
//   node /mnt/data2/kenji/galxe/game/demo/interaction.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  applyAction,
  evalPre,
  evalExpect,
  deepClone,
  getPath,
  setPath,
} from './interaction-engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC = JSON.parse(readFileSync(join(__dirname, 'interaction-logic.json'), 'utf8'));

// Fixed "now" baseline so relative resolveAt strings ("+52m") are deterministic.
const NOW0 = 1_700_000_000_000; // arbitrary fixed epoch ms

// Convert "+Nm" / "+Nh" relative strings into absolute epoch ms from NOW0.
function resolveRelativeTime(v) {
  if (typeof v !== 'string') return v;
  const m = v.match(/^\+(\d+)([mh])$/);
  if (!m) return v;
  const n = Number(m[1]);
  const unit = m[2] === 'h' ? 3600_000 : 60_000;
  return NOW0 + n * unit;
}

// Build a fresh initialState with relative times resolved and `now` injected.
function freshInitialState() {
  const s = deepClone(SPEC.initialState);
  for (const mid of Object.keys(s.markets || {})) {
    s.markets[mid].resolveAt = resolveRelativeTime(s.markets[mid].resolveAt);
  }
  for (const qid of Object.keys(s.questions || {})) {
    s.questions[qid].resolveAt = resolveRelativeTime(s.questions[qid].resolveAt);
  }
  s.now = NOW0; // current chain time
  return s;
}

const actionsById = Object.fromEntries(SPEC.actions.map((a) => [a.id, a]));

// ---------------------------------------------------------------------------
// Per-flow setup. The edge flows describe their starting state in "_setup" prose.
// We encode those preconditions here as explicit state mutations from initialState.
// (The happy-path flow needs no setup; it builds state through its own steps.)
// ---------------------------------------------------------------------------

function makeAgent(overrides = {}) {
  // The standard freshly-created demo agent (matches createAgent eff).
  return {
    id: 42,
    name: 'Tessellate',
    archetype: 'Warlord',
    personality: 'test',
    goal: 'Expand north, then dominate the prediction markets.',
    color: '#2dd4bf',
    ore: 200,
    oreCap: 1000,
    gBalance: 240,
    hexCount: 7,
    buildings: 0,
    elo: 1000,
    chronicleScore: 0,
    autopilot: true,
    ownerWallet: '0xAb12…cd34',
    territory: [],
    ...overrides,
  };
}

const SETUPS = {
  'edge-bet-below-min'(s) {
    s.user = { connected: true, wallet: '0xAb12…cd34', agentId: 42 };
    s.agent = makeAgent({ ore: 200, autopilot: false });
  },
  'edge-bet-above-max'(s) {
    s.user = { connected: true, wallet: '0xAb12…cd34', agentId: 42 };
    s.agent = makeAgent({ ore: 600, autopilot: false });
  },
  'edge-bet-exceeds-balance'(s) {
    s.user = { connected: true, wallet: '0xAb12…cd34', agentId: 42 };
    s.agent = makeAgent({ ore: 30, autopilot: false });
  },
  'edge-manual-action-while-autopilot-on'(s) {
    s.user = { connected: true, wallet: '0xAb12…cd34', agentId: 42 };
    s.agent = makeAgent({ ore: 200, autopilot: true }); // autopilot ON
  },
  'edge-double-resolve'(s) {
    s.user = { connected: true, wallet: '0xAb12…cd34', agentId: 42 };
    s.agent = makeAgent({ autopilot: false });
    // mkt-102 is the legacy ORE market and already resolved with winner YES.
    s.markets['mkt-102'].resolved = true;
    s.markets['mkt-102'].winner = 'YES';
    // now is past mkt-102 close so only the "already resolved" guard can trip
    s.now = s.markets['mkt-102'].resolveAt + 60_000;
  },
  'edge-resolve-before-close'(s) {
    s.user = { connected: true, wallet: '0xAb12…cd34', agentId: 42 };
    s.agent = makeAgent({ autopilot: false });
    // now strictly before mkt-102.resolveAt (default: NOW0 < +128m). Keep NOW0.
  },
  'edge-buycard-insufficient-g'(s) {
    s.user = { connected: true, wallet: '0xAb12…cd34', agentId: 42 };
    s.agent = makeAgent({ gBalance: 2, autopilot: false });
  },
  'edge-ore-cap-clamp-wasted'(s) {
    s.user = { connected: true, wallet: '0xAb12…cd34', agentId: 42 };
    s.agent = makeAgent({ ore: 990, autopilot: false });
  },
};

// Per-step time handling: the happy-path resolveMarket step carries
// args._atTime ">resolveAt" — advance `now` past the market's resolveAt.
function applyStepTime(state, step) {
  const at = step.args && step.args._atTime;
  if (at === '>resolveAt') {
    const id = step.args.marketId || step.args.questionId;
    const root = step.args.questionId ? 'questions' : 'markets';
    const ra = getPath(state, `${root}.${id}.resolveAt`);
    if (typeof ra === 'number') state.now = ra + 60_000;
  }
  return state;
}

// Strip control-only keys from args before passing to the engine.
function cleanArgs(args = {}) {
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === '_atTime') continue;
    out[k] = v;
  }
  return out;
}

function applyResolveQuestion(state, def, args) {
  const next = deepClone(state);
  evalPre(next, def.pre || [], args);

  const qid = args.questionId;
  const winner = args.winner;
  const q = getPath(next, `questions.${qid}`);
  if (!q) throw new Error(`resolveQuestion: missing question ${qid}`);

  q.status = 'RESOLVED';
  q.resolved = true;
  q.winner = winner;

  const winPool = winner === 'YES' ? q.poolYes : q.poolNo;
  const losePool = winner === 'YES' ? q.poolNo : q.poolYes;
  const feeG = Math.floor(losePool * 2 / 100);
  const taxG = Math.floor(losePool * 3 / 100);
  const burnG = Math.floor(losePool * 2 / 100);
  const eventPoolG = Math.floor(losePool * 3 / 100);
  const distributable = Math.max(0, losePool - feeG - taxG - burnG - eventPoolG);

  const positions = getPath(next, 'positions') || [];
  for (const pos of positions) {
    if (String(pos.questionId) !== String(qid) || pos.settled) continue;
    const payout = pos.side === winner
      ? pos.stake + Math.floor((pos.stake / winPool) * distributable)
      : 0;
    pos.settled = true;
    pos.winner = winner;
    pos.payout = payout;
    pos.payoutCurrency = q.currency;
    pos.feeG = q.currency === 'G' ? feeG : 0;
    pos.taxG = q.currency === 'G' ? taxG : 0;
    pos.burnG = q.currency === 'G' ? burnG : 0;
    pos.eventPoolG = q.currency === 'G' ? eventPoolG : 0;

    if (payout > 0) {
      if (q.currency === 'G') {
        setPath(next, 'agent.gBalance', (getPath(next, 'agent.gBalance') || 0) + payout);
      } else {
        const cap = getPath(next, 'agent.oreCap');
        setPath(next, 'agent.ore', Math.min((getPath(next, 'agent.ore') || 0) + payout, cap));
      }
    }
  }

  if (q.currency === 'G') {
    setPath(next, 'worldTreasury.surplusG', getPath(next, 'worldTreasury.surplusG') + feeG + taxG);
    setPath(next, 'worldTreasury.protocolBurnG', getPath(next, 'worldTreasury.protocolBurnG') + burnG);
    setPath(next, 'worldTreasury.eventPrizePoolG', getPath(next, 'worldTreasury.eventPrizePoolG') + eventPoolG);
  }

  return next;
}

function applySpecAction(state, def, args) {
  if (def.id === 'resolveQuestion') return applyResolveQuestion(state, def, args);
  return applyAction(state, def, args);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failingCases = [];
const lines = [];

function record(ok, name, detail) {
  if (ok) {
    passed++;
    lines.push(`PASS ${name}`);
  } else {
    failed++;
    failingCases.push(name);
    lines.push(`FAIL ${name}${detail ? ' :: ' + detail : ''}`);
  }
}

for (const flow of SPEC.flows) {
  let state = freshInitialState();
  if (SETUPS[flow.id]) SETUPS[flow.id](state);

  const flowExpectsError = flow.expectError === true;
  let stepNo = 0;

  for (const step of flow.steps) {
    stepNo++;
    const caseName = `${flow.id}.step${stepNo}:${step.action}`;
    const def = actionsById[step.action];
    if (!def) {
      record(false, caseName, `unknown action ${step.action}`);
      continue;
    }

    const args = cleanArgs(step.args);
    // Advance time for this step if requested.
    applyStepTime(state, step);

    const stepExpectsError =
      flowExpectsError ||
      (step.expect || []).some((e) => e.op === 'failsPre');

    if (stepExpectsError) {
      // Must throw on apply (precondition failure). State must be unchanged,
      // so we assert the "expect" ops (eq/len/etc.) against the PRE-apply state.
      let threw = false;
      let errMsg = '';
      try {
        const next = applySpecAction(state, def, args);
        // Did not throw -> if it returned, that's a failure for an error flow.
        state = next;
      } catch (err) {
        threw = true;
        errMsg = err.message;
      }
      if (!threw) {
        record(false, caseName, 'expected action to throw but it succeeded');
        continue;
      }
      // Assert post-error invariants (non-failsPre expect ops) against unchanged state.
      try {
        evalExpect(state, step.expect || [], args);
        record(true, caseName, `threw as expected: ${errMsg}`);
      } catch (e) {
        record(false, caseName, `threw, but post-state assertion failed: ${e.message}`);
      }
    } else {
      // Normal step: apply, then check expectations.
      try {
        const next = applySpecAction(state, def, args);
        state = next;
        evalExpect(state, step.expect || [], args);
        record(true, caseName);
      } catch (err) {
        record(false, caseName, err.message);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
console.log(`TAP version 13`);
console.log(`1..${passed + failed}`);
let i = 0;
for (const line of lines) {
  i++;
  const ok = line.startsWith('PASS');
  console.log(`${ok ? 'ok' : 'not ok'} ${i} - ${line.replace(/^PASS |^FAIL /, '')}`);
}
console.log('');
console.log(`${passed} passed, ${failed} failed`);
if (failingCases.length) {
  console.log('Failing cases:');
  for (const f of failingCases) console.log(`  - ${f}`);
}

process.exit(failed > 0 ? 1 : 0);
