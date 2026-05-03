/**
 * Socket.IO singleton
 * Initialised once from server.js, then imported wherever needed.
 */

let io = null;

module.exports = {
  /** Called once from server.js to bind Socket.IO to the HTTP server */
  init(httpServer) {
    const { Server } = require('socket.io');
    io = new Server(httpServer, {
      cors: { origin: '*' },
    });

    io.on('connection', (socket) => {
      // Shop owners join a room named after their userId so we can
      // target notifications to the correct shop owner.
      socket.on('join-shop', (shopOwnerId) => {
        if (shopOwnerId) {
          socket.join(`shop:${shopOwnerId}`);
        }
      });
    });

    return io;
  },

  /** Returns the live io instance (null until init is called) */
  getIO() {
    return io;
  },
};
