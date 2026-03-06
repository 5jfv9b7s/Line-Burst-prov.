const SIZE = 8;
let board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
let turn = 1; // 1: Black, 2: White
let isAnimating = false; 


const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const scoreEl = document.getElementById('score');

const DIRECTIONS = [
    [-1,-1], [-1, 0], [-1, 1],
    [ 0,-1],          [ 0, 1],
    [ 1,-1], [ 1, 0], [ 1, 1]
];

// 初期配置の4枚（固定石）かどうかを判定する関数
function isFixed(r, c) {
    return (r === 3 && c === 3) || (r === 3 && c === 4) ||
           (r === 4 && c === 3) || (r === 4 && c === 4);
}

function init() {
    board[3][3] = 2; board[3][4] = 1;
    board[4][3] = 1; board[4][4] = 2;
    render();
}

function render() {
    boardEl.innerHTML = '';
    boardEl.className = `turn-${turn}`;

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.onclick = () => handleMove(r, c);

            const val = board[r][c];

            if (val !== 0) {
              const stone = document.createElement('div');
              // 固定石の場合は 'fixed' クラスを追加して目印をつける
              stone.className = `stone ${val === 1 ? 'black' : 'white'} ${isFixed(r, c) ? 'fixed' : ''}`;
              
              const front = document.createElement('div');
              front.className = 'front';
              const back = document.createElement('div');
              back.className = 'back';
              
              stone.appendChild(front);
              stone.appendChild(back);
              cell.appendChild(stone);
            } else {
              const isValidMove = !isAnimating && getFlippableStones(r, c, turn).length > 0;
              if (isValidMove) {
                const indicator = document.createElement('div');
                indicator.className = 'move-indicator';
                cell.appendChild(indicator);
              }
            }

            boardEl.appendChild(cell);
        }
    }
    statusEl.textContent = `${turn === 1 ? '黒（Black）' : '白（White）'} の番です`;
}

function handleMove(r, c) {
    if (isAnimating) return; 
    if (board[r][c] !== 0) return;

    const flippableStones = getFlippableStones(r, c, turn);
    
    if (flippableStones.length > 0) {
        board[r][c] = turn; 
        isAnimating = true; 

        render(); 
        flipSequentially(flippableStones);
    }
}

function flipSequentially(stonesToFlip) {
    let flipSequence = [...stonesToFlip];
    let index = 0;
    const FLIP_INTERVAL = 100; 
    const ANIMATION_DURATION = 600; 

    function flipNextStone() {
        if (index >= flipSequence.length) {
            setTimeout(() => {
                checkBurstAndFinalize(); 
            }, ANIMATION_DURATION);
            return;
        }

        const pos = flipSequence[index];
        board[pos.r][pos.c] = turn; 

        const cellIndex = pos.r * SIZE + pos.c;
        const cellEl = boardEl.children[cellIndex];
        const stoneEl = cellEl.querySelector('.stone');

        if (stoneEl) {
            if (turn === 1) {
                stoneEl.classList.remove('white');
                stoneEl.classList.add('black');
            } else {
                stoneEl.classList.remove('black');
                stoneEl.classList.add('white');
            }
        }

        index++;
        setTimeout(flipNextStone, FLIP_INTERVAL);
    }
    setTimeout(flipNextStone, 50);
}

