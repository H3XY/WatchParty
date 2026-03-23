// popup.js
const SERVER = 'http://localhost:3000';
const WEBAPP  = 'http://localhost:5173'; // Vite dev server for web app

let socket = null;
let currentRoom = null;
let isHost = false;

// --- Helpers ---
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showError(msg) {
  document.getElementById('home-error').textContent = msg;
}

function renderMembers(members, containerId) {
  const row = document.getElementById(containerId);
  row.innerHTML = members.map(m =>
    `<span class="member-chip" style="background:${m.color}22;color:${m.color};border:1px solid ${m.color}44">
      ${m.isHost ? '👑' : '🎭'} ${m.name}
    </span>`
  ).join('');
}

// --- Load saved state ---
chrome.storage.local.get(['wpRoom','wpRole','wpName'], (data) => {
  if (data.wpRoom) {
    reconnect(data.wpRoom, data.wpRole, data.wpName);
  }
});

function saveState(room, role, name) {
  chrome.storage.local.set({ wpRoom: room, wpRole: role, wpName: name });
}

function clearState() {
  chrome.storage.local.remove(['wpRoom','wpRole','wpName']);
}

// --- Socket connection ---
function connectSocket() {
  socket = io(SERVER, { transports: ['websocket'] });

  socket.on('connect', () => console.log('Socket connected'));
  socket.on('error', (msg) => { showError(msg); showScreen('screen-home'); clearState(); });

  socket.on('joined', ({ roomId, member, room, syncState }) => {
    currentRoom = roomId;
    if (isHost) {
      document.getElementById('display-code').textContent = roomId;
      document.getElementById('display-url').textContent = `${WEBAPP}/join/${roomId}`;
      renderMembers(room.members, 'members-row');
      showScreen('screen-hosting');
    } else {
      document.getElementById('joined-code').textContent = roomId;
      renderMembers(room.members, 'joined-members-row');
      showScreen('screen-joined');
    }

    // Tell content script to activate
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'INJECT_PARTY',
          roomId,
          role: isHost ? 'host' : 'guest',
          member,
          syncState: syncState || null,
          serverUrl: SERVER,
        }).catch(() => {});
      }
    });
  });

  socket.on('member-update', (members) => {
    const count = members.length - 1;
    if (isHost) {
      document.getElementById('host-status').textContent =
        count === 0 ? 'Waiting for guests...' : `${count} friend${count > 1 ? 's' : ''} watching with you`;
      renderMembers(members, 'members-row');
    } else {
      renderMembers(members, 'joined-members-row');
    }
  });

  socket.on('host-left', () => {
    clearState();
    socket.disconnect();
    showScreen('screen-home');
    showError('The host ended the party.');
  });
}

function reconnect(roomId, role, name) {
  isHost = role === 'host';
  connectSocket();
  const event = isHost ? 'host-join' : 'guest-join';
  socket.on('connect', () => socket.emit(event, { roomId, name }));
}

// --- Create party ---
document.getElementById('btn-create').addEventListener('click', async () => {
  const name = document.getElementById('host-name').value.trim();
  if (!name) return showError('Please enter your name.');

  // Get current tab URL for context
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const site = tab?.url || '';

  try {
    const res = await fetch(`${SERVER}/create-room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, site }),
    });
    const { roomId } = await res.json();
    isHost = true;
    connectSocket();
    socket.on('connect', () => socket.emit('host-join', { roomId, name }));
    saveState(roomId, 'host', name);
  } catch {
    showError('Cannot reach server. Is it running?');
  }
});

// --- Join party ---
document.getElementById('btn-join').addEventListener('click', () => {
  const name = document.getElementById('host-name').value.trim() ||
               'Guest' + Math.floor(Math.random() * 100);
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (code.length < 6) return showError('Enter a valid room code.');

  isHost = false;
  connectSocket();
  socket.on('connect', () => socket.emit('guest-join', { roomId: code, name }));
  saveState(code, 'guest', name);
});

// --- End / Leave ---
document.getElementById('btn-end-party').addEventListener('click', () => {
  socket?.disconnect();
  clearState();
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'LEAVE_PARTY' }).catch(() => {});
  });
  showScreen('screen-home');
});

document.getElementById('btn-leave-party').addEventListener('click', () => {
  socket?.disconnect();
  clearState();
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'LEAVE_PARTY' }).catch(() => {});
  });
  showScreen('screen-home');
});
