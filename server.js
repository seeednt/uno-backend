
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://uno-frontend-mu.vercel.app'],
    methods: ['GET', 'POST']
  }
});


let rooms = {};

function createDeck() {
  const colors = ['Red', 'Green', 'Blue', 'Yellow'];
  const values = [...Array(10).keys()].map(String).concat(['Skip', 'Reverse', '+2']);
  const deck = [];

  for (const color of colors) {
    for (const value of values) {
      deck.push({ color, value });
      deck.push({ color, value }); // two of each
    }
  }

  ['Wild', 'Wild+4'].forEach(value => {
    for (let i = 0; i < 4; i++) deck.push({ color: 'Black', value });
  });

  return deck.sort(() => Math.random() - 0.5);
}

function getNextPlayerIndex(players, currentIndex) {
  return (currentIndex + 1) % players.length;
}

io.on('connection', socket => {
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        deck: createDeck(),
        hands: {},
        currentPlayerIndex: 0,
        topCard: null
      };
    }

    const room = rooms[roomId];
    const playerId = socket.id;
    room.players.push(playerId);
    room.hands[playerId] = room.deck.splice(0, 7);

    if (!room.topCard) {
      let card;
      do {
        card = room.deck.pop();
      } while (card.color === 'Black');
      room.topCard = card;
    }

    io.to(roomId).emit('update-players', room.players);
    socket.emit('deal-hand', room.hands[playerId]);
    io.to(roomId).emit('top-card', room.topCard);

    if (room.players[room.currentPlayerIndex] === playerId) {
      socket.emit('your-turn');
    }
  });

  socket.on('play-card', ({ roomId, card }) => {
    const room = rooms[roomId];
    const playerId = socket.id;

    room.topCard = card;
    room.hands[playerId] = room.hands[playerId].filter(c => c.color !== card.color || c.value !== card.value);
    io.to(roomId).emit('top-card', card);

    room.currentPlayerIndex = getNextPlayerIndex(room.players, room.currentPlayerIndex);
    const nextPlayer = room.players[room.currentPlayerIndex];
    io.to(nextPlayer).emit('your-turn');
  });

  socket.on('draw-card', (roomId) => {
    const room = rooms[roomId];
    const playerId = socket.id;

    const drawnCard = room.deck.pop();
    room.hands[playerId].push(drawnCard);
    socket.emit('deal-hand', room.hands[playerId]);

    room.currentPlayerIndex = getNextPlayerIndex(room.players, room.currentPlayerIndex);
    const nextPlayer = room.players[room.currentPlayerIndex];
    io.to(nextPlayer).emit('your-turn');
  });
});

server.listen(3001, () => {
  console.log('🔥 UNO server running at http://localhost:3001');
});
