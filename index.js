// UNO 4.0 Backend – Coins, Leaderboard, Music Placeholder, Room Sharing
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const colors = ['red', 'green', 'blue', 'yellow'];
const values = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Skip', 'Reverse', 'Draw Two'];
const specialCards = ['Wild', 'Wild Draw Four'];

const leaderboard = {};
const playerCoins = {};

function generateDeck() {
  const deck = [];
  for (let color of colors) {
    values.forEach(v => deck.push({ color, value: v }));
    specialCards.forEach(s => deck.push({ color: 'black', value: s }));
  }
  return deck.sort(() => Math.random() - 0.5);
}

const rooms = {};

io.on('connection', (socket) => {
  socket.on('create-room', ({ isBotRoom = false }) => {
    const roomId = uuidv4();
    rooms[roomId] = {
      deck: generateDeck(),
      players: [],
      hands: {},
      playerMeta: {},
      currentPlayerIndex: 0,
      topCard: null,
      isBotRoom,
      coinWager: 0,
      started: false
    };
    socket.emit('room-created', roomId);
  });

  socket.on('join-room', ({ roomId, playerName, avatar, coins }) => {
    socket.join(roomId);
    const room = rooms[roomId];
    if (!room) return;

    const playerId = socket.id;
    if (!room.players.includes(playerId)) {
      room.players.push(playerId);
      room.hands[playerId] = room.deck.splice(0, 7);
      room.playerMeta[playerId] = {
        name: playerName || 'Player',
        avatar: avatar || '',
        coins: coins || 0
      };
      playerCoins[playerId] = coins || 100; // default start
    }

    socket.emit('deal-hand', room.hands[playerId]);
    io.to(roomId).emit('update-players', {
      players: room.players.map(id => ({
        id,
        ...room.playerMeta[id],
        coins: playerCoins[id] || 0
      }))
    });

    if (!room.topCard) {
      room.topCard = room.deck.pop();
      io.to(roomId).emit('top-card', room.topCard);
    }

    if (room.players[room.currentPlayerIndex] === playerId) {
      socket.emit('your-turn');
    }

    socket.on('play-card', ({ roomId, card }) => {
      const r = rooms[roomId];
      if (!r || !r.hands[socket.id]) return;

      const hand = r.hands[socket.id];
      const cardIndex = hand.findIndex(c => c.color === card.color && c.value === card.value);
      if (cardIndex === -1) return;

      hand.splice(cardIndex, 1);
      r.topCard = card;
      io.to(roomId).emit('top-card', card);
      io.to(roomId).emit('game-log', `${r.playerMeta[socket.id].name} played ${card.color} ${card.value}`);

      if (hand.length === 0) {
        const winnerName = r.playerMeta[socket.id].name;
        leaderboard[winnerName] = (leaderboard[winnerName] || 0) + 1;
        playerCoins[socket.id] += r.coinWager * r.players.length;
        io.to(roomId).emit('game-log', `${winnerName} wins the game! 🏆`);
        io.to(roomId).emit('game-over', { winner: winnerName });
        return;
      }

      nextTurn(roomId);
    });

    socket.on('draw-card', (roomId) => {
      const r = rooms[roomId];
      if (!r) return;
      const drawnCard = r.deck.pop();
      r.hands[socket.id].push(drawnCard);
      socket.emit('card-drawn', drawnCard);
      io.to(roomId).emit('game-log', `${r.playerMeta[socket.id].name} drew a card`);
      nextTurn(roomId);
    });

    socket.on('chat-message', ({ roomId, text }) => {
      const r = rooms[roomId];
      const name = r?.playerMeta[socket.id]?.name || 'Unknown';
      io.to(roomId).emit('chat-message', { name, text });
    });

    socket.on('request-leaderboard', () => {
      socket.emit('leaderboard', leaderboard);
    });

    socket.on('room-share-link', (roomId) => {
      const link = `https://uno-client.vercel.app/game/${roomId}`;
      socket.emit('share-link', link);
    });
  });
});

function nextTurn(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
  const nextPlayerId = room.players[room.currentPlayerIndex];

  const socket = io.sockets.sockets.get(nextPlayerId);
  if (socket) {
    socket.emit('your-turn');
  } else if (room.isBotRoom) {
    setTimeout(() => {
      const botHand = room.hands[nextPlayerId];
      const playable = botHand.find(c => c.color === room.topCard.color || c.value === room.topCard.value || c.color === 'black');

      if (playable) {
        const index = botHand.indexOf(playable);
        botHand.splice(index, 1);
        room.topCard = playable;
        io.to(roomId).emit('bot-played', playable);
        io.to(roomId).emit('game-log', `Bot played ${playable.color} ${playable.value}`);
      } else {
        const drawn = room.deck.pop();
        botHand.push(drawn);
        io.to(roomId).emit('game-log', `Bot drew a card`);
      }
      nextTurn(roomId);
    }, 1000);
  }
}

server.listen(3001, () => {
  console.log('UNO 4.0 Backend running on http://localhost:3001');
});
