const rad = Math.PI / 180;
const radius = 6371008.8;
let points = new Float64Array(0);
let length = 0;
let tree = null;
let cachedK = 0;
let cachedNeighbors = null;
const square = (value) => value * value;
const midpoint = (values, fraction) => {
  const index = (values.length - 1) * fraction;
  const low = Math.floor(index);
  return values[low] + (values[Math.min(low + 1, values.length - 1)] - values[low]) * (index - low);
};
const coordinate = (index, axis) => points[index * 2 + axis];
const makeTree = (ids, depth = 0) => {
  if (!ids.length) return null;
  const axis = depth % 2;
  ids.sort((a, b) => coordinate(a, axis) - coordinate(b, axis));
  const middle = ids.length >> 1;
  return { id: ids[middle], axis, left: makeTree(ids.slice(0, middle), depth + 1), right: makeTree(ids.slice(middle + 1), depth + 1) };
};
const nearest = (target, k) => {
  const best = [];
  const push = (id, distance) => {
    if (id === target) return;
    if (best.length < k) {
      best.push({ id, distance });
      best.sort((a, b) => b.distance - a.distance);
    } else if (distance < best[0].distance) {
      best[0] = { id, distance };
      best.sort((a, b) => b.distance - a.distance);
    }
  };
  const visit = (node) => {
    if (!node) return;
    const delta = coordinate(target, node.axis) - coordinate(node.id, node.axis);
    visit(delta < 0 ? node.left : node.right);
    const distance = square(coordinate(target, 0) - coordinate(node.id, 0)) + square(coordinate(target, 1) - coordinate(node.id, 1));
    push(node.id, distance);
    if (best.length < k || square(delta) <= best[0].distance) visit(delta < 0 ? node.right : node.left);
  };
  visit(tree);
  best.sort((a, b) => a.distance - b.distance);
  return best;
};
const neighborsFor = (k) => {
  if (cachedNeighbors && cachedK === k) return cachedNeighbors;
  const ids = new Int32Array(length * k);
  const distances = new Float64Array(length * k);
  for (let i = 0; i < length; i++) {
    const found = nearest(i, k);
    for (let j = 0; j < k; j++) {
      ids[i * k + j] = found[j].id;
      distances[i * k + j] = found[j].distance;
    }
  }
  cachedNeighbors = { ids, distances };
  cachedK = k;
  return cachedNeighbors;
};
const calculate = (settings) => {
  const scores = new Float64Array(length);
  const flags = new Int8Array(length);
  if (length < 3) return { scores, flags, cutoff: NaN, clusters: 0 };
  const k = Math.min(Math.max(1, Math.floor(settings.k)), length - 1);
  let cutoff = 0;
  let clusters = 0;
  if (settings.method === "knn" || settings.method === "lof") {
    const neighbors = neighborsFor(k);
    const kth = new Float64Array(length);
    for (let i = 0; i < length; i++) kth[i] = Math.sqrt(neighbors.distances[i * k + k - 1]);
    if (settings.method === "knn") scores.set(kth);
    else {
      const density = new Float64Array(length);
      for (let i = 0; i < length; i++) {
        let reachability = 0;
        for (let j = 0; j < k; j++) {
          const position = i * k + j;
          reachability += Math.max(kth[neighbors.ids[position]], Math.sqrt(neighbors.distances[position]));
        }
        density[i] = reachability ? k / reachability : Infinity;
      }
      for (let i = 0; i < length; i++) {
        let total = 0;
        for (let j = 0; j < k; j++) {
          const comparison = density[neighbors.ids[i * k + j]];
          total += !Number.isFinite(density[i]) ? Number.isFinite(comparison) ? 0 : 1 : comparison / density[i];
        }
        scores[i] = Number.isFinite(total) ? total / k : 1e12;
      }
    }
    const sorted = Array.from(scores).filter(Number.isFinite).sort((a, b) => a - b);
    const q1 = midpoint(sorted, .25);
    const q3 = midpoint(sorted, .75);
    cutoff = settings.method === "knn" ? q3 + settings.sensitivity * (q3 - q1) : settings.lofThreshold > 0 ? settings.lofThreshold : Math.max(1.2, q3 + settings.sensitivity * (q3 - q1));
    for (let i = 0; i < length; i++) flags[i] = scores[i] > cutoff ? 1 : 0;
  } else {
    const distance = Math.max(1, settings.radius);
    const minimum = Math.max(2, Math.floor(settings.minPoints));
    const grid = new Map();
    const xs = new Int32Array(length);
    const ys = new Int32Array(length);
    const key = (x, y) => `${x}/${y}`;
    for (let i = 0; i < length; i++) {
      xs[i] = Math.floor(coordinate(i, 0) / distance);
      ys[i] = Math.floor(coordinate(i, 1) / distance);
      const address = key(xs[i], ys[i]);
      if (!grid.has(address)) grid.set(address, []);
      grid.get(address).push(i);
    }
    const neighbors = (index) => {
      const output = [];
      for (let x = xs[index] - 1; x <= xs[index] + 1; x++) for (let y = ys[index] - 1; y <= ys[index] + 1; y++) {
        for (const id of grid.get(key(x, y)) || []) if (square(coordinate(id, 0) - coordinate(index, 0)) + square(coordinate(id, 1) - coordinate(index, 1)) <= square(distance)) output.push(id);
      }
      return output;
    };
    const labels = new Int32Array(length);
    for (let i = 0; i < length; i++) {
      if (labels[i]) continue;
      const initial = neighbors(i);
      if (initial.length < minimum) { labels[i] = -1; continue; }
      const cluster = ++clusters;
      labels[i] = cluster;
      const queue = initial.slice();
      const enqueued = new Uint8Array(length);
      for (const id of queue) enqueued[id] = 1;
      for (let head = 0; head < queue.length; head++) {
        const id = queue[head];
        if (labels[id] === -1) { labels[id] = cluster; continue; }
        if (labels[id]) continue;
        labels[id] = cluster;
        const nearby = neighbors(id);
        if (nearby.length >= minimum) for (const candidate of nearby) if (!enqueued[candidate]) { queue.push(candidate); enqueued[candidate] = 1; }
      }
    }
    for (let i = 0; i < length; i++) {
      flags[i] = labels[i] === -1 ? 1 : 0;
      scores[i] = flags[i];
    }
    cutoff = distance;
  }
  return { scores, flags, cutoff, clusters };
};
onmessage = ({ data }) => {
  try {
    if (data.type === "load") {
      const coords = new Float64Array(data.buffer);
      length = coords.length / 2;
      let latitude = 0;
      for (let i = 0; i < length; i++) latitude += coords[2 * i + 1];
      const scale = Math.cos(latitude / Math.max(1, length) * rad);
      points = new Float64Array(coords.length);
      for (let i = 0; i < length; i++) {
        points[2 * i] = coords[2 * i] * rad * radius * scale;
        points[2 * i + 1] = coords[2 * i + 1] * rad * radius;
      }
      tree = makeTree(Array.from({ length }, (_, i) => i));
      cachedNeighbors = null;
      cachedK = 0;
      postMessage({ type: "ready", count: length });
    }
    if (data.type === "calc") {
      const started = performance.now();
      const result = calculate(data.settings);
      postMessage({ type: "result", request: data.request, ...result, elapsed: Math.round(performance.now() - started) }, [result.scores.buffer, result.flags.buffer]);
    }
  } catch (error) {
    postMessage({ type: "error", message: String(error?.message || error) });
  }
};
