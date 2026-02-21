/**
 * socketHub.ts
 *
 * Singleton socket.io server instance.
 * Routes call `emitToUser(userId, event, data)` to push real-time events
 * to a specific connected user without knowing the socket internals.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import logger from './logger';

let io: SocketIOServer | null = null;

// userId → Set of socket IDs (a user may have multiple browser tabs open)
const userSockets = new Map<number, Set<string>>();

interface AuthPayload {
  userId: number;
  username: string;
}

/**
 * Attach socket.io to the HTTP server.
 * Call once during server startup.
 */
export function initSocketHub(httpServer: HTTPServer, allowedOrigins: string[]): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    path: '/api/socket.io',
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  const jwtSecret = process.env.JWT_SECRET;

  io.use((socket: Socket, next) => {
    // Authenticate via JWT token sent in handshake auth
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = jwt.verify(token, jwtSecret as string) as AuthPayload;
      (socket as any).userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId: number = (socket as any).userId;

    // Register socket
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);
    logger.debug(`[Socket] User ${userId} connected (${socket.id}). Active sockets: ${userSockets.get(userId)!.size}`);

    socket.on('disconnect', () => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
        }
      }
      logger.debug(`[Socket] User ${userId} disconnected (${socket.id})`);
    });
  });

  logger.info('[Socket] socket.io server initialised on path /api/socket.io');
  return io;
}

/**
 * Emit an event to all sockets belonging to a specific user.
 * Safe to call even if the user is not connected (no-op).
 */
export function emitToUser(userId: number, event: string, data: unknown): void {
  if (!io) return;
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return;

  sockets.forEach(socketId => {
    io!.to(socketId).emit(event, data);
  });
}

/**
 * Returns whether socket.io has been initialised.
 */
export function isSocketHubReady(): boolean {
  return io !== null;
}
