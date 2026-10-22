import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Curated passages for the typing race (optimized length ~35-55 words for energetic 30-45s races)
const TEXT_POOL = [
  "The quick brown fox jumps over the lazy dog while the moonlight shines brightly across the quiet forest. Speed and accuracy define the champion of this typing battle.",
  "In the world of technology, every millisecond counts. Developers write clean code that powers servers across the globe, connecting millions of users in real time.",
  "Consistency is the key to mastering any skill. Keep your fingers light on the keyboard, maintain steady rhythm, and never sacrifice precision for mere velocity.",
  "Stars scattered across the midnight sky like diamonds on dark velvet. Ancient explorers looked to the constellations to navigate uncharted oceans and discover new worlds.",
  "Creativity is intelligence having fun. When you challenge your mind to think differently, unexpected solutions emerge that can change how we see our everyday lives.",
  "Lightning danced across the horizon as thunder echoed in the distance. The storm arrived with immense power, refreshing the dry earth with crisp rainfall.",
  "Journey of a thousand miles begins with a single step. Focus on the word right in front of you, build your momentum, and sprint toward the finish line."
];

// Room storage: pin -> RoomObject
const rooms = new Map();
// Socket to room mapping: socketId -> pin
const socketToRoom = new Map();

// Helper: Generate unique 6-digit PIN
function generateRoomPin() {
  let pin;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(pin));
  return pin;
}

