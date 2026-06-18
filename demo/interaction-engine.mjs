// interaction-engine.mjs
// Generic, pure, deterministic interpreter for the interaction-logic JSON op DSL.
//
// Exports:
//   - applyAction(state, actionDef, args)  -> new state (deep-cloned, pre evaluated, eff applied)
//   - evalPre(state, ops, args)            -> throws on first failing precondition
//   - evalExpect(state, ops, args)         -> throws on first failing expectation
//   - applyEff(state, ops, args)           -> mutates the (already-cloned) state in place
//   - getPath / setPath / resolveValue     -> path + arg-ref helpers
//   - tierFor(gBalance)                    -> 'Bronze' | 'Silver' | 'Gold'
//
// The DSL is described in interaction-logic.json meta.opDSL. This engine mirrors it.
// ALL operations are pure: applyAction never mutates its input `state`.

// ----------------------------------------------------------------------------
// Deep clone (structuredClone if available, else JSON fallback — state is plain JSON)
// ----------------------------------------------------------------------------
export function deepClone(x) {
  if (typeof structuredClone === 'function') return structuredClone(x);
  return JSON.parse(JSON.stringify(x));
}

// ----------------------------------------------------------------------------
// Tier derivation (Bronze<100 / Silver 100..999 / Gold>=1000)
// ----------------------------------------------------------------------------
export function tierFor(gBalance) {
  if (gBalance >= 1000) return 'Gold';
  if (gBalance >= 100) return 'Silver';
  return 'Bronze';
}

// ----------------------------------------------------------------------------
// Path utilities
// ----------------------------------------------------------------------------

// Interpolate $arg segments inside a dot-path using the action args.
// e.g. "markets.$marketId.poolYes" with {marketId:'mkt-101'} -> "markets.mkt-101.poolYes"
function interpolatePath(path, args) {
  return path.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, name) => {
    if (args && Object.prototype.hasOwnProperty.call(args, name)) {
      return String(args[name]);
    }
    return m; // leave untouched if no matching arg (e.g. "$id" inside literal data)
  });
}

// Split a (already-interpolated) dot path into segments, with support for
// bracket selector segments like  shop[offerId=$offerId]  /  listings[id=lst-1].
// Returns array of segments: plain string keys, or {select:{field, value}} objects.
function splitPath(path) {
  const out = [];
  for (const raw of path.split('.')) {
    const m = raw.match(/^([A-Za-z0-9_$]+)\[([A-Za-z0-9_$]+)=([^\]]+)\]$/);
    if (m) {
      out.push(m[1]); // the collection key
      out.push({ select: { field: m[2], value: m[3] } });
    } else {
      out.push(raw);
    }
  }
  return out;
}

// Resolve a value to a primitive comparable, applying numeric coercion for array
// indices when the container is an array.
function readSegment(container, seg) {
  if (container == null) return undefined;

  // selector segment: find element in array (or object's values) by field==value
  if (typeof seg === 'object' && seg.select) {
    const { field, value } = seg.select;
    const list = Array.isArray(container) ? container : Object.values(container);
    return list.find((el) => el && String(el[field]) === String(value));
  }

  // derived/virtual segments on the bench array
  if (Array.isArray(container) && seg === 'filledCount') {
    return container.filter((b) => b && b.card != null).length;
  }

  // numeric index into an array
  if (Array.isArray(container)) {
    const idx = Number(seg);
    if (Number.isInteger(idx)) return container[idx];
    return undefined;
  }

  return container[seg];
}

// Get a value from state by an interpolated dot/selector path.
export function getPath(state, path, args = {}) {
  const interp = interpolatePath(path, args);
  const segs = splitPath(interp);
  let cur = state;
  for (const seg of segs) {
    cur = readSegment(cur, seg);
    if (cur === undefined) return undefined;
  }
  return cur;
}

// Set a value at an interpolated dot/selector path, creating intermediate
// objects as needed. Supports numeric array indices and selector segments.
export function setPath(state, path, value, args = {}) {
  const interp = interpolatePath(path, args);
  const segs = splitPath(interp);
  let cur = state;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    let next = readSegment(cur, seg);
    if (next === undefined || next === null) {
      // create container; peek next seg to decide array vs object
      const peek = segs[i + 1];
      const makeArray =
        (typeof peek !== 'object') && Number.isInteger(Number(peek));
      next = makeArray ? [] : {};
      writeSegment(cur, seg, next);
    }
    cur = next;
  }
  writeSegment(cur, segs[segs.length - 1], value);
  return state;
}

