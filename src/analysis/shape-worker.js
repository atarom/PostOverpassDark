const DIMS = 4;
const BINS = 8;
const CELLS = BINS ** DIMS;
const bound = (list, value, upper = false) => {
  let a = 0;
  let b = list.length;
  while (a < b) {
    const mid = (a + b) >>> 1;
    if (list[mid] < value || upper && list[mid] === value) a = mid + 1;
    else b = mid;
  }
  return a;
};
const rank = (sorted, value) => sorted.length && sorted[0] !== sorted.at(-1) ? (bound(sorted, value) + bound(sorted, value, true)) / (2 * sorted.length) : 0.5;
const density = (values, reference) => {
  const n = values.length / DIMS;
  const scores = new Float64Array(n).fill(NaN);
  const reasons = new Uint8Array(n);
  const sorted = Array.from({ length: DIMS }, () => []);
  const eligible = [];
  for (let i = 0; i < n; i++) {
    let valid = true;
    for (let k = 0; k < DIMS; k++) if (!Number.isFinite(values[DIMS * i + k])) valid = false;
    if (!valid) continue;
    eligible.push(i);
    if (!reference || reference[i]) for (let k = 0; k < DIMS; k++) sorted[k].push(values[DIMS * i + k]);
  }
  const size = sorted[0].length;
  if (size < 30) return { scores, reasons, size, eligible: eligible.length };
  for (const list of sorted) list.sort((a, b) => a - b);
  const cells = new Uint32Array(CELLS);
  const coords = new Uint8Array(n * DIMS);
  const percentiles = new Float32Array(n * DIMS);
  const getCell = (i) => coords[4 * i] * 512 + coords[4 * i + 1] * 64 + coords[4 * i + 2] * 8 + coords[4 * i + 3];
  for (const i of eligible) {
    for (let k = 0; k < DIMS; k++) {
      const p = rank(sorted[k], values[DIMS * i + k]);
      percentiles[DIMS * i + k] = p;
      coords[DIMS * i + k] = Math.min(BINS - 1, Math.floor(p * BINS));
    }
    if (!reference || reference[i]) cells[getCell(i)]++;
  }
  const smooth = new Float64Array(CELLS);
  for (let a = 0; a < BINS; a++) for (let b = 0; b < BINS; b++) for (let c = 0; c < BINS; c++) for (let d = 0; d < BINS; d++) {
    let sum = 0;
    for (let x = Math.max(0, a - 1); x <= Math.min(BINS - 1, a + 1); x++) for (let y = Math.max(0, b - 1); y <= Math.min(BINS - 1, b + 1); y++) for (let z = Math.max(0, c - 1); z <= Math.min(BINS - 1, c + 1); z++) for (let w = Math.max(0, d - 1); w <= Math.min(BINS - 1, d + 1); w++) {
      const weight = (x === a ? 1 : 0.45) * (y === b ? 1 : 0.45) * (z === c ? 1 : 0.45) * (w === d ? 1 : 0.45);
      sum += cells[x * 512 + y * 64 + z * 8 + w] * weight;
    }
    smooth[a * 512 + b * 64 + c * 8 + d] = sum;
  }
  const densities = [];
  for (let i = 0; i < n; i++) if ((!reference || reference[i]) && Number.isFinite(values[DIMS * i])) densities.push(smooth[getCell(i)]);
  densities.sort((a, b) => a - b);
  const minimumSupport = Math.max(20, Math.min(size * 0.03, 1200));
  for (const i of eligible) {
    const concentration = smooth[getCell(i)];
    scores[i] = concentration < minimumSupport ? 100 * (1 - rank(densities, concentration)) : 0;
    let strongest = 0.9;
    for (let k = 0; k < DIMS; k++) if (percentiles[DIMS * i + k] > strongest) { strongest = percentiles[DIMS * i + k]; reasons[i] = k + 1; }
  }
  return { scores, reasons, size, eligible: eligible.length };
};
self.onmessage = ({ data }) => {
  try {
    const result = density(data.values, data.reference);
    self.postMessage({ id: data.id, ...result }, [result.scores.buffer, result.reasons.buffer]);
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error?.message || error) });
  }
};
