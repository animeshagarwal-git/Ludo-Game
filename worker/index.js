import { DurableObject } from 'cloudflare:workers';

/* =========================================================================
 * CANONICAL LUDO CONSTANTS & ENGINE (Shared Rules with Client v3)
 * ========================================================================= */
const SAFE_INDICES = new Set([1, 9, 14, 22, 27, 35, 40, 48]);
const CANONICAL_START = { red: 1, green: 14, yellow: 27, blue: 40 };
const ALL_COLORS = ['red', 'green', 'yellow', 'blue'];
const MODE_ROSTERS = {
  2: ['red', 'yellow'],
  3: ['red', 'green', 'yellow'],
  4: ['red', 'green', 'yellow', 'blue']
};
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS
    }
  });
}

function generateRoomCode(len = 6) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ROOM_ALPHABET[bytes[i] % ROOM_ALPHABET.length];
  }
  return out;
}

function normalizeRoomCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
}

function sanitizeName(raw, fallback = 'Player') {
  const cleaned = String(raw || '')
    .replace(/[\r\n\t<>]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 16);
  return cleaned || fallback;
}

function secureDieRoll() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 6) + 1;
}

function outerIndexForPos(pid, pos) {
  if (pos < 1 || pos > 51) return -1;
  return (CANONICAL_START[pid] + (pos - 1)) % 52;
}

function nextPosAfterRoll(pos, roll) {
  if (pos === 57) return -1;
  if (pos === 0) return roll === 6 ? 1 : -1;
  return pos + roll <= 57 ? pos + roll : -1;
}

function canCompleteRollSequence(positions, rolls, rollIdx) {
  if (rollIdx >= rolls.length) return true;
  const roll = rolls[rollIdx];
  for (let i = 0; i < positions.length; i++) {
    const nextPos = nextPosAfterRoll(positions[i], roll);
    if (nextPos !== -1) {
      const nextPositions = positions.slice();
      nextPositions[i] = nextPos;
      if (canCompleteRollSequence(nextPositions, rolls, rollIdx + 1)) {
        return true;
      }
    }
  }
  return false;
}

function getPlayerTokensArray(match, pid) {
  const list = [];
  for (let i = 0; i < 4; i++) {
    const uid = `${pid}-${i}`;
    list.push({ uid, player: pid, index: i, pos: match.tokens[uid] ?? 0 });
  }
  return list;
}

function getValidTokensForBankSequence(match, pid, cursor) {
  const tokens = getPlayerTokensArray(match, pid);
  const remainingRolls = match.bank.slice(cursor).map((b) => b.value);
  if (remainingRolls.length === 0) return [];

  const positions = tokens.map((t) => t.pos);
  const currentRoll = remainingRolls[0];

  return tokens.filter((_, idx) => {
    const nextPos = nextPosAfterRoll(positions[idx], currentRoll);
    if (nextPos === -1) return false;
    const nextPositions = positions.slice();
    nextPositions[idx] = nextPos;
    return canCompleteRollSequence(nextPositions, remainingRolls, 1);
  });
}

/* =========================================================================
 * 3-TIER SERVER AI ENGINE (EASY / MEDIUM / HARD)
 * ========================================================================= */
function enumerateLegalPlans(positions, rolls, rollIdx = 0, prefix = [], out = []) {
  if (rollIdx >= rolls.length) {
    out.push(prefix);
    return out;
  }
  const roll = rolls[rollIdx];
  for (let i = 0; i < 4; i++) {
    const np = nextPosAfterRoll(positions[i], roll);
    if (np !== -1) {
      const nextArr = positions.slice();
      nextArr[i] = np;
      enumerateLegalPlans(nextArr, rolls, rollIdx + 1, prefix.concat(i), out);
    }
  }
  return out;
}

function computeOuterSquareThreat(activePlayers, pid, outerIdx, simPositions) {
  if (outerIdx < 0 || SAFE_INDICES.has(outerIdx)) return 0;

  let threatProb = 0;
  for (let p = 0; p < activePlayers.length; p++) {
    const oppPid = activePlayers[p];
    if (oppPid === pid) continue;

    const oppArr = simPositions[oppPid];
    let oppBaseCount = 0;

    for (let j = 0; j < 4; j++) {
      const op = oppArr[j];
      if (op === 0) {
        oppBaseCount += 1;
        continue;
      }
      if (op >= 1 && op <= 51) {
        const oppOuter = outerIndexForPos(oppPid, op);
        const dist = (outerIdx - oppOuter + 52) % 52;
        if (dist >= 1 && op + dist <= 51) {
          if (dist <= 6) threatProb += 1 / 6;
          else if (dist <= 11) threatProb += 1 / 36;
          else if (dist >= 13 && dist <= 17) threatProb += 1 / 216;
        }
      }
    }

    if (oppBaseCount > 0) {
      const distFromStart = (outerIdx - CANONICAL_START[oppPid] + 52) % 52;
      if (distFromStart >= 1 && distFromStart <= 5) {
        threatProb += 0.65 / 36;
      }
    }
  }

  return Math.min(0.85, threatProb);
}

function computeTeamExposureCost(activePlayers, pid, simPositions) {
  const myArr = simPositions[pid];
  let totalRisk = 0;
  const outerCounts = new Map();

  for (let i = 0; i < 4; i++) {
    const pos = myArr[i];
    if (pos >= 1 && pos <= 51) {
      const oIdx = outerIndexForPos(pid, pos);
      const prob = computeOuterSquareThreat(activePlayers, pid, oIdx, simPositions);
      totalRisk += prob * (22 + pos * 1.85);
      if (!SAFE_INDICES.has(oIdx)) {
        outerCounts.set(oIdx, (outerCounts.get(oIdx) || 0) + 1);
      }
    }
  }

  outerCounts.forEach((count, oIdx) => {
    if (count > 1) {
      const prob = computeOuterSquareThreat(activePlayers, pid, oIdx, simPositions);
      totalRisk += (count - 1) * prob * 38;
    }
  });

  return totalRisk;
}

