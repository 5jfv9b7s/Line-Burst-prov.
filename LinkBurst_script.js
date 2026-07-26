const SIZE = 8;
const BLACK = 1;
const WHITE = 2;
const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],            [0, 1],
  [1, -1],  [1, 0],   [1, 1]
];

let board;
let turn;
let isAnimating;
let gameOver;

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const blackScoreEl = document.getElementById('black_score');
const whiteScoreEl = document.getElementById('white_score');
const restartButton = document.getElementById('restart_button');

function isFixed(row, column) {
  return (row === 3 || row === 4) && (column === 3 || column === 4);
}

function playerName(player) {
  return player === BLACK ? '黒' : '白';
}

function resetGame() {
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  board[3][3] = WHITE;
  board[3][4] = BLACK;
  board[4][3] = BLACK;
  board[4][4] = WHITE;
  turn = BLACK;
  isAnimating = false;
  gameOver = false;
  render();
}

function countStones() {
  let black = 0;
  let white = 0;
  board.flat().forEach((stone) => {
    if (stone === BLACK) black += 1;
    if (stone === WHITE) white += 1;
  });
  return { black, white };
}

function updateScore() {
  const { black, white } = countStones();
  blackScoreEl.textContent = `● 黒 ${black}`;
  whiteScoreEl.textContent = `● 白 ${white}`;
  blackScoreEl.classList.toggle('leading', black > white);
  whiteScoreEl.classList.toggle('leading', white > black);
}

function updateStatus(message) {
  if (message) {
    statusEl.textContent = message;
  } else if (!gameOver) {
    statusEl.textContent = `${playerName(turn)}の番です`;
  }
}

function render(message = '') {
  boardEl.innerHTML = '';
  boardEl.className = `turn-${turn}`;
  boardEl.setAttribute('aria-label', gameOver ? 'ゲーム終了' : `${playerName(turn)}の番の盤面`);

  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.setAttribute('aria-label', `${row + 1}行 ${column + 1}列`);
      cell.disabled = isAnimating || gameOver;
      cell.addEventListener('click', () => handleMove(row, column));

      const value = board[row][column];
      if (value !== 0) {
        const stone = document.createElement('span');
        stone.className = `stone ${value === BLACK ? 'black' : 'white'} ${isFixed(row, column) ? 'fixed' : ''}`;
        stone.innerHTML = '<span class="front"></span><span class="back"></span>';
        cell.appendChild(stone);
      } else if (!isAnimating && !gameOver && getFlippableStones(row, column, turn).length > 0) {
        cell.classList.add('valid-move');
        cell.setAttribute('aria-label', `${row + 1}行 ${column + 1}列に置く`);
        const indicator = document.createElement('span');
        indicator.className = 'move-indicator';
        cell.appendChild(indicator);
      }
      boardEl.appendChild(cell);
    }
  }
  updateScore();
  updateStatus(message);
}

function handleMove(row, column) {
  if (isAnimating || gameOver || board[row][column] !== 0) return;
  const flippableStones = getFlippableStones(row, column, turn);
  if (flippableStones.length === 0) return;

  board[row][column] = turn;
  isAnimating = true;
  render(`${playerName(turn)}が石を置きました`);
  flipSequentially(flippableStones);
}

function flipSequentially(stonesToFlip) {
  let index = 0;
  const flippingPlayer = turn;

  function flipNextStone() {
    if (index >= stonesToFlip.length) {
      setTimeout(checkBurstAndFinalize, 550);
      return;
    }
    const { row, column } = stonesToFlip[index];
    board[row][column] = flippingPlayer;
    const cell = boardEl.children[row * SIZE + column];
    const stone = cell.querySelector('.stone');
    stone.classList.toggle('black', flippingPlayer === BLACK);
    stone.classList.toggle('white', flippingPlayer === WHITE);
    index += 1;
    setTimeout(flipNextStone, 100);
  }
  setTimeout(flipNextStone, 80);
}

function checkBurstAndFinalize() {
  const burstTargets = new Map();
  const addBurstTargets = (line) => {
    let sequence = [];
    let color = 0;
    const processSequence = () => {
      if (sequence.length < 4) return;
      sequence.slice(1, -1).forEach((position) => {
        if (!isFixed(position.row, position.column)) {
          burstTargets.set(`${position.row}-${position.column}`, position);
        }
      });
    };

    line.forEach((position) => {
      const nextColor = board[position.row][position.column];
      if (nextColor !== 0 && nextColor === color) {
        sequence.push(position);
      } else {
        processSequence();
        color = nextColor;
        sequence = nextColor === 0 ? [] : [position];
      }
    });
    processSequence();
  };

  getAllLines().forEach(addBurstTargets);
  const targets = [...burstTargets.values()];
  if (targets.length === 0) {
    finalizeTurn();
    return;
  }

  targets.forEach(({ row, column }) => {
    boardEl.children[row * SIZE + column].querySelector('.stone')?.classList.add('bursting');
  });
  updateStatus(`${targets.length}個の石がバースト！`);
  setTimeout(() => {
    targets.forEach(({ row, column }) => { board[row][column] = 0; });
    finalizeTurn();
  }, 500);
}

function getAllLines() {
  const lines = [];
  for (let row = 0; row < SIZE; row += 1) lines.push(Array.from({ length: SIZE }, (_, column) => ({ row, column })));
  for (let column = 0; column < SIZE; column += 1) lines.push(Array.from({ length: SIZE }, (_, row) => ({ row, column })));
  for (let start = 0; start < SIZE; start += 1) {
    lines.push(makeLine(start, 0, 1, 1));
    if (start > 0) lines.push(makeLine(0, start, 1, 1));
    lines.push(makeLine(start, SIZE - 1, 1, -1));
    if (start < SIZE - 1) lines.push(makeLine(0, start, 1, -1));
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

function finalizeTurn() {
  isAnimating = false;
  turn = 3 - turn;
  checkPassAndGameOver();
}

function checkPassAndGameOver() {
  if (hasValidMoves(turn)) {
    render();
    return;
  }
  const passedPlayer = turn;
  const opponent = 3 - turn;
  if (hasValidMoves(opponent)) {
    turn = opponent;
    render(`${playerName(passedPlayer)}は置ける場所がないためパスです。${playerName(turn)}の番です`);
    return;
  }
  gameOver = true;
  const { black, white } = countStones();
  const result = black === white ? '引き分けです！' : `${black > white ? '黒' : '白'}の勝ちです！`;
  render(`ゲーム終了：黒 ${black} - 白 ${white}。${result}`);
}

function hasValidMoves(player) {
  return board.some((row, rowIndex) => row.some((value, columnIndex) =>
    value === 0 && getFlippableStones(rowIndex, columnIndex, player).length > 0));
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
    if (line.length > 0 && row >= 0 && row < SIZE && column >= 0 && column < SIZE && board[row][column] === player) {
      allFlippable.push(...line);
    }
  });
  return allFlippable;
}

restartButton.addEventListener('click', resetGame);
resetGame();
