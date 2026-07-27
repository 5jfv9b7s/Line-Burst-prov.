const SIZE = 8;
const BLACK = 1;
const WHITE = 2;
const CPU_DELAY = 550;
const FLIP_DELAY = 90;

const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

const elements = {
  board: document.getElementById('board'),
  status: document.getElementById('status'),
  timer: document.getElementById('timer'),
  blackScore: document.getElementById('black_score'),
  whiteScore: document.getElementById('white_score'),
  history: document.getElementById('history_list'),
  mode: document.getElementById('game_mode'),
  difficulty: document.getElementById('difficulty'),
  timeLimit: document.getElementById('time_limit'),
  homeScreen: document.getElementById('home_screen'),
  gameScreen: document.getElementById('game_screen'),
  homeMode: document.getElementById('home_mode'),
  homeDifficulty: document.getElementById('home_difficulty'),
  homeTimeLimit: document.getElementById('home_time_limit'),
  homeScoreMode: document.getElementById('home_score_mode'),
  homeCpuSetting: document.getElementById('home_cpu_setting'),
  onlineLobby: document.getElementById('online_lobby'),
  start: document.getElementById('start_button'),
  home: document.getElementById('home_button'),
  undo: document.getElementById('undo_button'),
  restart: document.getElementById('restart_button')
};

let board;
let turn;
let isAnimating;
let gameOver;
let statusMessage;
let moveHistory;
let snapshots;
let remainingSeconds;
let burstScores;
let scoreMode = 'stones';
let timeControl;
let clocks;
let timerId;
let cpuTimeoutId;
let actionToken = 0;

function playerName(player) {
  return player === BLACK ? '\u9ed2' : '\u767d';
}

function cloneBoard(sourceBoard) {
  return sourceBoard.map((row) => [...row]);
}

function isFixed(row, column) {
  return (row === 3 || row === 4) && (column === 3 || column === 4);
}

function isCpuGame() {
  return elements.mode.value === 'cpu';
}

function isCpuTurn() {
  return isCpuGame() && turn === WHITE;
}

function isOnlineGame() {
  return elements.mode.value === 'online';
}

function onlinePlayer() {
  const game = window.onlineGame;
  if (!isOnlineGame() || !game?.assignment) return null;
  return game.isHost ? game.assignment.hostColor : 3 - game.assignment.hostColor;
}

function isOnlineHost() {
  return isOnlineGame() && window.onlineGame?.isHost === true;
}

function sendOnlineState() {
  if (!isOnlineHost()) return;

  window.onlineGame.send({
    type: 'state',
    state: {
      board: cloneBoard(board),
      turn,
      moves: [...moveHistory],
      burstScores: { ...burstScores },
      remainingSeconds,
      clocks: { ...clocks },
      statusMessage,
      gameOver,
      scoreMode,
      timeLimit: elements.timeLimit.value
    }
  });
}

function applyOnlineState(state) {
  if (!isOnlineGame() || !state?.board || isOnlineHost()) return;

  cancelPendingActions();
  board = cloneBoard(state.board);
  turn = state.turn;
  moveHistory = [...state.moves];
  burstScores = { ...state.burstScores };
  remainingSeconds = state.remainingSeconds;
  clocks = { ...state.clocks };
  statusMessage = state.statusMessage;
  gameOver = state.gameOver;
  scoreMode = state.scoreMode;
  elements.timeLimit.value = state.timeLimit;
  timeControl = parseTimeControl(state.timeLimit);
  isAnimating = false;
  snapshots = [];
  elements.homeScreen.hidden = true;
  elements.gameScreen.hidden = false;
  render();
}

// ----- Game setup and UI rendering -----

function resetGame() {
  cancelPendingActions();

  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  board[3][3] = WHITE;
  board[3][4] = BLACK;
  board[4][3] = BLACK;
  board[4][4] = WHITE;
  burstScores = { black: 0, white: 0 };
  timeControl = parseTimeControl(elements.timeLimit.value);
  clocks = { black: timeControl.initialSeconds, white: timeControl.initialSeconds };

  turn = BLACK;
  isAnimating = false;
  gameOver = false;
  statusMessage = '\u9ed2\u306e\u756a\u3067\u3059\u3002';
  moveHistory = [];
  snapshots = [];

  render();
  startTurnTimer();
  sendOnlineState();
}