function checkBurstAndFinalize() {
    let toRemove = [];

    function checkLine(line) {
        let currentSequence = [];
        let currentColor = 0;
        
        for (let pos of line) {
            let color = board[pos.r][pos.c];
            if (color !== 0 && color === currentColor) {
                currentSequence.push(pos);
            } else {
                if (currentSequence.length >= 4) {
                    for (let i = 1; i < currentSequence.length - 1; i++) {
                        // 固定石はバースト対象から除外する
                        if (!isFixed(currentSequence[i].r, currentSequence[i].c)) {
                            toRemove.push(currentSequence[i]); 
                        }
                    }
                }
                currentColor = color;
                currentSequence = color !== 0 ? [pos] : [];
            }
        }
        if (currentSequence.length >= 4) {
            for (let i = 1; i < currentSequence.length - 1; i++) {
                // 固定石はバースト対象から除外する
                if (!isFixed(currentSequence[i].r, currentSequence[i].c)) {
                    toRemove.push(currentSequence[i]);
                }
            }
        }
    }

    for (let r = 0; r < SIZE; r++) {
        let line = [];
        for (let c = 0; c < SIZE; c++) line.push({r, c});
        checkLine(line);
    }
    for (let c = 0; c < SIZE; c++) {
        let line = [];
        for (let r = 0; r < SIZE; r++) line.push({r, c});
        checkLine(line);
    }
    for (let startR = 0; startR < SIZE; startR++) {
        let line = []; let r = startR, c = 0;
        while(r < SIZE && c < SIZE) { line.push({r,c}); r++; c++; }
        checkLine(line);
    }
    for (let startC = 1; startC < SIZE; startC++) {
        let line = []; let r = 0, c = startC;
        while(r < SIZE && c < SIZE) { line.push({r,c}); r++; c++; }
        checkLine(line);
    }
    for (let startR = 0; startR < SIZE; startR++) {
        let line = []; let r = startR, c = SIZE - 1;
        while(r < SIZE && c >= 0) { line.push({r,c}); r++; c--; }
        checkLine(line);
    }
    for (let startC = 0; startC < SIZE - 1; startC++) {
        let line = []; let r = 0, c = startC;
        while(r < SIZE && c >= 0) { line.push({r,c}); r++; c--; }
        checkLine(line);
    }

    if (toRemove.length > 0) {
        let uniqueToRemove = toRemove.filter((val, index, self) =>
            index === self.findIndex((t) => (t.r === val.r && t.c === val.c))
        );
        
        uniqueToRemove.forEach(pos => {
            const cellIndex = pos.r * SIZE + pos.c;
            const stoneEl = boardEl.children[cellIndex].querySelector('.stone');
            if (stoneEl) {
                stoneEl.classList.add('bursting');
            }
        });

        setTimeout(() => {
            uniqueToRemove.forEach(pos => {
                board[pos.r][pos.c] = 0;
            });
            finalizeTurn();
        }, 500);
    } else {
        finalizeTurn();
    }
}

function finalizeTurn() {
    isAnimating = false;
    turn = 3 - turn; 
    render(); 
    checkPassAndGameOver(); 
}

function hasValidMoves(currentTurn) {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (board[r][c] === 0 && getFlippableStones(r, c, currentTurn).length > 0) {
                return true;
            }
        }
    }
    return false;
}

function checkPassAndGameOver() {
    if (!hasValidMoves(turn)) {
        const opponent = 3 - turn;
        
        if (!hasValidMoves(opponent)) {
            statusEl.textContent = "ゲーム終了！";
            alert("両プレイヤーとも置ける場所がありません。ゲーム終了です！");
        } else {
            const passPlayerName = turn === 1 ? '黒（Black）' : '白（White）';
            alert(`${passPlayerName} は置ける場所がないためパスとなります。`);
            turn = opponent;
            render();
            setTimeout(checkPassAndGameOver, 100); 
        }
    }
}

// ひっくり返せる石を取得する関数（修正版）
function getFlippableStones(startR, startC, currentTurn) {
    let allFlippable = [];
    const opponent = 3 - currentTurn;

    for (let [dr, dc] of DIRECTIONS) {
        let r = startR + dr;
        let c = startC + dc;
        let tempLine = [];

        // 相手の石が続く限り進む（固定石もひっくり返せるように戻しました）
        while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === opponent) {
            tempLine.push({r, c});
            r += dr;
            c += dc;
        }

        // 自分の石で挟まれていればひっくり返せるリストに追加
        if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === currentTurn) {
            if (tempLine.length > 0) {
                allFlippable = allFlippable.concat(tempLine);
            }
        }
    }
    return allFlippable;
}

init();