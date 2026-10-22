// =====================================================================
// TypeClash - Real-Time Multiplayer Typing Royale (Client Logic)
// =====================================================================

// Connect to Socket.io backend (only available when served by server.js, not Live Server / file://)
if (typeof io === 'undefined') {
  alert('Game server not reached. Run "npm start" and open http://localhost:3001 (not Live Server).');
}
const socket = io();

// ---------------------------------------------------------------------
// App State
// ---------------------------------------------------------------------
const state = {
  localPlayer: {
    id: null,
    name: 'SpeedyTyper',
    avatar: '⚡',
    isHost: false,
    pin: null
  },
  room: {
    pin: null,
    hostId: null,
    players: [],
    status: 'home'
  },
  soundEnabled: localStorage.getItem('tc_sound') !== 'false',

  // Typing engine state
  quote: '',
  words: [],
  currentWordIndex: 0,
  currentLetterIndex: 0,
  totalCharsTyped: 0,
  correctCharsTyped: 0,
  startTime: null,
  timerInterval: null,
  isFinished: false,
  lastProgressEmit: 0,

  // Confetti animation handle
  confettiAnimationId: null
};

// ---------------------------------------------------------------------
// DOM Elements
// ---------------------------------------------------------------------
const views = {
  home: document.getElementById('view-home'),
  lobby: document.getElementById('view-lobby'),
  game: document.getElementById('view-game'),
  leaderboard: document.getElementById('view-leaderboard')
};

const dom = {
  // Navigation
  navRoomBadge: document.getElementById('nav-room-badge'),
  navPinDisplay: document.getElementById('nav-pin-display'),
  soundToggleBtn: document.getElementById('sound-toggle-btn'),
  soundIcon: document.getElementById('sound-icon'),

  // Home Screen
  avatarSelector: document.getElementById('avatar-selector'),
  playerNameInput: document.getElementById('player-name-input'),
  randomNameBtn: document.getElementById('random-name-btn'),
  createRoomBtn: document.getElementById('create-room-btn'),
  joinRoomBtn: document.getElementById('join-room-btn'),
  joinPinInput: document.getElementById('join-pin-input'),
  joinErrorMsg: document.getElementById('join-error-msg'),

  // Lobby Screen
  lobbyPin: document.getElementById('lobby-pin'),
  copyPinBtn: document.getElementById('copy-pin-btn'),
  copyLinkBtn: document.getElementById('copy-link-btn'),
  copyToast: document.getElementById('copy-toast'),
  lobbyPlayerCount: document.getElementById('lobby-player-count'),
  playersListGrid: document.getElementById('players-list-grid'),
  leaveLobbyBtn: document.getElementById('leave-lobby-btn'),
  hostStartContainer: document.getElementById('host-start-container'),
  startGameBtn: document.getElementById('start-game-btn'),
  guestWaitingContainer: document.getElementById('guest-waiting-container'),
  reactionButtons: document.querySelectorAll('.react-btn'),
  floatingReactionsLayer: document.getElementById('floating-reactions-layer'),

  // Countdown Overlay
  countdownOverlay: document.getElementById('countdown-overlay'),
  countdownNumber: document.getElementById('countdown-number'),

  // Game Screen
  raceLanesContainer: document.getElementById('race-lanes-container'),
  hudWpm: document.getElementById('hud-wpm'),
  hudAccuracy: document.getElementById('hud-accuracy'),
  hudProgress: document.getElementById('hud-progress'),
  hudProgressFill: document.getElementById('hud-progress-fill'),
  hudTimer: document.getElementById('hud-timer'),
  typingAreaBox: document.getElementById('typing-area-box'),
  wordsContainer: document.getElementById('words-container'),
  caret: document.getElementById('caret'),
  typingHiddenInput: document.getElementById('typing-hidden-input'),
  unfocusNotice: document.getElementById('unfocus-notice'),
  finishStatusTag: document.getElementById('finish-status-tag'),
  hostEndRaceContainer: document.getElementById('host-end-race-container'),
  hostForceEndBtn: document.getElementById('host-force-end-btn'),

  // Leaderboard Screen
  confettiCanvas: document.getElementById('confetti-canvas'),
  podiumAvatar1: document.getElementById('podium-avatar-1'),
  podiumName1: document.getElementById('podium-name-1'),
  podiumWpm1: document.getElementById('podium-wpm-1'),
  podiumAvatar2: document.getElementById('podium-avatar-2'),
  podiumName2: document.getElementById('podium-name-2'),
  podiumWpm2: document.getElementById('podium-wpm-2'),
  podiumAvatar3: document.getElementById('podium-avatar-3'),
  podiumName3: document.getElementById('podium-name-3'),
  podiumWpm3: document.getElementById('podium-wpm-3'),
  standingsTbody: document.getElementById('standings-tbody'),
  hostRematchContainer: document.getElementById('host-rematch-container'),
  guestRematchContainer: document.getElementById('guest-rematch-container'),
  rematchBtn: document.getElementById('rematch-btn'),
  returnHomeBtn: document.getElementById('return-home-btn'),

  // Global Toast
  toast: document.getElementById('toast')
};

