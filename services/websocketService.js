// services/websocketService.js
// WebSocket broadcast service

import { log } from "../modules/logger.js";

/**
 * Broadcast message to all connected WebSocket clients
 * @param {Set} clients - Set of WebSocket clients
 * @param {Object} data - Data to broadcast
 */
export function broadcast(clients, data) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    try {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    } catch (error) {
      log.error('[websocket] Broadcast error:', error);
      clients.delete(client);
    }
  });
}