function writeSegment(container, seg, value) {
  if (typeof seg === 'object' && seg.select) {
    const { field, value: sv } = seg.select;
    const list = Array.isArray(container) ? container : Object.values(container);
    const el = list.find((e) => e && String(e[field]) === String(sv));
    if (el) Object.assign(el, value);
    return;
  }
  if (Array.isArray(container)) {
    const idx = Number(seg);
    container[idx] = value;
    return;
  }
  container[seg] = value;
}

// ----------------------------------------------------------------------------
// Value resolution: literals, "$arg" refs, "state:..." refs, and {if:...} conditionals
// ----------------------------------------------------------------------------

// Resolve a "state:..." reference. Supports selector paths and the special
// "state:now" handle resolving to state.now (epoch ms or comparable).
function resolveStateRef(state, ref, args) {
  const path = ref.slice('state:'.length);
  return getPath(state, path, args);
}

// Evaluate a conditional spec: {if: <cond>, then: <val>, else: <val>}
// cond forms:
//   "$argName"            -> truthiness of arg
//   "eq:$side:YES"        -> equality of resolved($side) === "YES"
function resolveConditional(state, spec, args) {
  const cond = spec.if;
  let truthy;
  if (typeof cond === 'string' && cond.startsWith('eq:')) {
    const [, lhsRaw, rhsRaw] = cond.split(':');
    const lhs = resolveValue(state, lhsRaw, args);
    const rhs = resolveValue(state, rhsRaw, args);
    truthy = String(lhs) === String(rhs);
  } else {
    truthy = !!resolveValue(state, cond, args);
  }
  return truthy
    ? resolveValue(state, spec.then, args)
    : resolveValue(state, spec.else, args);
}

// Resolve any value/by/min/max into a concrete value.
//   - {if:...}                -> conditional
//   - "$arg"                  -> args[arg]
//   - "state:path"            -> getPath(state, path)
//   - object/array literal    -> deep-resolve embedded refs (e.g. push value objects)
//   - "tierFor(agent.gBalance)" -> derived tier
//   - other strings that contain "$arg" interpolation but aren't pure refs are returned
//     with interpolation applied (e.g. "pos-$marketId-$side", "card-$offerId")
//   - everything else returned as-is
export function resolveValue(state, v, args = {}) {
  if (v == null) return v;

  if (typeof v === 'object' && !Array.isArray(v)) {
    if ('if' in v) return resolveConditional(state, v, args);
    // object literal: resolve each field
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = resolveValue(state, val, args);
    }
    return out;
  }

  if (Array.isArray(v)) {
    return v.map((el) => resolveValue(state, el, args));
  }

  if (typeof v === 'string') {
    if (v.startsWith('state:')) return resolveStateRef(state, v, args);
    if (v === 'tierFor(agent.gBalance)') return tierFor(getPath(state, 'agent.gBalance', args));
    // pure "$arg" reference (whole string is exactly one arg)
    const pureArg = v.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
    if (pureArg) {
      const name = pureArg[1];
      if (args && Object.prototype.hasOwnProperty.call(args, name)) return args[name];
      return v;
    }
    // string with embedded $arg interpolation (id templates etc.)
    if (v.includes('$')) {
      return interpolatePath(v, args);
    }
    return v;
  }

  return v; // number, boolean
}

// Read an operand referenced by a pre/expect op's `path` field. Unlike a value
// (resolveValue), a bare dot-path here means "read this path from state".
//   "$arg"        -> the arg value
//   "state:path"  -> getPath(path)
//   "a.b.c"       -> getPath(a.b.c)
function readOperand(state, path, args) {
  if (typeof path === 'string') {
    if (path.startsWith('state:')) return getPath(state, path.slice('state:'.length), args);
    const pureArg = path.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
    if (pureArg) {
      const name = pureArg[1];
      if (args && Object.prototype.hasOwnProperty.call(args, name)) return args[name];
    }
  }
  return getPath(state, path, args);
}

// ----------------------------------------------------------------------------
// Comparison ops (used by pre + expect)
// ----------------------------------------------------------------------------