// ---------------------------------------------------------------------
// Web Audio API Synthesizer (Zero External Audio Dependencies)
// ---------------------------------------------------------------------
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

const sounds = {
  keypress() {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320 + Math.random() * 40, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (_) {}
  },

  error() {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (_) {}
  },

  beep(freq = 600, duration = 0.15) {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (_) {}
  },

  finishFanfare() {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.12);
        osc.stop(ctx.currentTime + idx * 0.12 + 0.35);
      });
    } catch (_) {}
  }
};

// ---------------------------------------------------------------------
// UI View Switching
// ---------------------------------------------------------------------
function switchView(viewName) {
  Object.keys(views).forEach(key => {
    if (key === viewName) {
      views[key].classList.add('active');
    } else {
      views[key].classList.remove('active');
    }
  });

  state.room.status = viewName;

  if (viewName === 'home') {
    dom.navRoomBadge.classList.add('hidden');
    stopConfetti();
  } else {
    dom.navRoomBadge.classList.remove('hidden');
    dom.navPinDisplay.textContent = state.room.pin || '------';
  }
}

function showToast(message, duration = 2500) {
  dom.toast.textContent = message;
  dom.toast.classList.remove('hidden');
  setTimeout(() => {
    dom.toast.classList.add('hidden');
  }, duration);
}

// ---------------------------------------------------------------------
// Random Name Generator
// ---------------------------------------------------------------------
const RANDOM_NAMES = [
  'TurboTyper', 'NeonRacer', 'SonicFingers', 'ByteBlaster', 'VeloCity',
  'CodeSprinter', 'CyberDash', 'PixelRider', 'NitroKeys', 'GhostRacer',
  'ApexDrifter', 'SwiftStriker', 'FlashType', 'KeyTitan', 'QuantumSpeed'
];

function generateRandomName() {
  const name = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${name}${num}`;
}

// ---------------------------------------------------------------------
// Lobby & Player Cards Rendering
// ---------------------------------------------------------------------
function renderLobbyPlayers(players, hostId) {
  dom.lobbyPlayerCount.textContent = players.length;
  dom.playersListGrid.innerHTML = '';

  const isLocalHost = hostId === socket.id;

  players.forEach(p => {
    const card = document.createElement('div');
    card.className = `player-card ${p.id === socket.id ? 'is-you' : ''}`;

    const isThisHost = p.id === hostId;

    card.innerHTML = `
      <div class="player-avatar">${p.avatar}</div>
      <div class="player-name">${escapeHtml(p.name)} ${p.id === socket.id ? '(You)' : ''}</div>
      <span class="${isThisHost ? 'player-badge-host' : 'player-badge-ready'}">
        ${isThisHost ? '👑 Host' : '✓ Ready'}
      </span>
    `;
    dom.playersListGrid.appendChild(card);
  });

  // Host Controls vs Guest Waiting Message
  if (isLocalHost) {
    dom.hostStartContainer.classList.remove('hidden');
    dom.guestWaitingContainer.classList.add('hidden');
  } else {
    dom.hostStartContainer.classList.add('hidden');
    dom.guestWaitingContainer.classList.remove('hidden');
  }
}

// Floating emoji reaction animation
function triggerFloatingEmoji(emoji) {
  const elem = document.createElement('div');
  elem.className = 'floating-emoji';
  elem.textContent = emoji;
  const randomLeft = 10 + Math.random() * 80;
  elem.style.left = `${randomLeft}vw`;

  dom.floatingReactionsLayer.appendChild(elem);
  setTimeout(() => {
    elem.remove();
  }, 2600);
}

// ---------------------------------------------------------------------
// Race Track Visualization (Blooket Arcade Style)
// ---------------------------------------------------------------------
function renderRaceTrack(players) {
  dom.raceLanesContainer.innerHTML = '';

  players.forEach(p => {
    const lane = document.createElement('div');
    lane.className = `race-lane ${p.id === socket.id ? 'is-local-player' : ''}`;
    lane.id = `lane-${p.id}`;

    const rankHtml = p.rank
      ? `<span class="rank-badge rank-${p.rank <= 3 ? p.rank : 'other'}">#${p.rank}</span>`
      : '';

    lane.innerHTML = `
      <div class="lane-info">
        <div class="lane-player-tag">
          <span>${p.avatar}</span>
          <span>${escapeHtml(p.name)} ${p.id === socket.id ? '(You)' : ''}</span>
        </div>
        <div class="lane-stats-tag">
          <span class="wpm-pill" id="lane-wpm-${p.id}">${p.wpm || 0} WPM</span>
          <span id="lane-rank-${p.id}">${rankHtml}</span>
        </div>
      </div>
      <div class="lane-track-bar">
        <div class="track-progress-fill" id="lane-fill-${p.id}" style="width: ${p.progress || 0}%"></div>
        <div class="lane-runner" id="lane-runner-${p.id}" style="left: ${Math.min(96, Math.max(2, p.progress || 0))}%">
          ${p.avatar}
        </div>
      </div>
    `;

    dom.raceLanesContainer.appendChild(lane);
  });
}

