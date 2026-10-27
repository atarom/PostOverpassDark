const encoder = new TextEncoder();
const LISTS = /\b(?:(?:node|way|rel|relation)\s*\(\s*id\s*:\s*|(?:osm_id|id)\s+IN\s*\(\s*)([1-9]\d*(?:\s*,\s*[1-9]\d*){7,})\s*\)/gi;
const putVar = (bytes, number) => {
  let value = number;
  while (value >= 128) {
    bytes.push(value % 128 + 128);
    value = Math.floor(value / 128);
  }
  bytes.push(value);
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
  const queryBytes = encoder.encode(query);
  const headerLength = data.length - queryBytes.length;
  if (headerLength < 0) return null;
  const groups = [];
  for (const match of query.matchAll(LISTS)) {
    const tokens = match[1].split(/(\s*,\s*)/);
    const separators = tokens.filter((_, index) => index % 2 === 1);
    if (separators.some((item) => item !== separators[0])) continue;
    const values = tokens.filter((_, index) => index % 2 === 0).map(Number);
    if (values.some((value, index) => !Number.isSafeInteger(value) || value <= 0 || index > 0 && value <= values[index - 1])) continue;
    const start = match.index + match[0].indexOf(match[1]);
    const end = start + match[1].length;
    if (groups.length && start < groups[groups.length - 1].end) continue;
    groups.push({ start, end, values, separator: separators[0] });
  }
  if (!groups.length) return null;
  const output = [];
  putVar(output, headerLength);
  append(output, data.subarray(0, headerLength));
  putVar(output, groups.length);
  let cursor = 0;
  for (const group of groups) {
    const literal = encoder.encode(query.slice(cursor, group.start));
    putVar(output, literal.length);
    append(output, literal);
    const separator = encoder.encode(group.separator);
    putVar(output, separator.length);
    append(output, separator);
    putVar(output, group.values.length);
    let previous = 0;
    for (const value of group.values) {
      putVar(output, value - previous);
      previous = value;
    }
    cursor = group.end;
  }
  const tail = encoder.encode(query.slice(cursor));
  putVar(output, tail.length);
  append(output, tail);
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
    const separatorLength = getVar(data, pos);
    if (!separatorLength || separatorLength > data.length - pos.index) throw Error("Separador de IDs no válido");
    const separator = new TextDecoder("utf-8", { fatal: true }).decode(data.subarray(pos.index, pos.index + separatorLength));
    pos.index += separatorLength;
    if (!/^\s*,\s*$/.test(separator)) throw Error("Separador de IDs no válido");
    const count = getVar(data, pos);
    totalIds += count;
    if (count < 8 || totalIds > 500000) throw Error("Lista de IDs no válida");
    const values = [];
    let previous = 0;
    for (let i = 0; i < count; i++) {
      const delta = getVar(data, pos);
      previous += delta;
      if (delta < 1 || !Number.isSafeInteger(previous)) throw Error("Secuencia de IDs no válida");
      values.push(String(previous));
    }
    const bytes = encoder.encode(values.join(separator));
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
