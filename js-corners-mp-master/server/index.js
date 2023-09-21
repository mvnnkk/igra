const WebSocket = require('ws');
const process = require('process');

const SERVER_PORT = process.env.CORNERS_SERVER_PORT ?? 9000;

const playerEnemy = {
    '1': '2',
    '2': '1',
};
const fieldSize = {x: 8, y: 8}; // Клиент не реагирует на это, поэтому менять нельзя)
// const homeSize = {x: 1, y: 1}; // Для теста проверки победы
const homeSize = {x: 4, y: 3};

class GameFieldCell {
    player = '0';
    initPlayer = '0';
    init(player) {
        this.player = player;
        this.initPlayer = player;
    }
}


let players = {
    '1': null,
    '2': null,
};
let stepPlayer = null;
let gameField = [];
let inGame = false;
let winner = null;

function initField() {
    for (let y = 0; y < fieldSize.y; y++) {
        let row = [];
        for (let x = 0; x < fieldSize.x; x++) {
            row.push(new GameFieldCell());
        }
        gameField.push(row);
    }
    
    for (let y = 0; y < homeSize.y; y++) {
        for (let x = 0; x < homeSize.x; x++) {
            gameField[y][x].init('1');
            gameField[fieldSize.y - y - 1][fieldSize.x - x - 1].init('2');
        }
    }
}

function canMove(fromX, fromY, toX, toY) {
    const deltaX = toX - fromX;
    const deltaY = toY - fromY;

    if (gameField[toX][toY].player != '0') {
        return false;
    }

    if (Math.abs(deltaX) <= 1 && Math.abs(deltaY) <= 1) {
        return true;
    }

    if (
        (Math.abs(deltaX) == 1 && Math.abs(deltaY) == 2)
        || (Math.abs(deltaX) == 2 && Math.abs(deltaY) == 1)
        || (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)
    ) {
        return false;
    }

    return gameField[Number(fromX) + (deltaX / 2)][Number(fromY) + (deltaY / 2)].player != '0';
}

function checkWinConditions(player) {
    for (let row of gameField) {
        for (let cell of row) {
            if (cell.initPlayer != playerEnemy[player]) {
                continue;
            }

            if (cell.player != player) {
                return false;
            }
        }
    }

    return true;
}

const wss = new WebSocket.Server({port: SERVER_PORT});
wss.addListener('connection', (client) => {
    client.ssend = client.send; // Костыль, но так удобнее))
    client.send = function (data) {
        this.ssend(JSON.stringify(data));
    };
    client.alert = function (text) {
        this.send({
            action: 'alert',
            text, 
        });
    };
    client.update = function () {
        this.send({
            action: 'update',
            gameField,
            stepPlayer,
            inGame,
            winner,
            player: this.player,
            players: {
                '1': players['1']?.nickname ?? null,
                '2': players['2']?.nickname ?? null,
            },
        });
    };

    if (players['1'] === null) {
        players['1'] = client;
        client.player = '1';
    } else if (players['2'] === null) {
        players['2'] = client;
        client.player = '2';
    } else {
        client.alert('В игре нет мест.');
        client.close();
        return;
    }

    client.alert(`Вы вошли в игру как игрок #${client.player}.`);
    client.update();

    if (players['1'] !== null && players['2'] !== null) {
        inGame = true;
        initField();
        stepPlayer = '1';
        wss.clients.forEach(client => client.update());
    }

    client.addEventListener('message', (e) => {
        const data = JSON.parse(e.data);
        const client = e.target;

        switch (data.action) {
            case 'nickname': {
                client.nickname = data.nickname;
                console.log(`Player ${client.player} set '${data.nickname}' nickname.`);
                wss.clients.forEach(client => client.update());
                break;
            }
            case 'move': {
                if (client.player != stepPlayer) {
                    client.alert('Сейчас не Ваш ход.');
                    return;
                }
                
                if (!canMove(data.fromX, data.fromY, data.toX, data.toY)) {
                    client.alert('Так ходить нельзя.');
                    return;
                }

                gameField[data.toX][data.toY].player = gameField[data.fromX][data.fromY].player;
                gameField[data.fromX][data.fromY].player = '0';
                
                stepPlayer = playerEnemy[stepPlayer];
                wss.clients.forEach(client => client.update());

                if (checkWinConditions(playerEnemy[stepPlayer])) {
                    winner = playerEnemy[stepPlayer];
                    console.log(`Player #${winner} win!`);
                    wss.clients.forEach(client => client.alert(`Победил игрок #${winner} ${players[winner].nickname}`));
                    wss.clients.forEach(client => client.update());
                    wss.clients.forEach(client => client.close());
                }
                break;
            }
        }
    });

    client.addEventListener('close', (e) => {
        if (e.target.player === undefined) {
            return;
        }

        players[e.target.player] = null;
        console.log(`Player #${e.target.player} disconnected.`);

        if (inGame) {
            inGame = false;
            gameField = [];
            stepPlayer = null;
            winner = null;
            wss.clients.forEach(client => client.alert(`Игрок #${e.target.player} отключился`));
        }
        wss.clients.forEach(client => client.update());
    });
});

console.log(`Server started on ${SERVER_PORT} port.`);