function updateLaneProgress(playerId, progress, wpm) {
  const runner = document.getElementById(`lane-runner-${playerId}`);
  const fill = document.getElementById(`lane-fill-${playerId}`);
  const wpmTag = document.getElementById(`lane-wpm-${playerId}`);

  const boundedProgress = Math.min(100, Math.max(0, progress));

  if (runner) {
    runner.style.left = `${Math.min(96, Math.max(2, boundedProgress))}%`;
  }
  if (fill) {
    fill.style.width = `${boundedProgress}%`;
  }
  if (wpmTag) {
    wpmTag.textContent = `${wpm || 0} WPM`;
  }
}

// ---------------------------------------------------------------------
// Monkeytype Typing Engine
// ---------------------------------------------------------------------
function initTypingTest(quoteText) {
  state.quote = quoteText.trim();
  state.words = state.quote.split(/\s+/);
  state.currentWordIndex = 0;
  state.currentLetterIndex = 0;
  state.totalCharsTyped = 0;
  state.correctCharsTyped = 0;
  state.isFinished = false;

  // Clear HUD
  dom.hudWpm.textContent = '0';
  dom.hudAccuracy.textContent = '100%';
  dom.hudProgress.textContent = '0%';
  dom.hudProgressFill.style.width = '0%';
  dom.hudTimer.textContent = '00:00';
  dom.finishStatusTag.textContent = 'Type the passage accurately to cross the finish line!';

  // Render words & letters
  dom.wordsContainer.innerHTML = '';
  dom.wordsContainer.appendChild(dom.caret);

  state.words.forEach((wordStr, wordIdx) => {
    const wordElem = document.createElement('div');
    wordElem.className = 'word';
    wordElem.id = `word-${wordIdx}`;

    for (let i = 0; i < wordStr.length; i++) {
      const letterElem = document.createElement('span');
      letterElem.className = 'letter';
      letterElem.textContent = wordStr[i];
      letterElem.id = `letter-${wordIdx}-${i}`;
      wordElem.appendChild(letterElem);
    }

    dom.wordsContainer.appendChild(wordElem);
  });

  // Focus hidden input
  focusInput();
  updateCaretPosition();
}

function focusInput() {
  dom.typingHiddenInput.focus();
  dom.unfocusNotice.classList.add('hidden');
}

