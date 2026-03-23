const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// rooms: { roomId: { host: socketId, members: [{id, name, color}], videoState: {}, site: '' } }
const rooms = {};

const MEMBER_COLORS = ['#FF6B6B','#4ECDC4','#FFE66D','#A78BFA'];

function getRoomInfo(room) {
  return {
    members: room.members,
    host: room.host,
    videoState: room.videoState,
    site: room.site,
  };
}

// REST endpoint to create a room (called from extension popup)
app.post('/create-room', (req, res) => {
  const { name, site } = req.body;
  const roomId = uuidv4().slice(0, 8).toUpperCase();
  rooms[roomId] = {
    host: null, // will be set on socket connect
    pendingHost: { name, site },
    members: [],
    videoState: { playing: false, currentTime: 0, updatedAt: Date.now() },
    site: site || '',
  };
  res.json({ roomId });
});

// REST: check room exists
app.get('/room/:roomId', (req, res) => {
  const room = rooms[req.params.roomId.toUpperCase()];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ exists: true, memberCount: room.members.length, site: room.site });
});

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentName = null;

  // Host joins after creating room
  socket.on('host-join', ({ roomId, name }) => {
    roomId = roomId.toUpperCase();
    const room = rooms[roomId];
    if (!room) return socket.emit('error', 'Room not found');
    if (room.members.length >= 4) return socket.emit('error', 'Room full');

    room.host = socket.id;
    currentRoom = roomId;
    currentName = name;

    const member = { id: socket.id, name, color: MEMBER_COLORS[0], isHost: true };
    room.members.push(member);
    socket.join(roomId);

    socket.emit('joined', { roomId, member, room: getRoomInfo(room) });
    io.to(roomId).emit('member-update', room.members);
    console.log(`[${roomId}] Host "${name}" connected`);
  });

  // Guest joins room
  socket.on('guest-join', ({ roomId, name }) => {
    roomId = roomId.toUpperCase();
    const room = rooms[roomId];
    if (!room) return socket.emit('error', 'Room not found');
    if (room.members.length >= 4) return socket.emit('error', 'Room is full (max 4 members)');

    currentRoom = roomId;
    currentName = name;

    const colorIndex = room.members.length;
    const member = { id: socket.id, name, color: MEMBER_COLORS[colorIndex], isHost: false };
    room.members.push(member);
    socket.join(roomId);

    // Send current video state so guest can sync
    const syncState = {
      ...room.videoState,
      // Adjust for elapsed time since last update
      currentTime: room.videoState.playing
        ? room.videoState.currentTime + (Date.now() - room.videoState.updatedAt) / 1000
        : room.videoState.currentTime,
    };

    socket.emit('joined', { roomId, member, room: getRoomInfo(room), syncState });
    socket.to(roomId).emit('member-update', room.members);
    io.to(roomId).emit('chat-message', {
      system: true,
      text: `${name} joined the party 🎉`,
      timestamp: Date.now(),
    });
    console.log(`[${roomId}] Guest "${name}" connected`);
  });

  // Host broadcasts video state change
  socket.on('video-event', ({ type, currentTime, roomId }) => {
    roomId = roomId?.toUpperCase() || currentRoom;
    const room = rooms[roomId];
    if (!room || room.host !== socket.id) return;

    room.videoState = { playing: type === 'play', currentTime, updatedAt: Date.now() };
    // Broadcast to all guests
    socket.to(roomId).emit('sync-video', { type, currentTime, timestamp: Date.now() });
  });

  // Chat messages
  socket.on('chat-message', ({ roomId, text }) => {
    roomId = roomId?.toUpperCase() || currentRoom;
    const room = rooms[roomId];
    if (!room) return;

    const member = room.members.find(m => m.id === socket.id);
    if (!member) return;

    io.to(roomId).emit('chat-message', {
      sender: member.name,
      color: member.color,
      text,
      timestamp: Date.now(),
    });
  });

  // Emoji reaction
  socket.on('reaction', ({ roomId, emoji }) => {
    roomId = roomId?.toUpperCase() || currentRoom;
    const room = rooms[roomId];
    if (!room) return;
    const member = room.members.find(m => m.id === socket.id);
    if (!member) return;
    io.to(roomId).emit('reaction', { name: member.name, color: member.color, emoji });
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms[currentRoom];
    if (!room) return;

    room.members = room.members.filter(m => m.id !== socket.id);
    io.to(currentRoom).emit('member-update', room.members);

    if (room.host === socket.id) {
      // Host left — notify and close room
      io.to(currentRoom).emit('host-left');
      delete rooms[currentRoom];
      console.log(`[${currentRoom}] Host left, room closed`);
    } else {
      io.to(currentRoom).emit('chat-message', {
        system: true,
        text: `${currentName} left the party`,
        timestamp: Date.now(),
      });
      console.log(`[${currentRoom}] "${currentName}" disconnected`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`WatchParty server running on port ${PORT}`));