// Helper: Get random quote
function getRandomQuote() {
  const index = Math.floor(Math.random() * TEXT_POOL.length);
  return TEXT_POOL[index];
}

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Create Room
  socket.on('create_room', ({ playerName, avatar }) => {
    const pin = generateRoomPin();
    const cleanName = (playerName || 'Player 1').trim().slice(0, 16);
    const chosenAvatar = avatar || '⚡';

    const roomData = {
      pin,
      hostId: socket.id,
      status: 'lobby', // 'lobby' | 'countdown' | 'in_game' | 'finished'
      quote: getRandomQuote(),
      startTime: null,
      finishCount: 0,
      countdownTimer: null,
      players: {
        [socket.id]: {
          id: socket.id,
          name: cleanName,
          avatar: chosenAvatar,
          isHost: true,
          progress: 0,
          wpm: 0,
          accuracy: 100,
          finished: false,
          finishTime: null,
          rank: null
        }
      }
    };

    rooms.set(pin, roomData);
    socketToRoom.set(socket.id, pin);
    socket.join(pin);

    socket.emit('room_created', {
      pin,
      player: roomData.players[socket.id],
      room: {
        pin,
        hostId: roomData.hostId,
        players: Object.values(roomData.players),
        status: roomData.status
      }
    });

    console.log(`[Room Created] PIN: ${pin} by ${cleanName} (${socket.id})`);
  });

  // Join Room
  socket.on('join_room', ({ pin, playerName, avatar }) => {
    const cleanPin = (pin || '').trim();
    const cleanName = (playerName || 'Player').trim().slice(0, 16);
    const chosenAvatar = avatar || '🦊';

    if (!rooms.has(cleanPin)) {
      return socket.emit('join_error', { message: 'Room not found. Check the 6-digit PIN.' });
    }

    const room = rooms.get(cleanPin);

    if (room.status !== 'lobby') {
      return socket.emit('join_error', { message: 'Game has already started in this room!' });
    }

    if (Object.keys(room.players).length >= 12) {
      return socket.emit('join_error', { message: 'Room is full (max 12 players).' });
    }

    // Add player to room
    room.players[socket.id] = {
      id: socket.id,
      name: cleanName,
      avatar: chosenAvatar,
      isHost: false,
      progress: 0,
      wpm: 0,
      accuracy: 100,
      finished: false,
      finishTime: null,
      rank: null
    };

    socketToRoom.set(socket.id, cleanPin);
    socket.join(cleanPin);

    socket.emit('room_joined', {
      pin: cleanPin,
      player: room.players[socket.id],
      room: {
        pin: cleanPin,
        hostId: room.hostId,
        players: Object.values(room.players),
        status: room.status
      }
    });

    // Notify all players in room of updated player list
    io.to(cleanPin).emit('lobby_update', {
      players: Object.values(room.players),
      hostId: room.hostId
    });

    console.log(`[Player Joined] ${cleanName} joined room ${cleanPin}`);
  });

  // Lobby Reaction
  socket.on('lobby_reaction', ({ pin, emoji }) => {
    if (rooms.has(pin)) {
      io.to(pin).emit('lobby_reaction_broadcast', {
        senderId: socket.id,
        emoji
      });
    }
  });

  // Start Game (Host only)
  socket.on('start_game', ({ pin }) => {
    const room = rooms.get(pin);
    if (!room) return;

    if (room.hostId !== socket.id) {
      return socket.emit('action_error', { message: 'Only the host can start the game.' });
    }

    if (room.status !== 'lobby') return;

    room.status = 'countdown';
    room.finishCount = 0;
    room.quote = getRandomQuote();

    // Reset player race stats
    Object.values(room.players).forEach(p => {
      p.progress = 0;
      p.wpm = 0;
      p.accuracy = 100;
      p.finished = false;
      p.finishTime = null;
      p.rank = null;
    });

    // Broadcast countdown initiation
    io.to(pin).emit('game_countdown_start', {
      quote: room.quote,
      players: Object.values(room.players)
    });

    let count = 3;
    const interval = setInterval(() => {
      if (!rooms.has(pin)) {
        clearInterval(interval);
        return;
      }

      if (count > 0) {
        io.to(pin).emit('countdown_tick', { count });
        count--;
      } else {
        clearInterval(interval);
        room.status = 'in_game';
        room.startTime = Date.now();
        io.to(pin).emit('game_started', {
          startTime: room.startTime,
          quote: room.quote
        });
        console.log(`[Game Started] Room ${pin}`);
      }
    }, 1000);
  });

  // Live Typing Progress Broadcast
  socket.on('typing_progress', ({ pin, progress, wpm, accuracy }) => {
    const room = rooms.get(pin);
    if (!room || room.status !== 'in_game') return;

    const player = room.players[socket.id];
    if (!player || player.finished) return;

    player.progress = Math.min(100, Math.max(0, Math.round(progress)));
    player.wpm = Math.max(0, Math.round(wpm));
    player.accuracy = Math.min(100, Math.max(0, Math.round(accuracy)));

    // Broadcast live update to all players in the room
    io.to(pin).emit('race_progress_update', {
      playerId: socket.id,
      progress: player.progress,
      wpm: player.wpm,
      accuracy: player.accuracy
    });
  });

  // Player Completed
  socket.on('player_finished', ({ pin, wpm, accuracy, timeSeconds }) => {
    const room = rooms.get(pin);
    if (!room || (room.status !== 'in_game' && room.status !== 'countdown')) return;

    const player = room.players[socket.id];
    if (!player || player.finished) return;

    room.finishCount++;
    player.finished = true;
    player.progress = 100;
    player.rank = room.finishCount;
    player.wpm = Math.round(wpm);
    player.accuracy = Math.round(accuracy);
    player.finishTime = parseFloat(timeSeconds).toFixed(2);

    io.to(pin).emit('player_completed', {
      player,
      finishCount: room.finishCount,
      totalPlayers: Object.keys(room.players).length
    });

    console.log(`[Player Finished] Room ${pin}: ${player.name} finished #${player.rank} with ${player.wpm} WPM`);

    // Check if all players finished
    const allFinished = Object.values(room.players).every(p => p.finished);
    if (allFinished) {
      endGame(pin);
    }
  });

  // End Game early or all finished
  function endGame(pin) {
    const room = rooms.get(pin);
    if (!room || room.status === 'finished') return;

    room.status = 'finished';

    // Compute sorted leaderboard
    const leaderboard = Object.values(room.players).sort((a, b) => {
      if (a.finished && !b.finished) return -1;
      if (!a.finished && b.finished) return 1;
      if (a.finished && b.finished) {
        return (a.rank || 999) - (b.rank || 999);
      }
      return b.progress - a.progress;
    });

    io.to(pin).emit('game_over', {
      leaderboard,
      hostId: room.hostId
    });

    console.log(`[Game Over] Room ${pin} finished`);
  }

  // Host force ends game / proceeds to podium
  socket.on('force_end_game', ({ pin }) => {
    const room = rooms.get(pin);
    if (!room || room.hostId !== socket.id) return;
    endGame(pin);
  });

  // Play Again / Restart Room (Host only)
  socket.on('play_again', ({ pin }) => {
    const room = rooms.get(pin);
    if (!room || room.hostId !== socket.id) return;

    room.status = 'lobby';
    room.finishCount = 0;
    room.quote = getRandomQuote();

    Object.values(room.players).forEach(p => {
      p.progress = 0;
      p.wpm = 0;
      p.accuracy = 100;
      p.finished = false;
      p.finishTime = null;
      p.rank = null;
    });

    io.to(pin).emit('room_reset_to_lobby', {
      players: Object.values(room.players),
      hostId: room.hostId
    });

    console.log(`[Room Reset] Room ${pin} returned to lobby`);
  });

  // Disconnection handling
  socket.on('disconnect', () => {
    const pin = socketToRoom.get(socket.id);
    if (!pin || !rooms.has(pin)) {
      socketToRoom.delete(socket.id);
      return;
    }

    const room = rooms.get(pin);
    const leavingPlayer = room.players[socket.id];
    delete room.players[socket.id];
    socketToRoom.delete(socket.id);

    const remainingPlayers = Object.values(room.players);

    if (remainingPlayers.length === 0) {
      // Room empty, delete
      rooms.delete(pin);
      console.log(`[Room Closed] Room ${pin} deleted (no players left)`);
      return;
    }

    // If host left, elect next host
    if (room.hostId === socket.id) {
      room.hostId = remainingPlayers[0].id;
      remainingPlayers[0].isHost = true;
      console.log(`[Host Migrated] Room ${pin} new host: ${remainingPlayers[0].name}`);
    }

    // Notify room of player departure and new host
    io.to(pin).emit('player_left', {
      leftPlayerId: socket.id,
      leftPlayerName: leavingPlayer ? leavingPlayer.name : 'A player',
      players: remainingPlayers,
      hostId: room.hostId
    });

    // If in game, check if all remaining are finished
    if (room.status === 'in_game') {
      const allDone = remainingPlayers.every(p => p.finished);
      if (allDone) {
        endGame(pin);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 TypeClash Multiplayer Typing Game Server`);
  console.log(`📡 Running on http://localhost:${PORT}`);
  console.log(`===============================================`);
});
