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
let timerId;
let cpuTimeoutId;
let actionToken = 0;

function playerName(player) {
  return player === BLACK ? 'Black' : 'White';
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

// ----- Game setup and UI rendering -----

function resetGame() {
  cancelPendingActions();

  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  board[3][3] = WHITE;
  board[3][4] = BLACK;
  board[4][3] = BLACK;
  board[4][4] = WHITE;

  turn = BLACK;
  isAnimating = false;
  gameOver = false;
  statusMessage = "Black's turn.";
  moveHistory = [];
  snapshots = [];

  render();
  startTurnTimer();
}

function cancelPendingActions() {
  actionToken += 1;
  clearTimeout(cpuTimeoutId);
  clearInterval(timerId);
}

function render() {
  renderBoard();
  renderScore();
  renderHistory();
  renderTimer();

  elements.status.textContent = statusMessage;
  elements.undo.disabled = isAnimating || snapshots.length === 0;
}

function renderBoard() {
  const boardIsDisabled = isAnimating || gameOver || isCpuTurn();

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

  elements.blackScore.textContent = `Black ${black}`;
  elements.whiteScore.textContent = `White ${white}`;
  elements.blackScore.classList.toggle('leading', black > white);
  elements.whiteScore.classList.toggle('leading', white > black);
}

function renderHistory() {
  const historyEntries = moveHistory.length ? moveHistory : ['Game started.'];
  elements.history.innerHTML = '';

  historyEntries.forEach((entry) => {
    const item = document.createElement('li');
    item.textContent = entry;
    elements.history.appendChild(item);
  });

  elements.history.scrollTop = elements.history.scrollHeight;
}

function renderTimer() {
  const hasTimeLimit = Number(elements.timeLimit.value) > 0;

  elements.timer.textContent = hasTimeLimit
    ? `Time left: ${remainingSeconds}s`
    : 'Time limit: none';
  elements.timer.classList.toggle('warning', remainingSeconds > 0 && remainingSeconds <= 10);
}

// ----- Move handling and burst rules -----

function makeMove(row, column) {
  if (isAnimating || gameOver || isCpuTurn() || board[row][column] !== 0) return;

  const flippableStones = getFlippableStones(row, column, turn);
  if (!flippableStones.length) return;

  saveSnapshot();
  applyMove(row, column, flippableStones);
}

function applyMove(row, column, flippableStones) {
  const movingPlayer = turn;

  board[row][column] = movingPlayer;
  moveHistory.push(`${playerName(movingPlayer)}: ${row + 1}, ${column + 1} (${flippableStones.length} flips)`);
  statusMessage = `${playerName(movingPlayer)} placed a stone.`;
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

  moveHistory.push(`${burstTargets.length} stones burst!`);
  statusMessage = `${burstTargets.length} stones burst!`;
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
  isAnimating = false;
  turn = 3 - turn;
  checkPassAndGameOver();
}

function checkPassAndGameOver() {
  if (hasValidMoves(turn)) {
    statusMessage = `${playerName(turn)}'s turn.`;
    render();
    startTurnTimer();
    if (isCpuTurn()) scheduleCpuMove();
    return;
  }

  const passedPlayer = turn;
  const opponent = 3 - turn;

  if (hasValidMoves(opponent)) {
    turn = opponent;
    moveHistory.push(`${playerName(passedPlayer)} passes.`);
    statusMessage = `${playerName(passedPlayer)} passes. ${playerName(turn)}'s turn.`;
    render();
    startTurnTimer();
    if (isCpuTurn()) scheduleCpuMove();
    return;
  }

  endGame();
}

function endGame() {
  const { black, white } = countStones();
  const result = black === white ? 'Draw!' : `${black > white ? 'Black' : 'White'} wins!`;

  gameOver = true;
  clearInterval(timerId);
  statusMessage = `Game over: Black ${black} - White ${white}. ${result}`;
  moveHistory.push(`Game over: ${result}`);
  render();
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
  statusMessage = 'CPU is thinking...';
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
  remainingSeconds = Number(elements.timeLimit.value);
  renderTimer();

  if (!remainingSeconds || gameOver || isCpuTurn()) return;

  timerId = setInterval(() => {
    remainingSeconds -= 1;
    renderTimer();

    if (remainingSeconds <= 0) {
      clearInterval(timerId);
      handleTimeOut();
    }
  }, 1000);
}

function handleTimeOut() {
  if (isAnimating || gameOver) return;

  saveSnapshot();
  moveHistory.push(`${playerName(turn)} timed out and passes.`);
  statusMessage = `${playerName(turn)} timed out and passes.`;
  turn = 3 - turn;
  checkPassAndGameOver();
}

function saveSnapshot() {
  snapshots.push({
    board: cloneBoard(board),
    turn,
    moves: [...moveHistory],
    remainingSeconds,
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
  remainingSeconds = snapshot.remainingSeconds;
  statusMessage = 'Move undone.';
  gameOver = false;
  isAnimating = false;

  render();
  startTurnTimer();
}

elements.restart.addEventListener('click', resetGame);
elements.undo.addEventListener('click', undoMove);
elements.mode.addEventListener('change', resetGame);
elements.difficulty.addEventListener('change', resetGame);
elements.timeLimit.addEventListener('change', resetGame);

resetGame();
