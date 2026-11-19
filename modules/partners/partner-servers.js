import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { isIP } from 'node:net';

const TAG = Object.freeze({ END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 });

function readNbt(buffer) {
  let offset = 0;
  const ensure = size => { if (!Number.isInteger(size) || size < 0 || offset + size > buffer.length) throw new Error('Invalid or truncated servers.dat NBT data.'); };
  const read = method => { const size = method.startsWith('readBig') ? 8 : Number(method.match(/\d+/)?.[0] || 1) / 8; ensure(size); const value = buffer[method](offset); offset += size; return value; };
  const readString = () => { const length = read('readUInt16BE'); ensure(length); const value = buffer.toString('utf8', offset, offset + length); offset += length; return value; };
  const readPayload = type => {
    switch (type) {
      case TAG.BYTE: return read('readInt8');
      case TAG.SHORT: return read('readInt16BE');
      case TAG.INT: return read('readInt32BE');
      case TAG.LONG: return read('readBigInt64BE');
      case TAG.FLOAT: return read('readFloatBE');
      case TAG.DOUBLE: return read('readDoubleBE');
      case TAG.BYTE_ARRAY: { const length = read('readInt32BE'); ensure(length); const value = Buffer.from(buffer.subarray(offset, offset + length)); offset += length; return value; }
      case TAG.STRING: return readString();
      case TAG.LIST: { const elementType = read('readUInt8'); const length = read('readInt32BE'); if (length < 0 || length > 100000) throw new Error('Invalid NBT list length.'); return { elementType, value: Array.from({ length }, () => readPayload(elementType)) }; }
      case TAG.COMPOUND: { const value = {}; while (true) { const childType = read('readUInt8'); if (childType === TAG.END) break; const name = readString(); value[name] = { type: childType, value: readPayload(childType) }; } return value; }
      case TAG.INT_ARRAY: { const length = read('readInt32BE'); if (length < 0 || length > 100000) throw new Error('Invalid NBT int-array length.'); return Array.from({ length }, () => read('readInt32BE')); }
      case TAG.LONG_ARRAY: { const length = read('readInt32BE'); if (length < 0 || length > 100000) throw new Error('Invalid NBT long-array length.'); return Array.from({ length }, () => read('readBigInt64BE')); }
      default: throw new Error(`Unsupported NBT tag type ${type}.`);
    }
  };
  const rootType = read('readUInt8');
  if (rootType !== TAG.COMPOUND) throw new Error('Minecraft servers.dat root must be a compound tag.');
  const rootName = readString();
  const root = readPayload(TAG.COMPOUND);
  if (offset !== buffer.length) throw new Error('Unexpected trailing data in servers.dat.');
  return { rootName, root };
}

function writeNbt(document) {
  const chunks = [];
  const u8 = value => { const b = Buffer.alloc(1); b.writeUInt8(value); chunks.push(b); };
  const i32 = value => { const b = Buffer.alloc(4); b.writeInt32BE(value); chunks.push(b); };
  const i16 = value => { const b = Buffer.alloc(2); b.writeUInt16BE(value); chunks.push(b); };
  const i64 = value => { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(value)); chunks.push(b); };
  const string = value => { const data = Buffer.from(String(value), 'utf8'); if (data.length > 65535) throw new Error('NBT string is too long.'); i16(data.length); chunks.push(data); };
  const writePayload = (type, value) => {
    let b;
    switch (type) {
      case TAG.BYTE: b = Buffer.alloc(1); b.writeInt8(Number(value)); chunks.push(b); break;
      case TAG.SHORT: b = Buffer.alloc(2); b.writeInt16BE(Number(value)); chunks.push(b); break;
      case TAG.INT: i32(Number(value)); break;
      case TAG.LONG: i64(value); break;
      case TAG.FLOAT: b = Buffer.alloc(4); b.writeFloatBE(Number(value)); chunks.push(b); break;
      case TAG.DOUBLE: b = Buffer.alloc(8); b.writeDoubleBE(Number(value)); chunks.push(b); break;
      case TAG.BYTE_ARRAY: { const data = Buffer.from(value); i32(data.length); chunks.push(data); break; }
      case TAG.STRING: string(value); break;
      case TAG.LIST: u8(value.elementType); i32(value.value.length); for (const item of value.value) writePayload(value.elementType, item); break;
      case TAG.COMPOUND: for (const [name, tag] of Object.entries(value)) { u8(tag.type); string(name); writePayload(tag.type, tag.value); } u8(TAG.END); break;
      case TAG.INT_ARRAY: i32(value.length); for (const item of value) i32(item); break;
      case TAG.LONG_ARRAY: i32(value.length); for (const item of value) i64(item); break;
      default: throw new Error(`Unsupported NBT tag type ${type}.`);
    }
  };
  u8(TAG.COMPOUND); string(document.rootName || ''); writePayload(TAG.COMPOUND, document.root);
  return Buffer.concat(chunks);
}

