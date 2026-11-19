const rad = Math.PI / 180;
const earth = 6371008.8;
const choices = [3, 5, 8, 12, 20, 30];
const sensitivities = [1, 1.5, 2, 3];
let points = new Float64Array(0);
let count = 0;
let tree = null;
let neighborK = 0;
let neighborDistances = null;
const coordinate = (index, axis) => points[index * 2 + axis];
const square = (n) => n * n;
const percentile = (sorted, fraction) => {
  const pos = (sorted.length - 1) * fraction;
  const a = Math.floor(pos);
  return sorted[a] + (sorted[Math.min(a + 1, sorted.length - 1)] - sorted[a]) * (pos - a);
};
const buildTree = (ids, depth = 0) => {
  if (!ids.length) return null;
  const axis = depth & 1;
  ids.sort((a, b) => coordinate(a, axis) - coordinate(b, axis));
  const middle = ids.length >> 1;
  return { id: ids[middle], axis, left: buildTree(ids.slice(0, middle), depth + 1), right: buildTree(ids.slice(middle + 1), depth + 1) };
};
const nearest = (target, k) => {
  const distances = [];
  const add = (id, distance) => {
    if (id === target) return;
    if (distances.length < k) {
      distances.push(distance);
      distances.sort((a, b) => b - a);
    } else if (distance < distances[0]) {
      distances[0] = distance;
      distances.sort((a, b) => b - a);
    }
  };
  const visit = (node) => {
    if (!node) return;
    const delta = coordinate(target, node.axis) - coordinate(node.id, node.axis);
    const first = delta < 0 ? node.left : node.right;
    visit(first);
    add(node.id, square(coordinate(target, 0) - coordinate(node.id, 0)) + square(coordinate(target, 1) - coordinate(node.id, 1)));
    if (distances.length < k || square(delta) <= distances[0]) visit(delta < 0 ? node.right : node.left);
  };
  visit(tree);
  distances.sort((a, b) => a - b);
  return distances;
};
const report = (request, stage, completed, total) => postMessage({ type: "progress", request, stage, completed, total });
const ensureNeighbors = (k, request) => {
  if (neighborDistances && neighborK >= k) { report(request, "Buscando vecinos", count, count); return; }
  const data = new Float64Array(count * k);
  for (let i = 0; i < count; i++) {
    const nearestDistances = nearest(i, k);
    data.set(nearestDistances, i * k);
    if (i % 300 === 0 || i === count - 1) report(request, "Buscando vecinos", i + 1, count);
  }
  neighborDistances = data;
  neighborK = k;
};
const calculate = (settings, request) => {
  const started = performance.now();
  const auto = settings.mode === "auto";
  const absolute = settings.mode === "distance";
  const ks = absolute ? [1] : auto ? choices.filter((k) => k < count) : [Math.min(count - 1, Math.max(1, Math.floor(settings.k)))];
  if (!ks.length) ks.push(count - 1);
  const maximum = Math.max(...ks);
  ensureNeighbors(maximum, request);
  const scores = new Float64Array(count);
  const intensities = auto ? new Float64Array(count) : null;
  let distances = null;
  let threshold = 0;
  const raw = new Float64Array(count);
  for (let step = 0; step < ks.length; step++) {
    const k = ks[step];
    for (let i = 0; i < count; i++) raw[i] = Math.sqrt(neighborDistances[i * neighborK + k - 1]);
    if (absolute) {
      distances = raw.slice();
      scores.set(raw);
      report(request, "Analizando distancias", step + 1, ks.length);
      continue;
    }
    const sorted = raw.slice().sort();
    const q1 = percentile(sorted, .25);
    const q3 = percentile(sorted, .75);
    const iqr = q3 - q1;
    if (auto) {
      for (const multiplier of sensitivities) {
        const boundary = q3 + multiplier * iqr;
        for (let i = 0; i < count; i++) if (raw[i] > boundary) {
          scores[i]++;
          intensities[i] += Math.log1p((raw[i] - boundary) / Math.max(boundary, 1));
        }
      }
    } else {
      threshold = q3 + settings.sensitivity * iqr;
      scores.set(raw);
    }
    report(request, "Analizando distancias", step + 1, ks.length);
  }
  if (auto) {
    const total = ks.length * sensitivities.length;
    const ranked = [];
    for (let i = 0; i < count; i++) if (scores[i] > 0) ranked.push(i);
    ranked.sort((a, b) => scores[a] - scores[b] || intensities[a] - intensities[b] || a - b);
    let start = 0;
    while (start < ranked.length) {
      let end = start + 1;
      while (end < ranked.length && scores[ranked[end]] === scores[ranked[start]] && intensities[ranked[end]] === intensities[ranked[start]]) end++;
      const position = (start + end) / 2;
      const rarity = 100 * position / ranked.length;
      for (let j = start; j < end; j++) scores[ranked[j]] = rarity;
      start = end;
    }
    threshold = settings.rarity;
  } else if (absolute) {
    const ranked = Array.from({ length: count }, (_, i) => i);
    ranked.sort((a, b) => scores[a] - scores[b] || a - b);
    let start = 0;
    while (start < count) {
      let end = start + 1;
      while (end < count && scores[ranked[end]] === scores[ranked[start]]) end++;
      const percentile = 100 * (start + end) / (2 * count);
      for (let j = start; j < end; j++) scores[ranked[j]] = percentile;
      start = end;
    }
    threshold = settings.rarity;
  }
  let isolated = 0;
  for (let i = 0; i < count; i++) if (scores[i] > threshold) isolated++;
  return { type: "result", request, scores, distances, threshold, isolated, total: count, mode: settings.mode, elapsed: Math.round(performance.now() - started), combinations: auto ? ks.length * sensitivities.length : 1 };
};
onmessage = ({ data }) => {
  try {
    if (data.type === "load") {
      const input = new Float64Array(data.buffer);
      count = input.length / 2;
      let meanLatitude = 0;
      for (let i = 0; i < count; i++) meanLatitude += input[i * 2 + 1];
      const scale = Math.cos(meanLatitude / count * rad);
      points = new Float64Array(input.length);
      for (let i = 0; i < count; i++) {
        points[i * 2] = input[i * 2] * rad * earth * scale;
        points[i * 2 + 1] = input[i * 2 + 1] * rad * earth;
      }
      tree = buildTree(Array.from({ length: count }, (_, i) => i));
      neighborK = 0;
      neighborDistances = null;
      postMessage({ type: "ready", count });
    }
    if (data.type === "calc") {
      const result = calculate(data.settings, data.request);
      postMessage(result, result.distances ? [result.scores.buffer, result.distances.buffer] : [result.scores.buffer]);
    }
  } catch (error) {
    postMessage({ type: "error", request: data.request, message: String(error?.message || error) });
  }
};