function updateCaretPosition() {
  const currentWordElem = document.getElementById(`word-${state.currentWordIndex}`);
  if (!currentWordElem) return;

  const currentLetterElem = document.getElementById(`letter-${state.currentWordIndex}-${state.currentLetterIndex}`);

  if (currentLetterElem) {
    dom.caret.style.left = `${currentLetterElem.offsetLeft}px`;
    dom.caret.style.top = `${currentLetterElem.offsetTop + 2}px`;
    dom.caret.style.height = `${currentLetterElem.offsetHeight - 4}px`;
  } else {
    // Caret at end of the word
    const letters = currentWordElem.querySelectorAll('.letter');
    if (letters.length > 0) {
      const lastLetter = letters[letters.length - 1];
      dom.caret.style.left = `${lastLetter.offsetLeft + lastLetter.offsetWidth}px`;
      dom.caret.style.top = `${lastLetter.offsetTop + 2}px`;
      dom.caret.style.height = `${lastLetter.offsetHeight - 4}px`;
    }
  }
}

function handleKeyDown(e) {
  if (state.isFinished || state.room.status !== 'game') return;

  const targetWord = state.words[state.currentWordIndex];
  if (!targetWord) return;

  const key = e.key;

  // Prevent default scrolling on Space and Backspace
  if (key === ' ' || key === 'Backspace') {
    e.preventDefault();
  }

  // 1. SPACE: Advance to next word
  if (key === ' ') {
    if (state.currentLetterIndex === 0) return; // Disallow empty space spam

    // Mark any remaining letters in current word as incorrect
    for (let i = state.currentLetterIndex; i < targetWord.length; i++) {
      const letterElem = document.getElementById(`letter-${state.currentWordIndex}-${i}`);
      if (letterElem) {
        letterElem.classList.add('incorrect');
      }
    }

    state.currentWordIndex++;
    state.currentLetterIndex = 0;
    sounds.keypress();

    checkRaceCompletion();
    updateLiveStats();
    updateCaretPosition();
    return;
  }

  // 2. BACKSPACE: Delete letter or move back to previous word
  if (key === 'Backspace') {
    if (state.currentLetterIndex > 0) {
      state.currentLetterIndex--;
      const letterElem = document.getElementById(`letter-${state.currentWordIndex}-${state.currentLetterIndex}`);

      if (letterElem) {
        if (letterElem.classList.contains('extra')) {
          letterElem.remove();
        } else {
          letterElem.classList.remove('correct', 'incorrect');
        }
      }
      sounds.keypress();
      updateLiveStats();
      updateCaretPosition();
    } else if (state.currentWordIndex > 0) {
      // Allow backspacing to previous word if it has errors
      const prevWordElem = document.getElementById(`word-${state.currentWordIndex - 1}`);
      const hasErrors = prevWordElem && prevWordElem.querySelector('.incorrect, .extra');
      if (hasErrors) {
        state.currentWordIndex--;
        const letters = prevWordElem.querySelectorAll('.letter');
        state.currentLetterIndex = letters.length;
        sounds.keypress();
        updateLiveStats();
        updateCaretPosition();
      }
    }
    return;
  }

  // 3. Regular printable character typing
  if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    state.totalCharsTyped++;

    if (state.currentLetterIndex < targetWord.length) {
      const expectedChar = targetWord[state.currentLetterIndex];
      const letterElem = document.getElementById(`letter-${state.currentWordIndex}-${state.currentLetterIndex}`);

      if (key === expectedChar) {
        letterElem.classList.add('correct');
        state.correctCharsTyped++;
        sounds.keypress();
      } else {
        letterElem.classList.add('incorrect');
        sounds.error();
      }

      state.currentLetterIndex++;
    } else {
      // Extra characters beyond target word length (Monkeytype style overflow)
      const currentWordElem = document.getElementById(`word-${state.currentWordIndex}`);
      const extraLetters = currentWordElem.querySelectorAll('.extra');

      if (extraLetters.length < 10) {
        const extraSpan = document.createElement('span');
        extraSpan.className = 'letter extra';
        extraSpan.textContent = key;
        currentWordElem.appendChild(extraSpan);
        state.currentLetterIndex++;
        sounds.error();
      }
    }

    checkRaceCompletion();
    updateLiveStats();
    updateCaretPosition();
  }
}

// Check if entire text has been finished
function checkRaceCompletion() {
  const isLastWord = state.currentWordIndex === state.words.length - 1;
  const isAtEndOfLastWord = state.currentLetterIndex >= state.words[state.words.length - 1].length;
  const isBeyondLastWord = state.currentWordIndex >= state.words.length;

  if ((isLastWord && isAtEndOfLastWord) || isBeyondLastWord) {
    finishRace();
  }
}