function emptyNbt() { return { rootName: '', root: {} }; }
function readNbtFile(data) {
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) return { document: readNbt(zlib.gunzipSync(data)), compressed: true };
  return { document: readNbt(data), compressed: false };
}

export function parseMinecraftAddress(input) {
  const raw = String(input ?? '').trim();
  if (!raw || raw.length > 253 || /[\s/@?#]/.test(raw) || raw.includes('://')) throw new Error('Enter a Minecraft server address without a protocol or path.');
  let parsed;
  try { parsed = new URL(`minecraft://${raw}`); } catch { throw new Error('Enter a valid Minecraft server address.'); }
  if (!parsed.hostname || parsed.username || parsed.password || (parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash) throw new Error('Enter only a hostname or IP address and an optional port.');
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const ipType = isIP(host);
  const looksLikeIp = /^\d+(?:\.\d+){3}$/.test(host) || host.includes(':');
  if (looksLikeIp && !ipType) throw new Error('The IP address is not valid.');
  const isIp = ipType !== 0;
  const domainValid = host.length <= 253 && host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
  if (!isIp && !domainValid) throw new Error('The server hostname is not valid.');
  const port = parsed.port ? Number(parsed.port) : 25565;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Server port must be between 1 and 65535.');
  const displayHost = host.includes(':') ? `[${host}]` : host;
  return { host, port, address: port === 25565 ? displayHost : `${displayHost}:${port}` };
}

export function normalizeCommunityServer(input) {
  const name = String(input?.name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 32) throw new Error('Server name must be between 2 and 32 characters.');
  const address = parseMinecraftAddress(input?.address);
  const id = String(input?.id ?? '').trim();
  return { id: id || '', name, ...address };
}

function stringTag(value) { return { type: TAG.STRING, value: String(value) }; }
function byteTag(value) { return { type: TAG.BYTE, value: Number(value) }; }

export async function ensurePartnerServerInList(gameDirectory, server, iconBuffer = null) {
  const target = path.resolve(gameDirectory);
  await fs.mkdir(target, { recursive: true });
  const file = path.join(target, 'servers.dat');
  // Minecraft writes servers.dat as gzip-compressed NBT. New files must use the same format.
  let document = emptyNbt(); let wasCompressed = true;
  try {
    const parsed = readNbtFile(await fs.readFile(file));
    document = parsed.document; wasCompressed = parsed.compressed;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      // An unreadable list is preserved rather than overwritten; tell the user to repair it.
      throw new Error(`Could not safely update this profile's multiplayer server list: ${error.message}`);
    }
  }
  const existing = document.root.servers;
  let servers = existing?.type === TAG.LIST && existing.value.elementType === TAG.COMPOUND ? existing.value.value : [];
  const cleanAddress = parseMinecraftAddress(server.address);
  const normalizedKey = cleanAddress.address.toLowerCase();
  servers = servers.filter(entry => {
    const ip = entry?.ip?.value;
    if (typeof ip !== 'string') return true;
    try { return parseMinecraftAddress(ip).address.toLowerCase() !== normalizedKey; } catch { return true; }
  });
  const entry = {
    name: stringTag(server.multiplayerName || server.name),
    ip: stringTag(cleanAddress.address),
    acceptTextures: byteTag(1),
  };
  if (iconBuffer?.length) entry.icon = stringTag(Buffer.from(iconBuffer).toString('base64'));
  servers.unshift(entry);
  document.root.servers = { type: TAG.LIST, value: { elementType: TAG.COMPOUND, value: servers } };
  const body = writeNbt(document);
  const output = wasCompressed ? zlib.gzipSync(body) : body;
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, output, { mode: 0o600 });
  await fs.rename(temp, file);
  return { path: file, added: true, count: servers.length };
}

export function inspectMinecraftServerList(data) {
  const { document } = readNbtFile(Buffer.from(data));
  const list = document.root.servers;
  if (list?.type !== TAG.LIST || list.value.elementType !== TAG.COMPOUND) return [];
  return list.value.value.map(item => ({ name: item?.name?.value || '', address: item?.ip?.value || '', icon: item?.icon?.value || null }));
}

export function buildServerLaunchArgs(server, minecraftVersion) {
  const address = parseMinecraftAddress(server.address);
  const [major, minor] = String(minecraftVersion).split('.').map(Number);
  if (major > 1 || (major === 1 && minor >= 20)) return ['--quickPlayMultiplayer', address.address];
  return ['--server', address.host, '--port', String(address.port)];
}
