import assert from "node:assert/strict";
import { osmIdentifiers, josmUrl, josmBatches, createJosmExporter } from "./josm-export.js";
const result = osmIdentifiers({ features: [
  { properties: { osm_type: "R", osm_id: 100 } },
  { properties: { osm_type: "R", osm_id: 100 } },
  { properties: { osm_type: "W", osm_id: "20" } },
  { properties: { osm_type: "N", osm_id: 4 } },
  { properties: { osm_type: "N", osm_id: -1 } },
  { properties: { osm_type: "W", osm_id: "20x" } },
  { properties: { name: "sin ID" } }
] });
assert.deepEqual(result, { ids: ["r100", "w20", "n4"], omitted: 3 });
const url = new URL(josmUrl(["r100", "w20", "n4"]));
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "8111");
assert.equal(url.pathname, "/load_object");
assert.equal(url.searchParams.get("objects"), "r100,w20,n4");
assert.equal(url.searchParams.get("relation_members"), "true");
assert.equal(url.searchParams.get("new_layer"), "true");
const large = Array.from({ length: 500 }, (_, i) => `w${1000000000 + i}`);
const chunks = josmBatches(large);
assert.ok(chunks.length > 1);
assert.deepEqual(chunks.flat(), large);
for (const [i, chunk] of chunks.entries()) assert.ok(josmUrl(chunk, i === 0).length <= 1700);
const make = () => ({ disabled: false, hidden: false, textContent: "", classList: { toggle() {} }, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; }, click() { return this.listeners.click(); } });
const container = make();
const sendButton = make();
const message = make();
let calls = [];
globalThis.fetch = async (input) => {
  const target = String(input);
  calls.push(target);
  if (target.endsWith("/version")) return { ok: true, json: async () => ({ protocolversion: { major: 1, minor: 9 } }) };
  return { ok: true };
};
const exporter = createJosmExporter({ container, sendButton, message });
assert.equal(container.hidden, true);
exporter.setEngine("postpass");
assert.equal(container.hidden, false);
exporter.setData({ features: [{ properties: { osm_type: "W", osm_id: 20 } }, { properties: { osm_type: "W", osm_id: 20 } }] });
assert.equal(sendButton.disabled, false);
await sendButton.click();
assert.equal(calls.length, 2);
assert.equal(calls[0], "http://127.0.0.1:8111/version");
assert.equal(new URL(calls[1]).searchParams.get("objects"), "w20");
assert.match(message.textContent, /1 objeto solicitado/);
calls = [];
exporter.setData({ features: large.map((id) => ({ properties: { osm_type: "W", osm_id: id.slice(1) } })) });
await sendButton.click();
assert.equal(calls.length, chunks.length + 1);
assert.equal(new URL(calls[1]).searchParams.get("new_layer"), "true");
assert.equal(new URL(calls[2]).searchParams.get("new_layer"), "false");
exporter.setData({ features: Array.from({ length: 501 }, (_, i) => ({ properties: { osm_type: "N", osm_id: i + 1 } })) });
assert.equal(sendButton.disabled, true);
assert.match(message.textContent, /Límite de envío/);
exporter.setData({ features: [{ properties: { osm_type: "N", osm_id: 5 } }] });
globalThis.fetch = async () => { throw TypeError("Failed to fetch"); };
await sendButton.click();
assert.match(message.textContent, /Control remoto activado/);
assert.equal(sendButton.disabled, false);
globalThis.fetch = async () => ({ ok: true, json: async () => ({ protocolversion: { major: 2, minor: 0 } }) });
await sendButton.click();
assert.match(message.textContent, /Versión incompatible/);
exporter.setEngine("overpass");
assert.equal(container.hidden, true);
assert.equal(sendButton.disabled, true);
console.log("Pruebas JOSM Remote Control superadas");
