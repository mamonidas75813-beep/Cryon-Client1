import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import net from 'node:net';
import { pingMinecraftServer } from '../modules/server/local-server.js';
import { sortPartnerServersByLiveStatus } from '../modules/partners/partner-ranking.js';
import {
  buildServerLaunchArgs,
  ensurePartnerServerInList,
  inspectMinecraftServerList,
  normalizeCommunityServer,
  parseMinecraftAddress,
} from '../modules/partners/partner-servers.js';

 test('normalizes Minecraft server addresses and validates ports', () => {
  assert.deepEqual(parseMinecraftAddress('play.solvanemc.fun'), { host: 'play.solvanemc.fun', port: 25565, address: 'play.solvanemc.fun' });
  assert.deepEqual(parseMinecraftAddress('play.example.net:25570'), { host: 'play.example.net', port: 25570, address: 'play.example.net:25570' });
  assert.throws(() => parseMinecraftAddress('https://play.example.net'), /without a protocol/);
  assert.throws(() => parseMinecraftAddress('play.example.net:70000'), /valid Minecraft server address|between 1 and 65535/);
  assert.throws(() => parseMinecraftAddress('999.999.999.999'), /IP address is not valid/);
});

test('validates and normalizes community server records', () => {
  assert.deepEqual(normalizeCommunityServer({ name: '  My   Server ', address: 'PLAY.EXAMPLE.NET' }), {
    id: '', name: 'My Server', host: 'play.example.net', port: 25565, address: 'play.example.net',
  });
  assert.throws(() => normalizeCommunityServer({ name: 'x', address: 'play.example.net' }), /between 2 and 32/);
});

test('writes partner to top of servers.dat, includes icon, and avoids duplicates', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cryon-partner-'));
  try {
    await ensurePartnerServerInList(directory, { name: 'Existing Server', address: 'old.example.net' });
    const icon = Buffer.from('fake-png-data');
    await ensurePartnerServerInList(directory, { name: 'Solvane MC', address: 'play.solvanemc.fun', multiplayerName: '§6★ §fSolvane MC' }, icon);
    await ensurePartnerServerInList(directory, { name: 'Solvane MC', address: 'play.solvanemc.fun', multiplayerName: '§6★ §fSolvane MC' }, icon);
    const data = await fs.readFile(path.join(directory, 'servers.dat'));
    assert.equal(data[0], 0x1f, 'new servers.dat files should use Minecraft gzip-compressed NBT');
    const list = inspectMinecraftServerList(data);
    assert.equal(list.length, 2);
    assert.equal(list[0].name, '§6★ §fSolvane MC');
    assert.equal(list[0].address, 'play.solvanemc.fun');
    assert.equal(list[0].icon, icon.toString('base64'));
    assert.equal(list[1].address, 'old.example.net');
    await fs.writeFile(path.join(directory, 'servers.dat'), data);
    await ensurePartnerServerInList(directory, { name: 'Solvane MC', address: 'play.solvanemc.fun:25565', multiplayerName: '§6★ §fSolvane MC' }, icon);
    const rewritten = await fs.readFile(path.join(directory, 'servers.dat'));
    assert.equal(rewritten[0], 0x1f);
    assert.equal(inspectMinecraftServerList(rewritten).length, 2);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('uses Minecraft quick play on modern versions and legacy server arguments before 1.20', () => {
  assert.deepEqual(buildServerLaunchArgs({ address: 'play.solvanemc.fun' }, '1.21.4'), ['--quickPlayMultiplayer', 'play.solvanemc.fun']);
  assert.deepEqual(buildServerLaunchArgs({ address: 'play.solvanemc.fun' }, '26.3'), ['--quickPlayMultiplayer', 'play.solvanemc.fun']);
  assert.deepEqual(buildServerLaunchArgs({ address: 'play.solvanemc.fun:25580' }, '1.19.4'), ['--server', 'play.solvanemc.fun', '--port', '25580']);
});


test('live partner ranking places online servers first by player count and offline servers last', () => {
  const servers = [
    { id: 'offline', name: 'Offline' },
    { id: 'low', name: 'Low Players' },
    { id: 'high', name: 'High Players' },
    { id: 'checking', name: 'Still Checking' },
  ];
  const statuses = {
    offline: { online: false, playersOnline: 0 },
    low: { online: true, playersOnline: 12 },
    high: { online: true, playersOnline: 430 },
  };
  assert.deepEqual(sortPartnerServersByLiveStatus(servers, statuses).map(server => server.id), ['high', 'low', 'checking', 'offline']);
});


test('server status ping uses the protocol-unknown handshake so current servers can report live status', async () => {
  const readVarInt = (buffer, offset = 0) => {
    let value = 0; let position = offset;
    for (let index = 0; index < 5; index++) {
      const byte = buffer[position++];
      value |= (byte & 0x7f) << (7 * index);
      if (!(byte & 0x80)) return { value: value | 0, offset: position };
    }
    throw new Error('Bad VarInt');
  };
  const encodeVarInt = value => {
    const bytes = []; let current = value >>> 0;
    do { let byte = current & 0x7f; current >>>= 7; if (current) byte |= 0x80; bytes.push(byte); } while (current);
    return Buffer.from(bytes);
  };
  const server = net.createServer(socket => {
    socket.once('data', data => {
      const frame = readVarInt(data);
      const packetId = readVarInt(data, frame.offset);
      const protocol = readVarInt(data, packetId.offset);
      assert.equal(packetId.value, 0);
      assert.equal(protocol.value, -1, 'status ping should not pretend to know a possibly outdated client protocol');
      const payload = Buffer.from(JSON.stringify({ version: { name: 'Test Server 26.x' }, players: { online: 37, max: 200 }, description: 'status test' }));
      const body = Buffer.concat([Buffer.from([0]), encodeVarInt(payload.length), payload]);
      socket.end(Buffer.concat([encodeVarInt(body.length), body]));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const result = await pingMinecraftServer(address.port, '127.0.0.1', 'test.example');
    assert.equal(result.online, true);
    assert.equal(result.playersOnline, 37);
    assert.equal(result.maxPlayers, 200);
    assert.equal(result.version, 'Test Server 26.x');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