function finishRace() {
  if (state.isFinished) return;
  state.isFinished = true;

  clearInterval(state.timerInterval);

  const timeSeconds = Math.max(0.5, (Date.now() - state.startTime) / 1000);
  const minutes = timeSeconds / 60;
  const finalWpm = Math.max(0, Math.round((state.correctCharsTyped / 5) / minutes));
  const finalAccuracy = state.totalCharsTyped > 0 
    ? Math.round((state.correctCharsTyped / state.totalCharsTyped) * 100) 
    : 100;

  dom.hudProgress.textContent = '100%';
  dom.hudProgressFill.style.width = '100%';
  dom.finishStatusTag.textContent = '🎉 You crossed the finish line! Waiting for other racers...';

  sounds.finishFanfare();

  // Inform backend
  socket.emit('player_finished', {
    pin: state.room.pin,
    wpm: finalWpm,
    accuracy: finalAccuracy,
    timeSeconds
  });
}

function updateLiveStats() {
  if (!state.startTime || state.isFinished) return;

  const timeSeconds = Math.max(0.1, (Date.now() - state.startTime) / 1000);
  const minutes = timeSeconds / 60;

  const wpm = Math.max(0, Math.round((state.correctCharsTyped / 5) / minutes));
  const accuracy = state.totalCharsTyped > 0 
    ? Math.round((state.correctCharsTyped / state.totalCharsTyped) * 100) 
    : 100;

  // Calculate percentage of total text completed
  const totalWords = state.words.length || 1;
  const wordWeight = 100 / totalWords;
  const currentWordChars = (state.words[state.currentWordIndex] || '').length || 1;
  const charFraction = Math.min(1, state.currentLetterIndex / currentWordChars);
  const progress = Math.min(99, Math.round((state.currentWordIndex * wordWeight) + (charFraction * wordWeight)));

  dom.hudWpm.textContent = wpm;
  dom.hudAccuracy.textContent = `${accuracy}%`;
  dom.hudProgress.textContent = `${progress}%`;
  dom.hudProgressFill.style.width = `${progress}%`;

  // Update local player's lane visually
  updateLaneProgress(socket.id, progress, wpm);

  // Throttled WebSocket broadcast (max once every 120ms to keep network lean)
  const now = Date.now();
  if (now - state.lastProgressEmit > 120) {
    state.lastProgressEmit = now;
    socket.emit('typing_progress', {
      pin: state.room.pin,
      progress,
      wpm,
      accuracy
    });
  }
}

// ---------------------------------------------------------------------
// Confetti Animation System (Pure HTML5 Canvas)
// ---------------------------------------------------------------------
function startConfetti() {
  const canvas = dom.confettiCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#f59e0b', '#fbbf24', '#38bdf8', '#10b981', '#ec4899', '#8b5cf6'];
  const particles = Array.from({ length: 90 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    size: Math.random() * 8 + 5,
    speedY: Math.random() * 3 + 2,
    speedX: Math.random() * 2 - 1,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360,
    rotSpeed: Math.random() * 4 - 2
  }));

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.y += p.speedY;
      p.x += p.speedX;
      p.rotation += p.rotSpeed;

      if (p.y > canvas.height) {
        p.y = -10;
        p.x = Math.random() * canvas.width;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
      ctx.restore();
    });

    state.confettiAnimationId = requestAnimationFrame(animate);
  }

  stopConfetti();
  animate();
}

function stopConfetti() {
  if (state.confettiAnimationId) {
    cancelAnimationFrame(state.confettiAnimationId);
    state.confettiAnimationId = null;
  }
  const ctx = dom.confettiCanvas.getContext('2d');
  ctx.clearRect(0, 0, dom.confettiCanvas.width, dom.confettiCanvas.height);
}

