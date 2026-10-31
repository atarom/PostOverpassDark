const encoder = new TextEncoder();
const LISTS = /\b(?:(?:node|way|rel|relation|nw|nr|wr|nwr)\s*\(\s*id\s*:\s*|(?:osm_id|id)\s+IN\s*\(\s*)([1-9]\d*(?:\s*,\s*[1-9]\d*){7,})\s*\)/gi;
const maskIgnored = (query) => {
  const chars = query.split("");
  const blank = (start, end) => {
    for (let i = start; i < end; i++) if (query[i] !== "\n" && query[i] !== "\r") chars[i] = " ";
  };
  for (let i = 0; i < query.length;) {
    const start = i;
    if (query.startsWith("//", i) || query.startsWith("--", i)) {
      i = query.indexOf("\n", i);
      if (i < 0) i = query.length;
    } else if (query.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (i < query.length && depth) {
        if (query.startsWith("/*", i)) { depth++; i += 2; }
        else if (query.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
    } else if (query[i] === "'" || query[i] === '"') {
      const quote = query[i++];
      while (i < query.length) {
        if (query[i] === "\\") { i += 2; continue; }
        if (query[i++] === quote) {
          if (query[i] === quote) i++;
          else break;
        }
      }
    } else if (query[i] === "$") {
      const tag = query.slice(i).match(/^\$(?:[A-Za-z_]\w*)?\$/)?.[0];
      if (!tag) { i++; continue; }
      const end = query.indexOf(tag, i + tag.length);
      i = end < 0 ? query.length : end + tag.length;
    } else { i++; continue; }
    blank(start, Math.min(i, query.length));
  }
  return chars.join("");
};
const putVar = (bytes, number) => {
  while (number >= 128) {
    bytes.push(number % 128 + 128);
    number = Math.floor(number / 128);
  }
  bytes.push(number);
};
const getVar = (bytes, pos) => {
  let value = 0;
  let multiplier = 1;
  for (let i = 0; i < 8; i++) {
    if (pos.index >= bytes.length) throw Error("Lista de IDs incompleta");
    const byte = bytes[pos.index++];
    value += (byte & 127) * multiplier;
    if (!Number.isSafeInteger(value)) throw Error("ID fuera de rango");
    if (byte < 128) return value;
    multiplier *= 128;
  }
  throw Error("Codificación de IDs no válida");
};
const append = (target, source) => { for (const byte of source) target.push(byte); };
export const encodeIdLists = (data, query) => {
  const headerLength = data.length - encoder.encode(query).length;
  if (headerLength < 0) return null;
  const groups = [];
  for (const match of maskIgnored(query).matchAll(LISTS)) {
    const values = match[1].split(/\s*,\s*/).map(Number);
    if (values.some((value) => !Number.isSafeInteger(value) || value <= 0)) continue;
    const start = match.index + match[0].indexOf(match[1]);
    const end = start + match[1].length;
    if (query.slice(start, end) !== match[1]) continue;
    groups.push({ start, end, values: [...new Set(values)].sort((a, b) => a - b) });
  }
  if (!groups.length) return null;
  const output = [];
  putVar(output, headerLength);
  append(output, data.subarray(0, headerLength));
  putVar(output, groups.length);
  const writeText = (value) => {
    const bytes = encoder.encode(value);
    putVar(output, bytes.length);
    append(output, bytes);
  };
  let cursor = 0;
  for (const group of groups) {
    writeText(query.slice(cursor, group.start));
    putVar(output, group.values.length);
    let previous = 0;
    for (const value of group.values) {
      putVar(output, value - previous);
      previous = value;
    }
    cursor = group.end;
  }
  writeText(query.slice(cursor));
  return new Uint8Array(output);
};
export const decodeIdLists = (data) => {
  const pos = { index: 0 };
  const headerLength = getVar(data, pos);
  if (headerLength > data.length - pos.index) throw Error("Cabecera de IDs incompleta");
  const parts = [data.subarray(pos.index, pos.index + headerLength)];
  pos.index += headerLength;
  const groups = getVar(data, pos);
  if (!groups || groups > 10000) throw Error("Cantidad de listas de IDs no válida");
  let total = headerLength;
  let totalIds = 0;
  const readLiteral = () => {
    const length = getVar(data, pos);
    if (length > data.length - pos.index) throw Error("Texto de IDs incompleto");
    const bytes = data.subarray(pos.index, pos.index + length);
    pos.index += length;
    parts.push(bytes);
    total += length;
  };
  for (let group = 0; group < groups; group++) {
    readLiteral();
    const count = getVar(data, pos);
    totalIds += count;
    if (!count || totalIds > 500000) throw Error("Lista de IDs no válida");
    const values = [];
    let previous = 0;
    for (let i = 0; i < count; i++) {
      const delta = getVar(data, pos);
      previous += delta;
      if (delta < 1 || !Number.isSafeInteger(previous)) throw Error("Secuencia de IDs no válida");
      values.push(String(previous));
    }
    const bytes = encoder.encode(values.join(","));
    parts.push(bytes);
    total += bytes.length;
  }
  readLiteral();
  if (pos.index !== data.length) throw Error("Datos de IDs adicionales");
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};