function cancelPendingActions() {
  actionToken += 1;
  clearTimeout(cpuTimeoutId);
  clearInterval(timerId);
}

function startGameFromHome() {
  if (elements.homeMode.value === 'online' && !window.onlineGame?.assignment) {
    const status = document.getElementById('online_status');
    status.textContent = 'P2P接続と色の決定を待っています。';
    return;
  }
  elements.mode.value = elements.homeMode.value;
  elements.difficulty.value = elements.homeDifficulty.value;
  elements.timeLimit.value = elements.homeTimeLimit.value;
  scoreMode = elements.homeScoreMode.value;
  elements.homeScreen.hidden = true;
  elements.gameScreen.hidden = false;
  resetGame();
}

function updateHomeCpuSetting() {
  elements.homeCpuSetting.hidden = elements.homeMode.value !== 'cpu';
  const isOnline = elements.homeMode.value === 'online';
  elements.onlineLobby.hidden = !isOnline;
  elements.onlineLobby.style.display = isOnline ? 'grid' : 'none';
}

function returnHome() {
  cancelPendingActions();
  elements.gameScreen.hidden = true;
  elements.homeScreen.hidden = false;
}

function render() {
  renderBoard();
  renderScore();
  renderHistory();
  renderTimer();

  elements.status.textContent = statusMessage;
  elements.undo.disabled = isAnimating || snapshots.length === 0 || isOnlineGame();
}

function renderBoard() {
  const boardIsDisabled = isAnimating || gameOver || isCpuTurn()
    || (isOnlineGame() && onlinePlayer() !== turn);

  elements.board.innerHTML = '';
  elements.board.className = `turn-${turn}`;

  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      const cell = createCell(row, column, boardIsDisabled);
      elements.board.appendChild(cell);
    }
  }
}

function createCell(row, column, boardIsDisabled) {
  const cell = document.createElement('button');
  const stone = board[row][column];
  const flippable = stone === 0 ? getFlippableStones(row, column, turn) : [];

  cell.type = 'button';
  cell.className = 'cell';
  cell.disabled = boardIsDisabled;
  cell.setAttribute('aria-label', flippable.length && !boardIsDisabled
    ? `Place at ${row + 1}, ${column + 1}`
    : `Cell ${row + 1}, ${column + 1}`);
  cell.addEventListener('click', () => makeMove(row, column));

  if (stone !== 0) {
    cell.appendChild(createStone(stone, row, column));
  } else if (flippable.length && !boardIsDisabled) {
    cell.classList.add('valid-move');
    const indicator = document.createElement('span');
    indicator.className = 'move-indicator';
    cell.appendChild(indicator);
  }

  return cell;
}

function createStone(player, row, column) {
  const stone = document.createElement('span');
  const colorClass = player === BLACK ? 'black' : 'white';

  stone.className = `stone ${colorClass} ${isFixed(row, column) ? 'fixed' : ''}`;
  stone.innerHTML = '<span class="front"></span><span class="back"></span>';
  return stone;
}

function renderScore() {
  const { black, white } = countStones();
  const blackScore = getPlayerScore(BLACK, black);
  const whiteScore = getPlayerScore(WHITE, white);

  elements.blackScore.textContent = formatScore(BLACK, black, blackScore);
  elements.whiteScore.textContent = formatScore(WHITE, white, whiteScore);
  elements.blackScore.classList.toggle('leading', blackScore > whiteScore);
  elements.whiteScore.classList.toggle('leading', whiteScore > blackScore);
}

function getPlayerScore(player, stoneCount) {
  const burstCount = player === BLACK ? burstScores.black : burstScores.white;

  if (scoreMode === 'bursts') return burstCount;
  if (scoreMode === 'combined') return stoneCount + burstCount * 10;
  return stoneCount;
}