// ---------------------------------------------------------------------
// Podium and Final Results Display
// ---------------------------------------------------------------------
function renderLeaderboard(leaderboard, hostId) {
  switchView('leaderboard');
  startConfetti();

  const isLocalHost = hostId === socket.id;

  if (isLocalHost) {
    dom.hostRematchContainer.classList.remove('hidden');
    dom.guestRematchContainer.classList.add('hidden');
  } else {
    dom.hostRematchContainer.classList.add('hidden');
    dom.guestRematchContainer.classList.remove('hidden');
  }

  // Top 3 Podium
  const first = leaderboard[0];
  const second = leaderboard[1];
  const third = leaderboard[2];

  if (first) {
    dom.podiumAvatar1.textContent = first.avatar;
    dom.podiumName1.textContent = first.name;
    dom.podiumWpm1.textContent = `${first.wpm} WPM`;
  }
  if (second) {
    dom.podiumAvatar2.textContent = second.avatar;
    dom.podiumName2.textContent = second.name;
    dom.podiumWpm2.textContent = `${second.wpm} WPM`;
  } else {
    dom.podiumAvatar2.textContent = '🥈';
    dom.podiumName2.textContent = '-';
    dom.podiumWpm2.textContent = '-';
  }
  if (third) {
    dom.podiumAvatar3.textContent = third.avatar;
    dom.podiumName3.textContent = third.name;
    dom.podiumWpm3.textContent = `${third.wpm} WPM`;
  } else {
    dom.podiumAvatar3.textContent = '🥉';
    dom.podiumName3.textContent = '-';
    dom.podiumWpm3.textContent = '-';
  }

  // Full Table
  dom.standingsTbody.innerHTML = '';
  leaderboard.forEach((p, index) => {
    const row = document.createElement('tr');
    const isYou = p.id === socket.id;
    const rankLabel = p.rank ? `#${p.rank}` : `#${index + 1}`;

    row.innerHTML = `
      <td><strong>${rankLabel}</strong></td>
      <td>
        <div class="table-racer-cell">
          <span>${p.avatar}</span>
          <span>${escapeHtml(p.name)} ${isYou ? '⭐ (You)' : ''}</span>
        </div>
      </td>
      <td class="table-mono-wpm">${p.wpm || 0}</td>
      <td class="table-mono-acc">${p.accuracy || 100}%</td>
      <td>${p.finishTime ? `${p.finishTime}s` : '--'}</td>
      <td>
        <span class="${p.finished ? 'badge-finished' : 'badge-racing'}">
          ${p.finished ? 'Finished 🏁' : 'In Progress'}
        </span>
      </td>
    `;
    dom.standingsTbody.appendChild(row);
  });
}

