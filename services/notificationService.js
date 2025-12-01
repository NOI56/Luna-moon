// services/notificationService.js
// Notification service

import { broadcast } from "./websocketService.js";

/**
 * Send notification to a wallet or broadcast to all
 * @param {Map} userNotifications - Map of user notifications
 * @param {Set} clients - Set of WebSocket clients
 * @param {string|null} wallet - Wallet address (null for broadcast)
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data
 */
export function sendNotification(userNotifications, clients, wallet, type, title, message, data = {}) {
  // If wallet is null, broadcast to all clients
  if (!wallet) {
    broadcast(clients, {
      type: 'notification',
      notification: {
        type,
        title,
        message,
        data,
        timestamp: Date.now()
      }
    });
    return;
  }
  
  // Send to specific wallet if they're connected
  const notification = {
    type,
    title,
    message,
    data,
    wallet,
    timestamp: Date.now()
  };
  
  // Store notification for the wallet
  if (!userNotifications.has(wallet)) {
    userNotifications.set(wallet, []);
  }
  userNotifications.get(wallet).push(notification);
  
  // Keep only last 100 notifications per wallet
  const notifications = userNotifications.get(wallet);
  if (notifications.length > 100) {
    notifications.shift();
  }
  
  // Broadcast to all clients (they'll filter on client side)
  broadcast(clients, {
    type: 'notification',
    notification: notification
  });
}