function formatScore(player, stoneCount, totalScore) {
  const name = playerName(player);
  const burstCount = player === BLACK ? burstScores.black : burstScores.white;

  if (scoreMode === 'bursts') return `${name}  バースト ${burstCount}`;
  if (scoreMode === 'combined') return `${name}  ${totalScore}点（石 ${stoneCount} + バースト ${burstCount}×10）`;
  return `${name}  石 ${stoneCount}`;
}

function renderHistory() {
  const historyEntries = moveHistory.length ? moveHistory : ['\u5bfe\u5c40\u3092\u958b\u59cb\u3057\u307e\u3057\u305f\u3002'];
  elements.history.innerHTML = '';

  historyEntries.forEach((entry) => {
    const item = document.createElement('li');
    item.textContent = entry;
    elements.history.appendChild(item);
  });

  elements.history.scrollTop = elements.history.scrollHeight;
}

function renderTimer() {
  if (timeControl.type === 'none') {
    elements.timer.textContent = '\u6301\u3061\u6642\u9593\uff1a\u306a\u3057';
  } else if (timeControl.type === 'turn') {
    elements.timer.textContent = `1\u624b\u6b8b\u308a\u6642\u9593\uff1a${remainingSeconds}\u79d2`;
  } else {
    elements.timer.textContent = `\u30c1\u30a7\u30b9\u6642\u8a08  \u9ed2 ${formatClock(clocks.black)} / \u767d ${formatClock(clocks.white)}  (+${timeControl.incrementSeconds}\u79d2)`;
  }
  elements.timer.classList.toggle('warning', remainingSeconds > 0 && remainingSeconds <= 10);
}

function parseTimeControl(value) {
  if (value === 'none') return { type: 'none', initialSeconds: 0, incrementSeconds: 0 };

  const [type, initial, increment] = value.split('-');
  if (type === 'turn') return { type, initialSeconds: Number(initial), incrementSeconds: 0 };
  return { type: 'chess', initialSeconds: Number(initial), incrementSeconds: Number(increment) };
}

