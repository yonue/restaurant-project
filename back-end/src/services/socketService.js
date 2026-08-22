const EventEmitter = require('events');

let socketIo = null;
try {
  socketIo = require('socket.io');
} catch (error) {
  socketIo = null;
}

const fallbackHub = new EventEmitter();
let ioInstance = null;
const sseClients = new Set();

function initSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(': connected\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
}

function initSocket(server) {
  if (!socketIo) {
    ioInstance = fallbackHub;
    return ioInstance;
  }

  ioInstance = socketIo(server, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
  });

  ioInstance.on('connection', (socket) => {
    socket.on('join', (room) => {
      if (room) {
        socket.join(room);
      }
    });

    socket.on('disconnect', () => {});
  });

  return ioInstance;
}

function emitToRoom(room, event, payload) {
  if (!ioInstance) {
    fallbackHub.emit(`${room}:${event}`, payload);
    return;
  }

  if (typeof ioInstance.to === 'function') {
    ioInstance.to(room).emit(event, payload);
    return;
  }

  ioInstance.emit(`${room}:${event}`, payload);
}

function emitGlobal(event, payload) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload || {})}\n\n`;
  for (const client of sseClients) {
    try { client.write(message); } catch (error) { sseClients.delete(client); }
  }
  if (!ioInstance) {
    fallbackHub.emit(event, payload);
    return;
  }

  ioInstance.emit(event, payload);
}

module.exports = {
  initSocket,
  initSse,
  emitToRoom,
  emitGlobal,
};