// ---------------------------------------------------------------------
// Event Listeners (User Interactions)
// ---------------------------------------------------------------------
function initEventListeners() {
  // Sound FX Toggle
  dom.soundToggleBtn.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('tc_sound', state.soundEnabled ? 'true' : 'false');
    dom.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
    dom.soundToggleBtn.querySelector('.btn-text').textContent = state.soundEnabled ? 'Sound ON' : 'Sound OFF';
    showToast(state.soundEnabled ? 'Sound Enabled 🔊' : 'Sound Muted 🔇');
    if (state.soundEnabled) sounds.beep(800, 0.1);
  });

  // Avatar Selection
  dom.avatarSelector.addEventListener('click', e => {
    const btn = e.target.closest('.avatar-option');
    if (!btn) return;
    document.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.localPlayer.avatar = btn.getAttribute('data-avatar');
    sounds.keypress();
  });

  // Random Name Dice Button
  dom.randomNameBtn.addEventListener('click', () => {
    const rndName = generateRandomName();
    dom.playerNameInput.value = rndName;
    state.localPlayer.name = rndName;
    sounds.keypress();
  });

  // Create Room Click
  dom.createRoomBtn.addEventListener('click', () => {
    const name = dom.playerNameInput.value.trim() || generateRandomName();
    state.localPlayer.name = name;
    socket.emit('create_room', {
      playerName: name,
      avatar: state.localPlayer.avatar
    });
  });

  // Join Room Click
  dom.joinRoomBtn.addEventListener('click', () => {
    const pin = dom.joinPinInput.value.trim();
    if (pin.length !== 6) {
      dom.joinErrorMsg.textContent = 'Please enter a valid 6-digit PIN.';
      dom.joinErrorMsg.classList.remove('hidden');
      return;
    }
    dom.joinErrorMsg.classList.add('hidden');
    const name = dom.playerNameInput.value.trim() || generateRandomName();
    state.localPlayer.name = name;
    socket.emit('join_room', {
      pin,
      playerName: name,
      avatar: state.localPlayer.avatar
    });
  });

  // PIN input auto upper/num format
  dom.joinPinInput.addEventListener('input', e => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
    dom.joinErrorMsg.classList.add('hidden');
  });

  // Copy PIN Code Button
  dom.copyPinBtn.addEventListener('click', () => {
    if (!state.room.pin) return;
    navigator.clipboard.writeText(state.room.pin);
    dom.copyToast.textContent = 'PIN copied to clipboard!';
    dom.copyToast.classList.remove('hidden');
    setTimeout(() => dom.copyToast.classList.add('hidden'), 2000);
  });

  // Copy Shareable Link
  dom.copyLinkBtn.addEventListener('click', () => {
    if (!state.room.pin) return;
    const url = `${window.location.origin}?pin=${state.room.pin}`;
    navigator.clipboard.writeText(url);
    dom.copyToast.textContent = 'Invite link copied!';
    dom.copyToast.classList.remove('hidden');
    setTimeout(() => dom.copyToast.classList.add('hidden'), 2000);
  });

  // Lobby Reaction Buttons
  dom.reactionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji');
      if (state.room.pin) {
        socket.emit('lobby_reaction', { pin: state.room.pin, emoji });
        sounds.beep(750, 0.05);
      }
    });
  });

  // Start Race (Host only)
  dom.startGameBtn.addEventListener('click', () => {
    if (state.room.pin) {
      socket.emit('start_game', { pin: state.room.pin });
    }
  });

  // Leave Room
  dom.leaveLobbyBtn.addEventListener('click', () => {
    window.location.reload();
  });

  // Typing Area Focus handling
  dom.typingAreaBox.addEventListener('click', () => {
    focusInput();
  });

  window.addEventListener('keydown', e => {
    if (state.room.status === 'game' && !state.isFinished) {
      if (document.activeElement !== dom.typingHiddenInput) {
        focusInput();
      }
      handleKeyDown(e);
    }
  });

  dom.typingHiddenInput.addEventListener('blur', () => {
    if (state.room.status === 'game' && !state.isFinished) {
      dom.unfocusNotice.classList.remove('hidden');
    }
  });

  dom.unfocusNotice.addEventListener('click', () => {
    focusInput();
  });

  // Host force end race button
  dom.hostForceEndBtn.addEventListener('click', () => {
    if (state.room.pin) {
      socket.emit('force_end_game', { pin: state.room.pin });
    }
  });

  // Rematch button (Host)
  dom.rematchBtn.addEventListener('click', () => {
    if (state.room.pin) {
      socket.emit('play_again', { pin: state.room.pin });
    }
  });

  // Return home button
  dom.returnHomeBtn.addEventListener('click', () => {
    window.location.reload();
  });
}

