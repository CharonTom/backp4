const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// URL de ton frontend sur Vercel et localhost pour le développement
const FRONTEND_URL_VERCEL = "https://front4p.vercel.app"; // URL du frontend sur Vercel
const FRONTEND_URL_LOCAL = "http://localhost:3000"; // URL de localhost pour le développement local

// Configuration CORS pour Socket.IO
const io = new Server(server, {
  cors: {
    origin: [FRONTEND_URL_VERCEL, FRONTEND_URL_LOCAL], // Autoriser plusieurs origines
    methods: ["GET", "POST"],
  },
});

// Configuration CORS pour Express (API REST)
app.use(
  cors({
    origin: [FRONTEND_URL_VERCEL, FRONTEND_URL_LOCAL], // Autoriser les requêtes depuis Vercel et localhost
    methods: ["GET", "POST"],
    credentials: true, // Si tu utilises des cookies ou des informations d'authentification
  })
);

app.use(express.json());

const PORT = process.env.PORT || 3001;

app.get("/", (req, res) => {
  res.send("Serveur WebSocket avec Express est actif !");
});

const games = {};

// Fonction pour vérifier la victoire
function checkWin(grid, player) {
  const directions = [
    { row: 0, col: 1 }, // Horizontale
    { row: 1, col: 0 }, // Verticale
    { row: 1, col: 1 }, // Diagonale descendante
    { row: 1, col: -1 }, // Diagonale montante
  ];

  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (grid[row][col] === player) {
        for (let { row: dRow, col: dCol } of directions) {
          const winningPositions = checkDirection(
            grid,
            row,
            col,
            dRow,
            dCol,
            player
          );
          if (winningPositions) {
            return winningPositions;
          }
        }
      }
    }
  }
  return null;
}

// Vérifie les directions (horizontal, vertical, diagonal)
function checkDirection(grid, row, col, dRow, dCol, player) {
  let count = 0;
  const positions = [];

  for (let i = 0; i < 4; i++) {
    const newRow = row + i * dRow;
    const newCol = col + i * dCol;

    if (
      newRow >= 0 &&
      newRow < grid.length &&
      newCol >= 0 &&
      newCol < grid[0].length &&
      grid[newRow][newCol] === player
    ) {
      count++;
      positions.push([newRow, newCol]);
    } else {
      break;
    }
  }

  return count === 4 ? positions : null;
}

// Gestion des événements Socket.IO
io.on("connection", (socket) => {
  console.log("Un joueur s'est connecté:", socket.id);

  socket.on("join_game", (gameId) => {
    socket.join(gameId);
    console.log(`Le joueur ${socket.id} a rejoint la partie ${gameId}`);

    if (!games[gameId]) {
      games[gameId] = {
        players: [socket.id],
        grid: Array(6)
          .fill()
          .map(() => Array(7).fill(null)),
        currentPlayer: "P1",
        chat: [],
      };
    } else {
      games[gameId].players.push(socket.id);
    }

    io.to(gameId).emit("update_game", games[gameId]);
  });

  socket.on("play_move", ({ gameId, colIndex }) => {
    const game = games[gameId];
    if (!game) return;

    const { grid, currentPlayer } = game;

    // Trouve la première ligne libre dans la colonne
    let rowIndex = -1;
    for (let row = 5; row >= 0; row--) {
      if (!grid[row][colIndex]) {
        grid[row][colIndex] = currentPlayer;
        rowIndex = row;
        break;
      }
    }

    if (rowIndex === -1) return;

    // Vérifie la victoire
    const winningPositions = checkWin(grid, currentPlayer);
    if (winningPositions) {
      game.winner = currentPlayer;
      game.winningPositions = winningPositions;
    } else {
      game.currentPlayer = currentPlayer === "P1" ? "P2" : "P1";
    }

    io.to(gameId).emit("update_game", game);
  });

  socket.on("send_message", ({ gameId, message, player }) => {
    const game = games[gameId];
    if (!game) return;

    const newMessage = { player, message };
    game.chat.push(newMessage);
    io.to(gameId).emit("receive_message", newMessage);
  });

  socket.on("disconnect", () => {
    console.log("Un joueur s'est déconnecté:", socket.id);

    for (const gameId in games) {
      const game = games[gameId];
      game.players = game.players.filter((player) => player !== socket.id);

      if (game.players.length === 0) {
        delete games[gameId];
        console.log(`La partie ${gameId} a été supprimée.`);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