function checkOp(state, op, args, kind /* 'pre' | 'expect' */) {
  // expect-only meta op: the step is asserted to throw during apply; if we reach
  // here the throw already happened (or for non-error flows it's a no-op assert
  // that the pre failed). We treat failsPre as satisfied when invoked in the
  // post-error assertion context (see runner). Standalone, evaluate as a no-op pass.
  if (op.op === 'failsPre') return { ok: true };

  // op.path is a state path EXCEPT when it is itself an arg reference ("$amount")
  // — several pre/expect ops assert directly on an arg value (e.g. between $amount).
  const path = op.path;
  const actual = readOperand(state, path, args);

  switch (op.op) {
    case 'eq': {
      const exp = resolveValue(state, op.value, args);
      return { ok: actual === exp, actual, expected: exp };
    }
    case 'neq': {
      const exp = resolveValue(state, op.value, args);
      return { ok: actual !== exp, actual, expected: exp };
    }
    case 'gte': {
      const exp = resolveValue(state, op.value, args);
      return { ok: actual >= exp, actual, expected: exp };
    }
    case 'lte': {
      const exp = resolveValue(state, op.value, args);
      return { ok: actual <= exp, actual, expected: exp };
    }
    case 'gt': {
      const exp = resolveValue(state, op.value, args);
      return { ok: actual > exp, actual, expected: exp };
    }
    case 'lt': {
      const exp = resolveValue(state, op.value, args);
      return { ok: actual < exp, actual, expected: exp };
    }
    case 'between': {
      const min = resolveValue(state, op.min, args);
      const max = resolveValue(state, op.max, args);
      return { ok: actual >= min && actual <= max, actual, expected: `[${min},${max}]` };
    }
    case 'isNull':
      return { ok: actual == null, actual, expected: 'null' };
    case 'notNull':
      return { ok: actual != null, actual, expected: 'notNull' };
    case 'len': {
      const exp = resolveValue(state, op.value, args);
      const len = Array.isArray(actual) ? actual.length : undefined;
      return { ok: len === exp, actual: len, expected: exp };
    }
    default:
      throw new Error(`Unknown ${kind} op: ${op.op}`);
  }
}

export function evalPre(state, ops = [], args = {}) {
  for (const op of ops) {
    const r = checkOp(state, op, args, 'pre');
    if (!r.ok) {
      const e = new Error(
        `Precondition failed: ${op.op}(${op.path}) actual=${JSON.stringify(r.actual)} expected=${JSON.stringify(r.expected)}`
      );
      e.isPreconditionError = true;
      e.op = op;
      throw e;
    }
  }
}

export function evalExpect(state, ops = [], args = {}) {
  for (const op of ops) {
    if (op.op === 'failsPre') continue; // handled by runner in error flows
    const r = checkOp(state, op, args, 'expect');
    if (!r.ok) {
      throw new Error(
        `Expectation failed: ${op.op}(${op.path}) actual=${JSON.stringify(r.actual)} expected=${JSON.stringify(r.expected)}`
      );
    }
  }
}

// ----------------------------------------------------------------------------
// Effect ops (mutate already-cloned state)
// ----------------------------------------------------------------------------

function applyEffOp(state, op, args) {
  switch (op.op) {
    case 'set': {
      const value = resolveValue(state, op.value, args);
      setPath(state, op.path, value, args);
      return;
    }
    case 'inc': {
      const by = resolveValue(state, op.by, args);
      const cur = getPath(state, op.path, args) ?? 0;
      setPath(state, op.path, cur + by, args);
      return;
    }
    case 'dec': {
      const by = resolveValue(state, op.by, args);
      const cur = getPath(state, op.path, args) ?? 0;
      setPath(state, op.path, cur - by, args);
      return;
    }
    case 'incClamp': {
      const by = resolveValue(state, op.by, args);
      const max = resolveValue(state, op.max, args);
      const cur = getPath(state, op.path, args) ?? 0;
      setPath(state, op.path, Math.min(cur + by, max), args);
      return;
    }
    case 'clampMax': {
      const max = resolveValue(state, op.max, args);
      const cur = getPath(state, op.path, args) ?? 0;
      setPath(state, op.path, Math.min(cur, max), args);
      return;
    }
    case 'push': {
      const value = resolveValue(state, op.value, args);
      const arr = getPath(state, op.path, args);
      if (!Array.isArray(arr)) throw new Error(`push target is not array: ${op.path}`);
      arr.push(value);
      return;
    }
    case 'pull': {
      const arr = getPath(state, op.path, args);
      if (!Array.isArray(arr)) throw new Error(`pull target is not array: ${op.path}`);
      const where = op.where || {};
      const idx = arr.findIndex((el) => {
        return Object.entries(where).every(([f, wv]) => {
          const want = resolveValue(state, wv, args);
          return el && String(el[f]) === String(want);
        });
      });
      if (idx >= 0) arr.splice(idx, 1);
      return;
    }
    case 'settlePositions':
      return applySettlePositions(state, op, args);
    case 'mintCardToBenchOrInventory':
      return applyMintCard(state, op, args);
    case 'moveInventoryCardToSlot':
      return applyMoveInventoryCardToSlot(state, op, args);
    default:
      throw new Error(`Unknown eff op: ${op.op}`);
  }
}

