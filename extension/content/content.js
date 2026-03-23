// content.js — injected into every page
// Handles: video sync hooking, chat overlay rendering

let socket = null;
let partyActive = false;
let myRole = null;
let myMember = null;
let myRoomId = null;
let isSyncing = false; // prevent feedback loop
let serverUrl = 'http://localhost:3000';

// ─── Video detection ─────────────────────────────────────────────────────────

function findVideo() {
  // Find the largest video element (most likely the main player)
  const videos = Array.from(document.querySelectorAll('video'));
  return videos.sort((a, b) => (b.videoWidth * b.videoHeight) - (a.videoWidth * a.videoHeight))[0] || null;
}

let videoEl = null;
let videoListeners = {};

function hookVideo() {
  const v = findVideo();
  if (!v || v === videoEl) return;
  videoEl = v;

  const onPlay = () => {
    if (isSyncing || myRole !== 'host') return;
    socket?.emit('video-event', { type: 'play', currentTime: v.currentTime, roomId: myRoomId });
  };
  const onPause = () => {
    if (isSyncing || myRole !== 'host') return;
    socket?.emit('video-event', { type: 'pause', currentTime: v.currentTime, roomId: myRoomId });
  };
  const onSeeked = () => {
    if (isSyncing || myRole !== 'host') return;
    socket?.emit('video-event', { type: v.paused ? 'pause' : 'play', currentTime: v.currentTime, roomId: myRoomId });
  };

  v.addEventListener('play', onPlay);
  v.addEventListener('pause', onPause);
  v.addEventListener('seeked', onSeeked);
  videoListeners = { onPlay, onPause, onSeeked };
  console.log('[WatchParty] Video element hooked:', v);
}

function unhookVideo() {
  if (!videoEl) return;
  videoEl.removeEventListener('play', videoListeners.onPlay);
  videoEl.removeEventListener('pause', videoListeners.onPause);
  videoEl.removeEventListener('seeked', videoListeners.onSeeked);
  videoEl = null;
}

// Retry hooking every second until video found
let hookInterval = null;
function startHookPolling() {
  hookVideo();
  hookInterval = setInterval(hookVideo, 1500);
}

// ─── Overlay UI ──────────────────────────────────────────────────────────────