function formatClock(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${remaining}`;
}

// ----- Move handling and burst rules -----

function makeMove(row, column, fromRemote = false) {
  if (isAnimating || gameOver || isCpuTurn() || board[row][column] !== 0) return;
  if (isOnlineGame() && !fromRemote && onlinePlayer() !== turn) return;

  const flippableStones = getFlippableStones(row, column, turn);
  if (!flippableStones.length) return;

  saveSnapshot();
  if (isOnlineGame() && !fromRemote) {
    window.onlineGame.send({ type: 'move', row, column, player: turn });
  }
  applyMove(row, column, flippableStones);
}

function applyMove(row, column, flippableStones) {
  const movingPlayer = turn;

  board[row][column] = movingPlayer;
  moveHistory.push(`${playerName(movingPlayer)}\uff1a${row + 1}\u884c${column + 1}\u5217\u306b\u7f6e\u304f\uff08${flippableStones.length}\u679a\u8fd4\u3057\uff09`);
  statusMessage = `${playerName(movingPlayer)}\u304c\u77f3\u3092\u7f6e\u304d\u307e\u3057\u305f\u3002`;
  isAnimating = true;
  clearInterval(timerId);

  render();
  animateFlips(flippableStones, movingPlayer);
}

function animateFlips(flippableStones, movingPlayer) {
  let index = 0;

  function flipNextStone() {
    if (index >= flippableStones.length) {
      setTimeout(checkBurstAndFinish, 400);
      return;
    }

    const { row, column } = flippableStones[index];
    const cell = elements.board.children[row * SIZE + column];
    const stone = cell.querySelector('.stone');

    board[row][column] = movingPlayer;
    stone.classList.toggle('black', movingPlayer === BLACK);
    stone.classList.toggle('white', movingPlayer === WHITE);
    index += 1;

    setTimeout(flipNextStone, FLIP_DELAY);
  }

  setTimeout(flipNextStone, 80);
}

function checkBurstAndFinish() {
  const burstTargets = getBurstTargets(board);

  if (!burstTargets.length) {
    finishTurn();
    return;
  }

  burstTargets.forEach(({ row, column }) => {
    elements.board.children[row * SIZE + column]
      .querySelector('.stone')
      ?.classList.add('bursting');
  });

  moveHistory.push(`${burstTargets.length}\u500b\u306e\u77f3\u304c\u30d0\u30fc\u30b9\u30c8\uff01`);
  if (turn === BLACK) burstScores.black += burstTargets.length;
  else burstScores.white += burstTargets.length;
  statusMessage = `${burstTargets.length}\u500b\u306e\u77f3\u304c\u30d0\u30fc\u30b9\u30c8\uff01`;
  elements.status.textContent = statusMessage;
  renderHistory();

  setTimeout(() => {
    burstTargets.forEach(({ row, column }) => {
      board[row][column] = 0;
    });
    finishTurn();
  }, 500);
}

function getBurstTargets(state) {
  const targets = new Map();

  getAllLines().forEach((line) => {
    let sequence = [];
    let color = 0;

    const markBurstTargets = () => {
      if (sequence.length < 4) return;

      sequence.slice(1, -1).forEach((position) => {
        if (!isFixed(position.row, position.column)) {
          targets.set(`${position.row}-${position.column}`, position);
        }
      });
    };

    line.forEach((position) => {
      const nextColor = state[position.row][position.column];

      if (nextColor !== 0 && nextColor === color) {
        sequence.push(position);
      } else {
        markBurstTargets();
        color = nextColor;
        sequence = nextColor === 0 ? [] : [position];
      }
    });

    markBurstTargets();
  });

  return [...targets.values()];
}

function getAllLines() {
  const lines = [];

  for (let row = 0; row < SIZE; row += 1) {
    lines.push(Array.from({ length: SIZE }, (_, column) => ({ row, column })));
  }
  for (let column = 0; column < SIZE; column += 1) {
    lines.push(Array.from({ length: SIZE }, (_, row) => ({ row, column })));
  }
  for (let start = 0; start < SIZE; start += 1) {
    lines.push(makeLine(start, 0, 1, 1));
    lines.push(makeLine(start, SIZE - 1, 1, -1));
    if (start > 0) {
      lines.push(makeLine(0, start, 1, 1));
      lines.push(makeLine(0, start, 1, -1));
    }
  }

  return lines.filter((line) => line.length >= 4);
}

function makeLine(row, column, rowStep, columnStep) {
  const line = [];

  while (row >= 0 && row < SIZE && column >= 0 && column < SIZE) {
    line.push({ row, column });
    row += rowStep;
    column += columnStep;
  }

  return line;
}

// ----- Turn, pass and game over -----

function finishTurn() {
  applyChessIncrement();
  isAnimating = false;
  turn = 3 - turn;
  checkPassAndGameOver();
}

function applyChessIncrement() {
  if (timeControl.type !== 'chess') return;

  if (turn === BLACK) clocks.black += timeControl.incrementSeconds;
  else clocks.white += timeControl.incrementSeconds;
}

function checkPassAndGameOver() {
  if (hasValidMoves(turn)) {
    statusMessage = `${playerName(turn)}\u306e\u756a\u3067\u3059\u3002`;
    render();
    startTurnTimer();
    if (isCpuTurn()) scheduleCpuMove();
    sendOnlineState();
    return;
  }

  const passedPlayer = turn;
  const opponent = 3 - turn;

  if (hasValidMoves(opponent)) {
    completePass();
    return;
  }

  endGame();
}

function completePass() {
  const passedPlayer = turn;

  turn = 3 - turn;
  moveHistory.push(`${playerName(passedPlayer)}\u306f\u30d1\u30b9`);
  statusMessage = `${playerName(passedPlayer)}\u306f\u30d1\u30b9\u3067\u3059\u3002${playerName(turn)}\u306e\u756a\u3067\u3059\u3002`;
  render();
  startTurnTimer();
  if (isCpuTurn()) scheduleCpuMove();
  sendOnlineState();
}

function endGame() {
  const { black, white } = countStones();
  const blackScore = getPlayerScore(BLACK, black);
  const whiteScore = getPlayerScore(WHITE, white);
  const result = blackScore === whiteScore ? '\u5f15\u304d\u5206\u3051\uff01' : `${blackScore > whiteScore ? '\u9ed2' : '\u767d'}\u306e\u52dd\u3061\uff01`;

  gameOver = true;
  clearInterval(timerId);
  statusMessage = `\u30b2\u30fc\u30e0\u7d42\u4e86\uff1a\u9ed2 ${blackScore} - \u767d ${whiteScore}\u3002${result}`;
  moveHistory.push(`\u30b2\u30fc\u30e0\u7d42\u4e86\uff1a${result}`);
  render();
  sendOnlineState();
}

function countStones() {
  return board.flat().reduce((counts, stone) => ({
    black: counts.black + (stone === BLACK),
    white: counts.white + (stone === WHITE)
  }), { black: 0, white: 0 });
}

function hasValidMoves(player) {
  return findLegalMoves(player).length > 0;
}

function findLegalMoves(player) {
  const moves = [];

  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      if (board[row][column] !== 0) continue;

      const flips = getFlippableStones(row, column, player);
      if (flips.length) moves.push({ row, column, flips });
    }
  }

  return moves;
}

function getFlippableStones(startRow, startColumn, player) {
  const opponent = 3 - player;
  const allFlippable = [];

  DIRECTIONS.forEach(([rowStep, columnStep]) => {
    let row = startRow + rowStep;
    let column = startColumn + columnStep;
    const line = [];

    while (row >= 0 && row < SIZE && column >= 0 && column < SIZE && board[row][column] === opponent) {
      line.push({ row, column });
      row += rowStep;
      column += columnStep;
    }

    if (line.length && row >= 0 && row < SIZE && column >= 0 && column < SIZE && board[row][column] === player) {
      allFlippable.push(...line);
    }
  });

  return allFlippable;
}

// ----- CPU opponent -----

function scheduleCpuMove() {
  isAnimating = true;
  statusMessage = 'CPU\u304c\u8003\u3048\u3066\u3044\u307e\u3059\u2026';
  render();

  const currentToken = actionToken;
  cpuTimeoutId = setTimeout(() => {
    if (currentToken !== actionToken || gameOver) return;

    const move = chooseCpuMove();
    isAnimating = false;
    if (!move) return;

    saveSnapshot();
    applyMove(move.row, move.column, move.flips);
  }, CPU_DELAY);
}

function chooseCpuMove() {
  const moves = findLegalMoves(WHITE);
  if (!moves.length) return null;
  if (elements.difficulty.value === 'easy') return randomMove(moves);

  const rankedMoves = moves
    .map((move) => ({ move, score: evaluateCpuMove(move) }))
    .sort((left, right) => right.score - left.score);

  return elements.difficulty.value === 'normal'
    ? randomMove(rankedMoves.slice(0, 2).map(({ move }) => move))
    : rankedMoves[0].move;
}

function randomMove(moves) {
  return moves[Math.floor(Math.random() * moves.length)];
}

function evaluateCpuMove(move) {
  const simulatedBoard = cloneBoard(board);
  const isCorner = (move.row === 0 || move.row === SIZE - 1) && (move.column === 0 || move.column === SIZE - 1);
  const isEdge = move.row === 0 || move.row === SIZE - 1 || move.column === 0 || move.column === SIZE - 1;

  simulatedBoard[move.row][move.column] = WHITE;
  move.flips.forEach(({ row, column }) => {
    simulatedBoard[row][column] = WHITE;
  });

  return move.flips.length * 3
    + (isCorner ? 80 : isEdge ? 8 : 0)
    - getBurstTargets(simulatedBoard).length * 5;
}

// ----- Timer and undo -----

function startTurnTimer() {
  clearInterval(timerId);
  if (timeControl.type === 'turn') remainingSeconds = timeControl.initialSeconds;
  if (timeControl.type === 'chess') remainingSeconds = turn === BLACK ? clocks.black : clocks.white;
  renderTimer();

  if (timeControl.type === 'none' || gameOver || isCpuTurn() || (isOnlineGame() && !isOnlineHost())) return;

  timerId = setInterval(() => {
    if (timeControl.type === 'turn') {
      remainingSeconds -= 1;
    } else if (turn === BLACK) {
      clocks.black -= 1;
      remainingSeconds = clocks.black;
    } else {
      clocks.white -= 1;
      remainingSeconds = clocks.white;
    }
    renderTimer();
    sendOnlineState();

    if (remainingSeconds <= 0) {
      clearInterval(timerId);
      handleTimeOut();
    }
  }, 1000);
}

function handleTimeOut() {
  if (isAnimating || gameOver) return;

  if (timeControl.type === 'chess') {
    endGameByTime();
    return;
  }

  saveSnapshot();
  moveHistory.push(`${playerName(turn)}\u306f\u6642\u9593\u5207\u308c\u3067\u30d1\u30b9`);
  statusMessage = `${playerName(turn)}\u306f\u6642\u9593\u5207\u308c\u3067\u30d1\u30b9\u3067\u3059\u3002`;
  turn = 3 - turn;
  checkPassAndGameOver();
}

function endGameByTime() {
  const winner = 3 - turn;

  gameOver = true;
  statusMessage = `${playerName(turn)}\u306f\u6642\u9593\u5207\u308c\u3002${playerName(winner)}\u306e\u52dd\u3061\uff01`;
  moveHistory.push(`\u6642\u9593\u5207\u308c\uff1a${playerName(winner)}\u306e\u52dd\u3061`);
  render();
  sendOnlineState();
}

function saveSnapshot() {
  snapshots.push({
    board: cloneBoard(board),
    turn,
    moves: [...moveHistory],
    burstScores: { ...burstScores },
    remainingSeconds,
    clocks: { ...clocks },
    statusMessage
  });
}

function undoMove() {
  if (isAnimating || !snapshots.length) return;

  cancelPendingActions();
  let snapshot = snapshots.pop();

  // In CPU mode, undo both the CPU move and the preceding player move.
  if (isCpuGame()) {
    while (snapshot && snapshot.turn !== BLACK && snapshots.length) {
      snapshot = snapshots.pop();
    }
  }
  if (!snapshot) return;

  board = cloneBoard(snapshot.board);
  turn = snapshot.turn;
  moveHistory = snapshot.moves;
  burstScores = { ...snapshot.burstScores };
  remainingSeconds = snapshot.remainingSeconds;
  clocks = { ...snapshot.clocks };
  statusMessage = '1\u624b\u623b\u3057\u307e\u3057\u305f\u3002';
  gameOver = false;
  isAnimating = false;

  render();
  startTurnTimer();
}

elements.restart.addEventListener('click', () => {
  if (isOnlineGame() && !isOnlineHost()) return;
  resetGame();
});
elements.undo.addEventListener('click', undoMove);
elements.start.addEventListener('click', startGameFromHome);
elements.home.addEventListener('click', returnHome);
elements.homeMode.addEventListener('change', updateHomeCpuSetting);
elements.mode.addEventListener('change', resetGame);
elements.difficulty.addEventListener('change', resetGame);
elements.timeLimit.addEventListener('change', resetGame);

window.addEventListener('online:assignment', (event) => {
  const { settings } = event.detail;
  elements.mode.value = 'online';
  if (settings) {
    elements.homeScoreMode.value = settings.scoreMode;
    elements.homeTimeLimit.value = settings.timeControl;
  }
  const player = window.onlineGame.isHost ? event.detail.hostColor : 3 - event.detail.hostColor;
  document.getElementById('online_status').textContent = `あなたは${playerName(player)}です。開始できます。`;
});

window.addEventListener('online:message', (event) => {
  const message = event.detail;
  if (message.type === 'state') {
    applyOnlineState(message.state);
    return;
  }
  const validPosition = Number.isInteger(message.row) && Number.isInteger(message.column)
    && message.row >= 0 && message.row < SIZE && message.column >= 0 && message.column < SIZE;
  if (message.type === 'move' && validPosition && isOnlineGame() && message.player === turn && onlinePlayer() !== turn) {
    makeMove(message.row, message.column, true);
  }
});

resetGame();
updateHomeCpuSetting();