// settlePositions: parimutuel payout per the embedded rule object.
function applySettlePositions(state, op, args) {
  const arr = getPath(state, op.path, args);
  if (!Array.isArray(arr)) throw new Error('settlePositions target not array');
  const where = op.where || {};
  const rule = op.rule;
  const winner = resolveValue(state, rule.winnerSide, args); // "$winner"

  const marketId = resolveValue(state, args.marketId, args) ?? args.marketId;
  const poolYes = getPath(state, `markets.${marketId}.poolYes`);
  const poolNo = getPath(state, `markets.${marketId}.poolNo`);
  const mType = getPath(state, `markets.${marketId}.type`);

  const winPool = winner === 'YES' ? poolYes : poolNo;
  const losePool = winner === 'YES' ? poolNo : poolYes;
  const rakePct = mType === 'ORACLE' ? 10 : 0;
  const distributable = losePool - Math.floor((losePool * rakePct) / 100);

  for (const pos of arr) {
    const match = Object.entries(where).every(([f, wv]) => {
      const want = resolveValue(state, wv, args);
      return String(pos[f]) === String(want);
    });
    if (!match) continue;
    if (pos.side === winner) {
      const payout = pos.stake + Math.floor((pos.stake / winPool) * distributable);
      pos.payout = payout;
      // credit to agent.ore, clamped to oreCap
      const oreCap = getPath(state, 'agent.oreCap');
      const cur = getPath(state, 'agent.ore') ?? 0;
      setPath(state, 'agent.ore', Math.min(cur + payout, oreCap));
    } else {
      pos.payout = 0;
    }
    pos.settled = true;
  }
}

// mintCardToBenchOrInventory: resolve the card literal, auto-fill first empty bench
// slot if any (< benchMax filled), else push to inventory.
function applyMintCard(state, op, args) {
  const card = resolveValue(state, op.value, args);
  const bench = getPath(state, 'bench');
  const emptyIdx = bench.findIndex((b) => b && b.card == null);
  if (emptyIdx >= 0) {
    bench[emptyIdx].card = card;
  } else {
    const inv = getPath(state, 'inventory');
    inv.push(card);
  }
}

// moveInventoryCardToSlot: remove card from inventory by id, place into bench slot.
function applyMoveInventoryCardToSlot(state, op, args) {
  const cardId = resolveValue(state, op.cardId, args);
  const slotIndex = resolveValue(state, op.slotIndex, args);
  const inv = getPath(state, 'inventory');
  const idx = inv.findIndex((c) => c && String(c.id) === String(cardId));
  if (idx < 0) throw new Error(`moveInventoryCardToSlot: card ${cardId} not in inventory`);
  const [card] = inv.splice(idx, 1);
  const bench = getPath(state, 'bench');
  bench[Number(slotIndex)].card = card;
}

export function applyEff(state, ops = [], args = {}) {
  for (const op of ops) {
    applyEffOp(state, op, args);
  }
  return state;
}

// ----------------------------------------------------------------------------
// applyAction — the public entry point. Pure: clones input, evals pre, applies eff.
// ----------------------------------------------------------------------------
export function applyAction(state, actionDef, args = {}) {
  if (!actionDef) throw new Error('applyAction: missing actionDef');
  const next = deepClone(state);
  evalPre(next, actionDef.pre || [], args);
  applyEff(next, actionDef.eff || [], args);
  return next;
}

export default { applyAction, evalPre, evalExpect, applyEff, getPath, setPath, resolveValue, tierFor, deepClone };