// ---------------------------------------------------------------------
// Socket.io Real-Time Event Handlers
// ---------------------------------------------------------------------
function initSocketListeners() {
  // Room Created (Host)
  socket.on('room_created', data => {
    state.localPlayer = data.player;
    state.room.pin = data.pin;
    state.room.hostId = data.room.hostId;
    state.room.players = data.room.players;

    dom.lobbyPin.textContent = data.pin;
    dom.navPinDisplay.textContent = data.pin;

    switchView('lobby');
    renderLobbyPlayers(data.room.players, data.room.hostId);
    showToast(`Room ${data.pin} created! Share the code to invite friends.`);
  });

  // Room Joined (Guest)
  socket.on('room_joined', data => {
    state.localPlayer = data.player;
    state.room.pin = data.pin;
    state.room.hostId = data.room.hostId;
    state.room.players = data.room.players;

    dom.lobbyPin.textContent = data.pin;
    dom.navPinDisplay.textContent = data.pin;

    switchView('lobby');
    renderLobbyPlayers(data.room.players, data.room.hostId);
    showToast(`Joined Room ${data.pin}! Waiting for host.`);
  });

  // Join Error
  socket.on('join_error', ({ message }) => {
    dom.joinErrorMsg.textContent = message;
    dom.joinErrorMsg.classList.remove('hidden');
    sounds.error();
  });

  // Action Error
  socket.on('action_error', ({ message }) => {
    showToast(`⚠️ ${message}`);
  });

  // Lobby Update (when someone joins/leaves)
  socket.on('lobby_update', ({ players, hostId }) => {
    state.room.players = players;
    state.room.hostId = hostId;
    renderLobbyPlayers(players, hostId);
  });

  // Lobby Reaction Broadcast
  socket.on('lobby_reaction_broadcast', ({ emoji }) => {
    triggerFloatingEmoji(emoji);
  });

  // Player Left Room
  socket.on('player_left', ({ leftPlayerName, players, hostId }) => {
    state.room.players = players;
    state.room.hostId = hostId;
    showToast(`${leftPlayerName} left the room`);

    if (state.room.status === 'lobby') {
      renderLobbyPlayers(players, hostId);
    } else if (state.room.status === 'game') {
      const leavingLane = document.getElementById(`lane-${players.id}`);
      if (leavingLane) leavingLane.remove();
    }
  });

  // Countdown Initiated
  socket.on('game_countdown_start', ({ quote, players }) => {
    state.room.players = players;
    dom.countdownNumber.textContent = '3';
    dom.countdownOverlay.classList.remove('hidden');
    sounds.beep(600, 0.15);

    // Prepare game screen ready in background
    renderRaceTrack(players);
    initTypingTest(quote);
    switchView('game');

    // Show host early end button if local is host
    if (state.room.hostId === socket.id) {
      dom.hostEndRaceContainer.classList.remove('hidden');
    } else {
      dom.hostEndRaceContainer.classList.add('hidden');
    }
  });

  // Countdown Ticks (3 -> 2 -> 1)
  socket.on('countdown_tick', ({ count }) => {
    dom.countdownNumber.textContent = count;
    sounds.beep(count === 1 ? 800 : 600, 0.15);
  });

  // Game Started (GO!)
  socket.on('game_started', ({ startTime, quote }) => {
    dom.countdownNumber.textContent = 'GO!';
    sounds.beep(1200, 0.3);

    setTimeout(() => {
      dom.countdownOverlay.classList.add('hidden');
    }, 600);

    state.startTime = startTime;
    focusInput();

    // Start local timer HUD
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      if (state.startTime && !state.isFinished) {
        const elapsedSec = Math.floor((Date.now() - state.startTime) / 1000);
        const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const secs = String(elapsedSec % 60).padStart(2, '0');
        dom.hudTimer.textContent = `${mins}:${secs}`;
      }
    }, 500);
  });

  // Live Opponent Progress Update
  socket.on('race_progress_update', ({ playerId, progress, wpm }) => {
    updateLaneProgress(playerId, progress, wpm);
  });

  // A Player Finished the Race
  socket.on('player_completed', ({ player }) => {
    const rankElem = document.getElementById(`lane-rank-${player.id}`);
    if (rankElem) {
      rankElem.innerHTML = `<span class="rank-badge rank-${player.rank <= 3 ? player.rank : 'other'}">#${player.rank}</span>`;
    }
    updateLaneProgress(player.id, 100, player.wpm);

    if (player.id !== socket.id) {
      showToast(`${player.avatar} ${player.name} finished #${player.rank}!`);
    }
  });

  // Game Over (All Finished or Host Ended)
  socket.on('game_over', ({ leaderboard, hostId }) => {
    clearInterval(state.timerInterval);
    renderLeaderboard(leaderboard, hostId);
  });

  // Reset to Lobby for Rematch
  socket.on('room_reset_to_lobby', ({ players, hostId }) => {
    stopConfetti();
    state.room.players = players;
    state.room.hostId = hostId;
    switchView('lobby');
    renderLobbyPlayers(players, hostId);
    showToast('Rematch lobby ready!');
  });
}

// ---------------------------------------------------------------------
// Utility: HTML Escaping
// ---------------------------------------------------------------------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// App Initialization
// ---------------------------------------------------------------------
function init() {
  initEventListeners();
  initSocketListeners();

  // Pre-fill a random default racer name
  const defaultName = generateRandomName();
  dom.playerNameInput.value = defaultName;
  state.localPlayer.name = defaultName;

  // Check URL query parameters for direct invite link (?pin=123456)
  const urlParams = new URLSearchParams(window.location.search);
  const pinFromUrl = urlParams.get('pin');
  if (pinFromUrl && pinFromUrl.length === 6) {
    dom.joinPinInput.value = pinFromUrl;
    showToast(`PIN ${pinFromUrl} loaded from link! Enter nickname and click Join.`);
  }

  // Set initial sound state text
  dom.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
  dom.soundToggleBtn.querySelector('.btn-text').textContent = state.soundEnabled ? 'Sound ON' : 'Sound OFF';
}

// Boot up
window.addEventListener('DOMContentLoaded', init);