function cloneAllPositions(match) {
  const snap = {};
  match.activePlayers.forEach((p) => {
    snap[p] = getPlayerTokensArray(match, p).map((t) => t.pos);
  });
  return snap;
}

function chooseMoveEasy(match, pid, validTokens, currentRoll) {
  const snap = cloneAllPositions(match);
  let bestToken = validTokens[0];
  let bestScore = -Infinity;

  validTokens.forEach((token) => {
    const prev = token.pos;
    const next = nextPosAfterRoll(prev, currentRoll);
    let score = Math.random() * 58 + prev * 0.95;

    const activeCount = snap[pid].filter((p) => p > 0 && p < 57).length;
    if (prev === 0) score += activeCount === 0 ? 40 : -14;
    if (next === 57 && Math.random() < 0.42) score += 48;

    if (next >= 1 && next <= 51 && Math.random() < 0.38) {
      const oIdx = outerIndexForPos(pid, next);
      if (!SAFE_INDICES.has(oIdx)) {
        const hitsEnemy = match.activePlayers.some((other) => (
          other !== pid && snap[other].some((op) => op >= 1 && op <= 51 && outerIndexForPos(other, op) === oIdx)
        ));
        if (hitsEnemy) score += 45;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestToken = token;
    }
  });

  return bestToken.uid;
}

function chooseMoveMedium(match, pid, validTokens, currentRoll) {
  const snap = cloneAllPositions(match);
  const activeCount = snap[pid].filter((p) => p > 0 && p < 57).length;
  let bestToken = validTokens[0];
  let bestScore = -Infinity;

  validTokens.forEach((token) => {
    const prev = token.pos;
    const next = nextPosAfterRoll(prev, currentRoll);
    let score = Math.random() * 9;

    if (next === 57) score += 115;
    if (prev === 0 && next === 1) score += activeCount < 2 ? 74 : 44;
    if (prev <= 51 && next >= 52 && next <= 56) score += 62;

    if (prev >= 1 && prev <= 51) {
      const prevOuter = outerIndexForPos(pid, prev);
      if (SAFE_INDICES.has(prevOuter)) score -= 16;
      else score += computeOuterSquareThreat(match.activePlayers, pid, prevOuter, snap) * 28;
    }

    if (next >= 1 && next <= 51) {
      const oIdx = outerIndexForPos(pid, next);
      if (SAFE_INDICES.has(oIdx)) {
        score += 32;
      } else {
        match.activePlayers.forEach((other) => {
          if (other === pid) return;
          snap[other].forEach((op) => {
            if (op >= 1 && op <= 51 && outerIndexForPos(other, op) === oIdx) score += 102;
          });
        });
        score -= computeOuterSquareThreat(match.activePlayers, pid, oIdx, snap) * 58;
      }
    }

    score += prev * 0.35;
    if (score > bestScore) {
      bestScore = score;
      bestToken = token;
    }
  });

  return bestToken.uid;
}

function chooseMoveHard(match, pid, validTokens, cursor) {
  const tokens = getPlayerTokensArray(match, pid);
  const remainingRolls = match.bank.slice(cursor).map((b) => b.value);
  const initialSnap = cloneAllPositions(match);
  const riskBefore = computeTeamExposureCost(match.activePlayers, pid, initialSnap);
  const initialActive = initialSnap[pid].filter((p) => p > 0 && p < 57).length;

  const validIndices = new Set(validTokens.map((t) => t.index));
  const allPlans = enumerateLegalPlans(initialSnap[pid], remainingRolls).filter((plan) => (
    plan.length > 0 && validIndices.has(plan[0])
  ));

  if (allPlans.length === 0) return validTokens[0].uid;

  let bestFirstIdx = allPlans[0][0];
  let bestScore = -Infinity;

  allPlans.forEach((plan) => {
    const sim = {};
    match.activePlayers.forEach((p) => { sim[p] = initialSnap[p].slice(); });

    let captures = 0;
    let capturedProgress = 0;
    let goalsScored = 0;
    let baseExits = 0;
    let homeEntries = 0;

    for (let s = 0; s < plan.length; s++) {
      const tIdx = plan[s];
      const rVal = remainingRolls[s];
      const prev = sim[pid][tIdx];
      const next = nextPosAfterRoll(prev, rVal);
      sim[pid][tIdx] = next;

      if (prev === 0 && next === 1) baseExits += 1;
      if (prev <= 51 && next >= 52 && next <= 56) homeEntries += 1;
      if (next === 57) goalsScored += 1;

      if (next >= 1 && next <= 51) {
        const landedIdx = outerIndexForPos(pid, next);
        if (!SAFE_INDICES.has(landedIdx)) {
          match.activePlayers.forEach((other) => {
            if (other === pid) return;
            for (let j = 0; j < 4; j++) {
              const op = sim[other][j];
              if (op >= 1 && op <= 51 && outerIndexForPos(other, op) === landedIdx) {
                captures += 1;
                capturedProgress += op;
                sim[other][j] = 0;
              }
            }
          });
        }
      }
    }

    let score = 0;
    if (sim[pid].every((p) => p === 57)) score += 100000;
    score += captures * 148 + capturedProgress * 1.8;
    score += goalsScored * 132;
    score += homeEntries * 76;

    if (baseExits > 0) {
      const exitWeight = initialActive === 0 ? 88 : initialActive === 1 ? 72 : initialActive === 2 ? 48 : 26;
      score += baseExits * exitWeight;
    }

    const riskAfter = computeTeamExposureCost(match.activePlayers, pid, sim);
    score += (riskBefore - riskAfter) * 1.45;

    for (let i = 0; i < 4; i++) {
      const pos = sim[pid][i];
      score += pos * 0.9 + pos * pos * 0.014;

      if (pos >= 1 && pos <= 51) {
        const myOuter = outerIndexForPos(pid, pos);
        if (SAFE_INDICES.has(myOuter)) score += pos >= 20 ? 30 : 21;

        const mySquareDanger = computeOuterSquareThreat(match.activePlayers, pid, myOuter, sim);
        if (mySquareDanger <= 1 / 6) {
          match.activePlayers.forEach((other) => {
            if (other === pid) return;
            for (let j = 0; j < 4; j++) {
              const op = sim[other][j];
              if (op >= 1 && op <= 51) {
                const oppOuter = outerIndexForPos(other, op);
                if (!SAFE_INDICES.has(oppOuter)) {
                  const chaseDist = (oppOuter - myOuter + 52) % 52;
                  if (chaseDist >= 1 && chaseDist <= 6 && pos + chaseDist <= 51) {
                    score += 12 + op * 0.25;
                  }
                }
              }
            }
          });
        }
      }
    }

    score += Math.random() * 0.4;
    if (score > bestScore) {
      bestScore = score;
      bestFirstIdx = plan[0];
    }
  });

  return tokens[bestFirstIdx].uid;
}

function chooseAIMoveServer(room, pid, validTokens, cursor) {
  if (validTokens.length <= 1) return validTokens[0].uid;
  const diff = (room.seats[pid] && room.seats[pid].difficulty) || 'medium';
  const currentRoll = room.match.bank[cursor].value;
  if (diff === 'easy') return chooseMoveEasy(room.match, pid, validTokens, currentRoll);
  if (diff === 'medium') return chooseMoveMedium(room.match, pid, validTokens, currentRoll);
  return chooseMoveHard(room.match, pid, validTokens, cursor);
}

/* =========================================================================
 * STATEFUL LUDO ROOM DURABLE OBJECT (SQLite + WebSocket Hibernation)
 * ========================================================================= */
export class LudoRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_store (
        key TEXT PRIMARY KEY,
        val TEXT NOT NULL
      )
    `);
    this.roomCache = null;
  }

  loadRoom() {
    if (this.roomCache) return this.roomCache;
    const rows = [...this.sql.exec(`SELECT val FROM room_store WHERE key = 'state'`)];
    if (rows.length === 0) return null;
    this.roomCache = JSON.parse(rows[0].val);
    return this.roomCache;
  }

  saveRoom(room) {
    room.updatedAt = Date.now();
    this.roomCache = room;
    this.sql.exec(
      `INSERT OR REPLACE INTO room_store (key, val) VALUES ('state', ?)`,
      JSON.stringify(room)
    );
  }

  getConnectedClientIds(excludeWs = null) {
    const connected = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === excludeWs) continue;
      try {
        const att = ws.deserializeAttachment();
        if (att && att.clientId) connected.add(att.clientId);
      } catch {}
    }
    return connected;
  }

  serializeRoomState(room, excludeWs = null) {
    const connected = this.getConnectedClientIds(excludeWs);
    const seatsOut = {};
    ALL_COLORS.forEach((pid) => {
      const s = room.seats[pid];
      const owner = s.clientId ? room.clients[s.clientId] : null;
      seatsOut[pid] = {
        mode: s.mode,
        difficulty: s.difficulty,
        clientId: s.clientId,
        playerName: owner ? owner.name : null,
        connected: Boolean(s.clientId && connected.has(s.clientId))
      };
    });

    return {
      roomId: room.roomId,
      status: room.status,
      seq: room.seq,
      hostClientId: room.hostClientId,
      playerCount: room.playerCount,
      roster: MODE_ROSTERS[room.playerCount],
      seats: seatsOut,
      connectedCount: connected.size,
      match: room.match
        ? {
            matchId: room.match.matchId,
            activePlayers: room.match.activePlayers,
            finishedRankings: room.match.finishedRankings,
            turnIndex: room.match.turnIndex,
            phase: room.match.phase,
            canContinuePodium: Boolean(room.match.canContinuePodium),
            podiumWinnerPid: room.match.podiumWinnerPid || null,
            consecutiveSixes: room.match.consecutiveSixes,
            bonusRolls: room.match.bonusRolls,
            bank: room.match.bank,
            bankCursor: room.match.bankCursor,
            validTokenUids: room.match.validTokenUids,
            lastDieValues: room.match.lastDieValues,
            tokens: room.match.tokens
          }
        : null
    };
  }

  broadcast(payload, excludeWs = null) {
    const encoded = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === excludeWs) continue;
      try {
        ws.send(encoded);
      } catch {}
    }
  }

  sendToSocket(ws, payload) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {}
  }

  autoSeatUnassignedClients(room) {
    const roster = MODE_ROSTERS[room.playerCount];
    const connected = this.getConnectedClientIds();
    const seatedClients = new Set(
      roster.map((pid) => room.seats[pid].clientId).filter(Boolean)
    );

    for (const cid of connected) {
      if (seatedClients.has(cid)) continue;
      const openSeat = roster.find((pid) => room.seats[pid].mode === 'online' && !room.seats[pid].clientId);
      if (openSeat) {
        room.seats[openSeat].clientId = cid;
        seatedClients.add(cid);
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    // 1. Internal DO initialization from POST /api/rooms
    if (url.pathname === '/internal/init' && request.method === 'POST') {
      const existing = this.loadRoom();
      // Prevent colliding with an active room used in the last 12 hours
      if (existing && Date.now() - existing.updatedAt < 12 * 3600 * 1000) {
        return jsonResponse({ ok: false, reason: 'ACTIVE_COLLISION' }, 409);
      }

      const body = await request.json().catch(() => ({}));
      const count = [2, 3, 4].includes(Number(body.playerCount)) ? Number(body.playerCount) : 2;
      const roomId = normalizeRoomCode(body.roomId);

      const room = {
        roomId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        hostClientId: null,
        status: 'LOBBY',
        seq: 1,
        matchCounter: 0,
        playerCount: count,
        nextPlayerNum: 1,
        clients: {},
        seats: {
          red:    { mode: 'online', difficulty: 'medium', clientId: null },
          green:  { mode: 'online', difficulty: 'medium', clientId: null },
          yellow: { mode: 'online', difficulty: 'medium', clientId: null },
          blue:   { mode: 'online', difficulty: 'medium', clientId: null }
        },
        match: null
      };

      this.saveRoom(room);
      return jsonResponse({ ok: true, roomId });
    }

    // 2. Internal DO metadata lookup for GET /api/rooms/:roomId
    if (url.pathname === '/internal/info') {
      const room = this.loadRoom();
      if (!room) {
        return jsonResponse({ exists: false }, 404);
      }
      return jsonResponse({
        exists: true,
        roomId: room.roomId,
        status: room.status,
        playerCount: room.playerCount
      });
    }

    // 3. WebSocket upgrade for real-time lobby & gameplay
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const room = this.loadRoom();
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      if (!room) {
        this.ctx.acceptWebSocket(server);
        this.sendToSocket(server, {
          type: 'ERROR',
          code: 'ROOM_NOT_FOUND',
          message: 'Session ID not found. Double-check the code or create a new session.'
        });
        server.close(4004, 'Room not found');
        return new Response(null, { status: 101, webSocket: client });
      }

      const rawCid = url.searchParams.get('clientId') || crypto.randomUUID();
      const clientId = String(rawCid).slice(0, 64);
      const requestedName = url.searchParams.get('name') || '';

      server.serializeAttachment({ clientId });
      this.ctx.acceptWebSocket(server);

      if (!room.clients[clientId]) {
        const num = room.nextPlayerNum++;
        room.clients[clientId] = {
          clientId,
          name: sanitizeName(requestedName, `Player ${num}`),
          num
        };
      } else if (requestedName.trim()) {
        room.clients[clientId].name = sanitizeName(requestedName, room.clients[clientId].name);
      }

      if (!room.hostClientId) {
        room.hostClientId = clientId;
      }

      // Auto-assign seat in LOBBY if this client does not already occupy a seat
      const roster = MODE_ROSTERS[room.playerCount];
      const alreadySeated = ALL_COLORS.find((pid) => room.seats[pid].clientId === clientId);

      if (!alreadySeated && room.status === 'LOBBY') {
        let targetSeat = roster.find((pid) => room.seats[pid].mode === 'online' && !room.seats[pid].clientId);
        // Helpful auto-expand: if a friend clicked the invite link and an active seat was set to 'ai',
        // convert that AI slot to 'online' for them automatically!
        if (!targetSeat) {
          const aiSeat = roster.find((pid) => room.seats[pid].mode === 'ai' && !room.seats[pid].clientId);
          if (aiSeat) {
            room.seats[aiSeat].mode = 'online';
            targetSeat = aiSeat;
          } else if (room.playerCount < 4) {
            // Even better: if 2P or 3P is full of humans and a 3rd/4th friend clicks the link, bump playerCount!
            room.playerCount += 1;
            const expandedRoster = MODE_ROSTERS[room.playerCount];
            targetSeat = expandedRoster.find((pid) => !room.seats[pid].clientId);
            if (targetSeat) room.seats[targetSeat].mode = 'online';
          }
        }
        if (targetSeat) {
          room.seats[targetSeat].clientId = clientId;
        }
      }

      this.saveRoom(room);

      const snapshot = this.serializeRoomState(room);
      this.sendToSocket(server, {
        type: 'WELCOME',
        you: clientId,
        state: snapshot
      });
      this.broadcast({ type: 'ROOM_STATE', state: snapshot }, server);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws, rawMessage) {
    let msg;
    try {
      msg = JSON.parse(typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage));
    } catch {
      return;
    }

    if (msg.type === 'PING') {
      this.sendToSocket(ws, { type: 'PONG' });
      return;
    }

    const room = this.loadRoom();
    if (!room) return;

    const att = ws.deserializeAttachment() || {};
    const clientId = att.clientId;
    if (!clientId || !room.clients[clientId]) return;

    const isHost = clientId === room.hostClientId;

    // 1. Update display name (allowed in both LOBBY and PLAYING)
    if (msg.type === 'SET_NAME') {
      room.clients[clientId].name = sanitizeName(msg.name, room.clients[clientId].name);
      this.saveRoom(room);
      this.broadcast({ type: 'ROOM_STATE', state: this.serializeRoomState(room) });
      return;
    }

    // 2. Lobby configuration commands
    if (room.status === 'LOBBY') {
      if (msg.type === 'SET_PLAYER_COUNT' && isHost) {
        const count = Number(msg.count);
        if (![2, 3, 4].includes(count)) return;
        room.playerCount = count;
        const activeSet = new Set(MODE_ROSTERS[count]);

        // Relocate any human whose seat became inactive into an open active online seat
        const displaced = [];
        ALL_COLORS.forEach((pid) => {
          if (!activeSet.has(pid) && room.seats[pid].clientId) {
            displaced.push(room.seats[pid].clientId);
            room.seats[pid].clientId = null;
          }
        });
        displaced.forEach((cid) => {
          const open = MODE_ROSTERS[count].find((pid) => room.seats[pid].mode === 'online' && !room.seats[pid].clientId);
          if (open) room.seats[open].clientId = cid;
        });

        this.autoSeatUnassignedClients(room);
        this.saveRoom(room);
        this.broadcast({ type: 'ROOM_STATE', state: this.serializeRoomState(room) });
        return;
      }

      if (msg.type === 'SET_SEAT_CONFIG' && isHost) {
        const pid = msg.seat;
        if (!ALL_COLORS.includes(pid)) return;
        const seat = room.seats[pid];

        // Host cannot turn their own currently occupied seat into AI without switching seats first
        if (msg.mode === 'ai' && seat.clientId === room.hostClientId) {
          this.sendToSocket(ws, {
            type: 'LOBBY_NOTICE',
            message: 'You are seated here as Host — claim another color first if you want this color to be AI.'
          });
          return;
        }

        if (msg.mode === 'ai' || msg.mode === 'online') {
          const prevCid = seat.clientId;
          seat.mode = msg.mode;
          if (msg.mode === 'ai') {
            seat.clientId = null;
            if (prevCid) {
              const fallback = MODE_ROSTERS[room.playerCount].find(
                (other) => other !== pid && room.seats[other].mode === 'online' && !room.seats[other].clientId
              );
              if (fallback) room.seats[fallback].clientId = prevCid;
            }
          } else {
            this.autoSeatUnassignedClients(room);
          }
        }

        if (['easy', 'medium', 'hard'].includes(msg.difficulty)) {
          seat.difficulty = msg.difficulty;
        }

        this.saveRoom(room);
        this.broadcast({ type: 'ROOM_STATE', state: this.serializeRoomState(room) });
        return;
      }

      if (msg.type === 'CLAIM_SEAT') {
        const pid = msg.seat;
        const roster = MODE_ROSTERS[room.playerCount];
        if (!roster.includes(pid)) return;
        const target = room.seats[pid];
        if (target.mode !== 'online' || target.clientId) return;

        ALL_COLORS.forEach((c) => {
          if (room.seats[c].clientId === clientId) room.seats[c].clientId = null;
        });
        target.clientId = clientId;
        this.saveRoom(room);
        this.broadcast({ type: 'ROOM_STATE', state: this.serializeRoomState(room) });
        return;
      }

      if (msg.type === 'START_MATCH' && isHost) {
        const roster = MODE_ROSTERS[room.playerCount];
        const missingOnline = roster.filter((pid) => room.seats[pid].mode === 'online' && !room.seats[pid].clientId);
        if (missingOnline.length > 0) {
          this.sendToSocket(ws, {
            type: 'LOBBY_NOTICE',
            message: `Waiting for ${missingOnline.length} online friend${missingOnline.length > 1 ? 's' : ''} to click the invite link (or switch empty seats to AI).`
          });
          return;
        }

        const humanSeats = roster.filter((pid) => room.seats[pid].mode === 'online' && room.seats[pid].clientId);
        if (humanSeats.length === 0) {
          this.sendToSocket(ws, {
            type: 'LOBBY_NOTICE',
            message: 'At least 1 seat must be controlled by an Online Human player.'
          });
          return;
        }

        this.startNewMatch(room);
        return;
      }
    }

    // 3. Active Match Gameplay Commands
    if (room.status === 'PLAYING' && room.match) {
      const match = room.match;
      const activePid = match.activePlayers[match.turnIndex];
      const activeSeat = room.seats[activePid];

      if (msg.type === 'ROLL_DICE') {
        if (match.phase !== 'ROLLING') return;
        if (activeSeat.mode !== 'online' || activeSeat.clientId !== clientId) return;
        await this.handleHumanRoll(room, activePid);
        return;
      }

      if (msg.type === 'SELECT_TOKEN') {
        if (match.phase !== 'AWAITING_TOKEN') return;
        if (activeSeat.mode !== 'online' || activeSeat.clientId !== clientId) return;
        const uid = String(msg.uid || '');
        if (!match.validTokenUids.includes(uid)) return;
        await this.handleHumanTokenSelect(room, activePid, uid);
        return;
      }

      if (msg.type === 'CONTINUE_PODIUM' && isHost) {
        if (!match.canContinuePodium) return;
        match.canContinuePodium = false;
        match.podiumWinnerPid = null;
        this.advanceTurnOnServer(room);
        room.seq += 1;
        this.saveRoom(room);
        this.broadcast({
          type: 'EVENT',
          seq: room.seq,
          kind: 'PODIUM_CONTINUED',
          actions: [],
          state: this.serializeRoomState(room)
        });
        await this.scheduleAIAlarmIfNeeded(room, []);
        return;
      }

      if (msg.type === 'PROMOTE_SEAT_TO_AI' && isHost) {
        const pid = msg.seat;
        if (!match.activePlayers.includes(pid)) return;
        if (room.seats[pid].clientId === room.hostClientId) return;
        room.seats[pid].mode = 'ai';
        room.seats[pid].difficulty = ['easy', 'medium', 'hard'].includes(msg.difficulty) ? msg.difficulty : 'medium';
        room.seats[pid].clientId = null;

        // If it was currently that disconnected player's turn, hand control cleanly to the AI!
        if (activePid === pid && (match.phase === 'ROLLING' || match.phase === 'AWAITING_TOKEN')) {
          if (match.phase === 'ROLLING') {
            match.phase = 'AI_TURN';
            match.validTokenUids = [];
            this.saveRoom(room);
            this.broadcast({ type: 'ROOM_STATE', state: this.serializeRoomState(room) });
            await this.ctx.storage.setAlarm(Date.now() + 450);
            return;
          }
          // If awaiting token choice, immediately let AI finish the remaining banked sequence
          const actions = [];
          this.resolveBankStepsUntilPause(room, actions);
          room.seq += 1;
          this.saveRoom(room);
          this.broadcast({
            type: 'EVENT',
            seq: room.seq,
            kind: 'TURN_PROGRESS',
            actions,
            state: this.serializeRoomState(room)
          });
          await this.scheduleAIAlarmIfNeeded(room, actions);
          return;
        }

        this.saveRoom(room);
        this.broadcast({ type: 'ROOM_STATE', state: this.serializeRoomState(room) });
        return;
      }
    }

    // 4. Host Return to Lobby (allowed from PLAYING or GAME_OVER for instant rematch)
    if (msg.type === 'RETURN_TO_LOBBY' && isHost) {
      room.status = 'LOBBY';
      room.match = null;
      room.seq += 1;
      await this.ctx.storage.deleteAlarm();
      this.autoSeatUnassignedClients(room);
      this.saveRoom(room);
      this.broadcast({
        type: 'EVENT',
        seq: room.seq,
        kind: 'RETURNED_TO_LOBBY',
        actions: [],
        state: this.serializeRoomState(room)
      });
    }
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch {}
    const room = this.loadRoom();
    if (!room) return;

    // In LOBBY only: if the Host closed their tab and other players are still connected,
    // keep hostClientId if no one else is seated, otherwise only reassign if host never started.
    // Wait: do NOT strip hostClientId on brief mobile app switches (e.g. sharing link in iMessage)!
    this.broadcast({ type: 'ROOM_STATE', state: this.serializeRoomState(room, ws) }, ws);
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  /* =========================================================================
   * AUTHORITATIVE MATCH TURN ENGINE & AI ALARMS
   * ========================================================================= */
  async startNewMatch(room) {
    const activePlayers = [...MODE_ROSTERS[room.playerCount]];
    const tokens = {};
    activePlayers.forEach((pid) => {
      for (let i = 0; i < 4; i++) {
        tokens[`${pid}-${i}`] = 0;
      }
    });

    const starter = activePlayers[0];
    const starterIsAI = room.seats[starter].mode === 'ai';

    room.status = 'PLAYING';
    room.matchCounter = (room.matchCounter || 0) + 1;
    room.match = {
      matchId: room.matchCounter,
      activePlayers,
      finishedRankings: [],
      turnIndex: 0,
      phase: starterIsAI ? 'AI_TURN' : 'ROLLING',
      canContinuePodium: false,
      podiumWinnerPid: null,
      consecutiveSixes: 0,
      bonusRolls: 0,
      rollSeqId: 1,
      bank: [],
      bankCursor: 0,
      validTokenUids: [],
      lastDieValues: { red: 6, green: 6, yellow: 6, blue: 6 },
      tokens
    };

    room.seq += 1;
    this.saveRoom(room);
    this.broadcast({
      type: 'EVENT',
      seq: room.seq,
      kind: 'MATCH_STARTED',
      actions: [],
      state: this.serializeRoomState(room)
    });

    if (starterIsAI) {
      await this.ctx.storage.setAlarm(Date.now() + 800);
    }
  }

  isPlayerFinished(match, pid) {
    for (let i = 0; i < 4; i++) {
      if ((match.tokens[`${pid}-${i}`] ?? 0) !== 57) return false;
    }
    return true;
  }

  advanceTurnOnServer(room) {
    const match = room.match;
    const unfinished = match.activePlayers.filter((p) => !this.isPlayerFinished(match, p));
    if (unfinished.length <= 1) {
      if (unfinished.length === 1 && !match.finishedRankings.includes(unfinished[0])) {
        match.finishedRankings.push(unfinished[0]);
      }
      room.status = 'GAME_OVER';
      match.phase = 'GAME_OVER';
      match.canContinuePodium = false;
      match.validTokenUids = [];
      return;
    }

    for (let i = 1; i <= match.activePlayers.length; i++) {
      const nextIdx = (match.turnIndex + i) % match.activePlayers.length;
      const candidate = match.activePlayers[nextIdx];
      if (!this.isPlayerFinished(match, candidate)) {
        match.turnIndex = nextIdx;
        break;
      }
    }

    const nextPid = match.activePlayers[match.turnIndex];
    const nextIsAI = room.seats[nextPid].mode === 'ai';
    match.bank = [];
    match.bankCursor = 0;
    match.consecutiveSixes = 0;
    match.bonusRolls = 0;
    match.validTokenUids = [];
    match.phase = nextIsAI ? 'AI_TURN' : 'ROLLING';
  }

  applyTokenMoveOnServer(room, pid, chosenUid, rollObj, aiThought = false) {
    const match = room.match;
    const fromPos = match.tokens[chosenUid] ?? 0;
    const rollVal = rollObj.value;
    const toPos = nextPosAfterRoll(fromPos, rollVal);

    match.tokens[chosenUid] = toPos;
    rollObj.status = 'used';
    match.bankCursor += 1;
    match.validTokenUids = [];

    const capturedVictims = [];
    let homeGoalBonus = false;
    let finishedPlayer = false;

    if (toPos === 57) {
      if (this.isPlayerFinished(match, pid)) {
        if (!match.finishedRankings.includes(pid)) {
          match.finishedRankings.push(pid);
        }
        finishedPlayer = true;
        const unfinished = match.activePlayers.filter((p) => !this.isPlayerFinished(match, p));
        if (match.finishedRankings.length === 1 && unfinished.length >= 2) {
          // 1st place claimed in 3P/4P: pause for Host to choose Continue for Podium or Rematch
          match.phase = 'PODIUM_DECISION';
          match.canContinuePodium = true;
          match.podiumWinnerPid = pid;
        } else {
          if (unfinished.length === 1 && !match.finishedRankings.includes(unfinished[0])) {
            match.finishedRankings.push(unfinished[0]);
          }
          room.status = 'GAME_OVER';
          match.phase = 'GAME_OVER';
          match.canContinuePodium = false;
        }
      } else {
        match.bonusRolls += 1;
        homeGoalBonus = true;
      }
    } else if (toPos >= 1 && toPos <= 51) {
      const landedOuterIdx = outerIndexForPos(pid, toPos);
      if (!SAFE_INDICES.has(landedOuterIdx)) {
        match.activePlayers.forEach((otherPid) => {
          if (otherPid === pid) return;
          for (let i = 0; i < 4; i++) {
            const oppUid = `${otherPid}-${i}`;
            const oppPos = match.tokens[oppUid] ?? 0;
            if (oppPos >= 1 && oppPos <= 51 && outerIndexForPos(otherPid, oppPos) === landedOuterIdx) {
              capturedVictims.push({ uid: oppUid, player: otherPid, fromPos: oppPos });
              match.tokens[oppUid] = 0;
            }
          }
        });

        if (capturedVictims.length > 0) {
          match.bonusRolls += 1;
        }
      }
    }

    return {
      type: 'MOVE',
      pid,
      uid: chosenUid,
      rollId: rollObj.id,
      rollVal,
      fromPos,
      toPos,
      aiThought,
      capturedVictims,
      homeGoalBonus,
      finishedPlayer,
      bank: match.bank.map((b) => ({ ...b }))
    };
  }

  resolveBankStepsUntilPause(room, actions) {
    const match = room.match;

    while (room.status === 'PLAYING' && match.phase !== 'PODIUM_DECISION' && match.phase !== 'GAME_OVER') {
      const pid = match.activePlayers[match.turnIndex];

      if (match.bankCursor >= match.bank.length) {
        if (match.bonusRolls > 0 && !this.isPlayerFinished(match, pid)) {
          match.bonusRolls -= 1;
          match.bank = [];
          match.bankCursor = 0;
          match.consecutiveSixes = 0;
          match.validTokenUids = [];
          const isAI = room.seats[pid].mode === 'ai';
          match.phase = isAI ? 'AI_TURN' : 'ROLLING';
          actions.push({ type: 'BONUS_TURN', pid });
          return;
        }

        this.advanceTurnOnServer(room);
        return;
      }

      const currentRollObj = match.bank[match.bankCursor];
      const validTokens = getValidTokensForBankSequence(match, pid, match.bankCursor);

      if (validTokens.length === 0) {
        for (let i = match.bankCursor; i < match.bank.length; i++) {
          match.bank[i].status = 'forfeit';
        }
        match.bonusRolls = 0;
        actions.push({
          type: 'FORFEIT',
          pid,
          rollVal: currentRollObj.value,
          seqValues: match.bank.map((b) => b.value),
          bank: match.bank.map((b) => ({ ...b }))
        });
        this.advanceTurnOnServer(room);
        return;
      }

      currentRollObj.status = 'active';
      const isAI = room.seats[pid].mode === 'ai';

      if (!isAI && validTokens.length > 1) {
        match.phase = 'AWAITING_TOKEN';
        match.validTokenUids = validTokens.map((t) => t.uid);
        actions.push({
          type: 'AWAIT_CHOICE',
          pid,
          rollVal: currentRollObj.value,
          validTokenUids: [...match.validTokenUids],
          bank: match.bank.map((b) => ({ ...b }))
        });
        return;
      }

      const chosenUid = validTokens.length === 1
        ? validTokens[0].uid
        : chooseAIMoveServer(room, pid, validTokens, match.bankCursor);

      const moveAct = this.applyTokenMoveOnServer(room, pid, chosenUid, currentRollObj, isAI && validTokens.length > 1);
      actions.push(moveAct);
    }
  }

  async handleHumanRoll(room, pid) {
    const match = room.match;
    const rolled = secureDieRoll();
    match.lastDieValues[pid] = rolled;
    const rollEntry = { id: match.rollSeqId++, value: rolled, status: 'queued' };
    match.bank.push(rollEntry);

    const actions = [];

    if (rolled === 6) {
      match.consecutiveSixes += 1;
      if (match.consecutiveSixes >= 3) {
        match.bank.forEach((b) => { b.status = 'bust'; });
        match.bonusRolls = 0;
        actions.push({
          type: 'ROLL',
          pid,
          value: 6,
          outcome: 'BUST',
          bank: match.bank.map((b) => ({ ...b }))
        });
        this.advanceTurnOnServer(room);
      } else {
        actions.push({
          type: 'ROLL',
          pid,
          value: 6,
          outcome: 'SIX_BANKED',
          consecutiveSixes: match.consecutiveSixes,
          bank: match.bank.map((b) => ({ ...b }))
        });
        match.phase = 'ROLLING';
      }
    } else {
      match.consecutiveSixes = 0;
      actions.push({
        type: 'ROLL',
        pid,
        value: rolled,
        outcome: 'LANDED',
        bank: match.bank.map((b) => ({ ...b }))
      });
      this.resolveBankStepsUntilPause(room, actions);
    }

    room.seq += 1;
    this.saveRoom(room);
    this.broadcast({
      type: 'EVENT',
      seq: room.seq,
      kind: 'TURN_PROGRESS',
      actions,
      state: this.serializeRoomState(room)
    });

    await this.scheduleAIAlarmIfNeeded(room, actions);
  }

  async handleHumanTokenSelect(room, pid, uid) {
    const match = room.match;
    const currentRollObj = match.bank[match.bankCursor];
    if (!currentRollObj) return;

    const actions = [];
    const moveAct = this.applyTokenMoveOnServer(room, pid, uid, currentRollObj, false);
    actions.push(moveAct);

    if (room.status === 'PLAYING' && match.phase !== 'PODIUM_DECISION') {
      this.resolveBankStepsUntilPause(room, actions);
    }

    room.seq += 1;
    this.saveRoom(room);
    this.broadcast({
      type: 'EVENT',
      seq: room.seq,
      kind: 'TURN_PROGRESS',
      actions,
      state: this.serializeRoomState(room)
    });

    await this.scheduleAIAlarmIfNeeded(room, actions);
  }

  estimateActionsDurationMs(actions) {
    let ms = 0;
    for (const act of actions) {
      if (act.type === 'ROLL') {
        ms += act.outcome === 'BUST' ? 1550 : 620;
      } else if (act.type === 'FORFEIT') {
        ms += act.seqValues && act.seqValues.length > 1 ? 1050 : 650;
      } else if (act.type === 'MOVE') {
        if (act.aiThought) ms += 520;
        ms += act.fromPos === 0 ? 460 : act.rollVal * 170 + 260;
        if (act.capturedVictims && act.capturedVictims.length > 0) ms += 620;
        if (act.homeGoalBonus) ms += 420;
      } else if (act.type === 'BONUS_TURN') {
        ms += 450;
      }
    }
    return ms;
  }

  async scheduleAIAlarmIfNeeded(room, actions) {
    if (room.status !== 'PLAYING' || !room.match) return;
    const match = room.match;
    if (match.phase !== 'AI_TURN') return;

    const delay = Math.max(550, Math.min(8500, this.estimateActionsDurationMs(actions) + 520));
    await this.ctx.storage.setAlarm(Date.now() + delay);
  }

  async alarm() {
    const room = this.loadRoom();
    if (!room || room.status !== 'PLAYING' || !room.match) return;
    const match = room.match;
    if (match.phase !== 'AI_TURN') return;

    const pid = match.activePlayers[match.turnIndex];
    if (room.seats[pid].mode !== 'ai') {
      match.phase = 'ROLLING';
      this.saveRoom(room);
      this.broadcast({ type: 'ROOM_STATE', state: this.serializeRoomState(room) });
      return;
    }

    const actions = [];

    // Roll full AI bank (up to 3 rolls on consecutive 6s)
    while (true) {
      const rolled = secureDieRoll();
      match.lastDieValues[pid] = rolled;
      const rollEntry = { id: match.rollSeqId++, value: rolled, status: 'queued' };
      match.bank.push(rollEntry);

      if (rolled === 6) {
        match.consecutiveSixes += 1;
        if (match.consecutiveSixes >= 3) {
          match.bank.forEach((b) => { b.status = 'bust'; });
          match.bonusRolls = 0;
          actions.push({
            type: 'ROLL',
            pid,
            value: 6,
            outcome: 'BUST',
            bank: match.bank.map((b) => ({ ...b }))
          });
          this.advanceTurnOnServer(room);
          break;
        }
        actions.push({
          type: 'ROLL',
          pid,
          value: 6,
          outcome: 'SIX_BANKED',
          consecutiveSixes: match.consecutiveSixes,
          bank: match.bank.map((b) => ({ ...b }))
        });
      } else {
        match.consecutiveSixes = 0;
        actions.push({
          type: 'ROLL',
          pid,
          value: rolled,
          outcome: 'LANDED',
          bank: match.bank.map((b) => ({ ...b }))
        });
        this.resolveBankStepsUntilPause(room, actions);
        break;
      }
    }

    room.seq += 1;
    this.saveRoom(room);
    this.broadcast({
      type: 'EVENT',
      seq: room.seq,
      kind: 'AI_TURN_PROGRESS',
      actions,
      state: this.serializeRoomState(room)
    });

    await this.scheduleAIAlarmIfNeeded(room, actions);
  }
}

/* =========================================================================
 * MAIN WORKER ENTRYPOINT (API Routes + WebSocket + Static PWA Assets)
 * ========================================================================= */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 1. POST /api/rooms — Create a new Online Multiplayer Session ID
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const playerCount = [2, 3, 4].includes(Number(body.playerCount)) ? Number(body.playerCount) : 2;

      for (let attempt = 0; attempt < 6; attempt++) {
        const roomId = generateRoomCode(6);
        const id = env.LUDO_ROOMS.idFromName(roomId);
        const stub = env.LUDO_ROOMS.get(id);
        const initRes = await stub.fetch('https://room/internal/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, playerCount })
        });
        if (initRes.ok) {
          return jsonResponse({ roomId, playerCount });
        }
      }
      return jsonResponse({ error: 'Could not allocate unique Session ID. Please retry.' }, 503);
    }

    // 2. GET /api/rooms/:roomId — Check if a Session ID exists
    if (url.pathname.startsWith('/api/rooms/') && request.method === 'GET') {
      const rawCode = url.pathname.slice('/api/rooms/'.length);
      const roomId = normalizeRoomCode(rawCode);
      if (!roomId) {
        return jsonResponse({ exists: false, error: 'Invalid Session ID' }, 400);
      }
      const id = env.LUDO_ROOMS.idFromName(roomId);
      const stub = env.LUDO_ROOMS.get(id);
      const infoRes = await stub.fetch('https://room/internal/info');
      const data = await infoRes.json();
      return jsonResponse(data, infoRes.status);
    }

    // 3. GET /ws/:roomId — Upgrade WebSocket connection into LudoRoom Durable Object
    if (url.pathname.startsWith('/ws/')) {
      const rawCode = url.pathname.slice('/ws/'.length);
      const roomId = normalizeRoomCode(rawCode);
      if (!roomId) {
        return new Response('Missing Session ID', { status: 400 });
      }
      const id = env.LUDO_ROOMS.idFromName(roomId);
      const stub = env.LUDO_ROOMS.get(id);
      return stub.fetch(request);
    }

    // 4. Static PWA Assets (index.html, sw.js, manifest.webmanifest, icons)
    return env.ASSETS.fetch(request);
  }
};