function buildOverlay(member) {
  if (document.getElementById('wp-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'wp-overlay';
  overlay.innerHTML = `
    <div id="wp-header">
      <span id="wp-logo">🎬 WatchParty</span>
      <span id="wp-room-badge">${myRoomId}</span>
      <button id="wp-toggle" title="Toggle chat">💬</button>
      <button id="wp-minimize" title="Minimize">—</button>
    </div>
    <div id="wp-members"></div>
    <div id="wp-messages"></div>
    <div id="wp-reactions-area"></div>
    <div id="wp-input-row">
      <input id="wp-input" type="text" placeholder="Say something..." maxlength="200" />
      <div id="wp-emoji-row">
        ${['😂','😍','😱','👏','🔥','💀'].map(e => `<button class="wp-emoji-btn" data-emoji="${e}">${e}</button>`).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Toggle visibility
  let collapsed = false;
  document.getElementById('wp-minimize').addEventListener('click', () => {
    collapsed = !collapsed;
    document.getElementById('wp-messages').style.display = collapsed ? 'none' : '';
    document.getElementById('wp-input-row').style.display = collapsed ? 'none' : '';
    document.getElementById('wp-members').style.display = collapsed ? 'none' : '';
  });

  // Chat input
  const input = document.getElementById('wp-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      socket?.emit('chat-message', { roomId: myRoomId, text: input.value.trim() });
      input.value = '';
    }
    e.stopPropagation(); // don't let streaming site intercept keys
  });

  // Emoji reactions
  document.querySelectorAll('.wp-emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket?.emit('reaction', { roomId: myRoomId, emoji: btn.dataset.emoji });
    });
  });

  // Make draggable
  makeDraggable(overlay, document.getElementById('wp-header'));
}

function makeDraggable(el, handle) {
  let ox = 0, oy = 0, mx = 0, my = 0;
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    ox = e.clientX; oy = e.clientY;
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
  });
  function drag(e) {
    const dx = e.clientX - ox; const dy = e.clientY - oy;
    ox = e.clientX; oy = e.clientY;
    el.style.right = 'auto';
    el.style.left = (el.offsetLeft + dx) + 'px';
    el.style.top = (el.offsetTop + dy) + 'px';
  }
  function stopDrag() {
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
  }
}

function addMessage({ sender, color, text, system, timestamp }) {
  const msgs = document.getElementById('wp-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = system ? 'wp-msg wp-msg-system' : 'wp-msg';
  if (system) {
    div.textContent = text;
  } else {
    div.innerHTML = `<span class="wp-sender" style="color:${color}">${escHtml(sender)}</span> ${escHtml(text)}`;
  }
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function showReaction({ name, color, emoji }) {
  const area = document.getElementById('wp-reactions-area');
  if (!area) return;
  const el = document.createElement('div');
  el.className = 'wp-reaction-pop';
  el.innerHTML = `<span style="font-size:28px">${emoji}</span><span style="color:${color};font-size:11px">${escHtml(name)}</span>`;
  el.style.left = (20 + Math.random() * 60) + '%';
  area.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function updateMembers(members) {
  const el = document.getElementById('wp-members');
  if (!el) return;
  el.innerHTML = members.map(m =>
    `<span class="wp-member-dot" style="border-color:${m.color}" title="${m.name}">${m.isHost ? '👑' : ''}${m.name[0].toUpperCase()}</span>`
  ).join('');
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function removeOverlay() {
  document.getElementById('wp-overlay')?.remove();
}

// ─── Socket connection ────────────────────────────────────────────────────────

function connectToParty({ roomId, role, member, syncState, sv }) {
  serverUrl = sv || serverUrl;
  myRoomId = roomId;
  myRole = role;
  myMember = member;
  partyActive = true;

  socket = io(serverUrl, { transports: ['websocket'] });

  socket.on('connect', () => {
    const event = role === 'host' ? 'host-join' : 'guest-join';
    socket.emit(event, { roomId, name: member.name });
  });

  socket.on('joined', ({ room }) => {
    buildOverlay(member);
    updateMembers(room.members);
    startHookPolling();

    // If guest, sync to host's current video state
    if (role === 'guest' && syncState) {
      applySyncState(syncState);
    }
  });

  socket.on('sync-video', ({ type, currentTime, timestamp }) => {
    if (myRole === 'host') return;
    const v = findVideo();
    if (!v) return;

    // Latency compensation
    const latency = (Date.now() - timestamp) / 1000;
    const targetTime = currentTime + (type === 'play' ? latency : 0);

    isSyncing = true;
    const diff = Math.abs(v.currentTime - targetTime);
    if (diff > 0.5) v.currentTime = targetTime;

    if (type === 'play' && v.paused) v.play().catch(() => {});
    else if (type === 'pause' && !v.paused) v.pause();

    setTimeout(() => { isSyncing = false; }, 300);
  });

  socket.on('chat-message', addMessage);
  socket.on('reaction', showReaction);
  socket.on('member-update', updateMembers);
  socket.on('host-left', () => {
    addMessage({ system: true, text: '👋 Host ended the party.' });
    disconnect();
  });
}

function applySyncState(syncState) {
  const trySync = () => {
    const v = findVideo();
    if (!v) return setTimeout(trySync, 1000);
    isSyncing = true;
    v.currentTime = syncState.currentTime;
    if (syncState.playing) v.play().catch(() => {});
    else v.pause();
    setTimeout(() => { isSyncing = false; }, 500);
  };
  setTimeout(trySync, 500);
}

function disconnect() {
  socket?.disconnect();
  socket = null;
  clearInterval(hookInterval);
  unhookVideo();
  removeOverlay();
  partyActive = false;
}

// ─── Message listener from popup ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'INJECT_PARTY') {
    if (partyActive) disconnect();
    connectToParty({
      roomId: message.roomId,
      role: message.role,
      member: message.member,
      syncState: message.syncState,
      sv: message.serverUrl,
    });
    sendResponse({ ok: true });
  }

  if (message.type === 'LEAVE_PARTY') {
    disconnect();
    sendResponse({ ok: true });
  }

  return true;
});
