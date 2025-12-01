// routes/chat.js
// Chat, Notification, and Referral Routes

import express from "express";
import fs from "fs";
import path from "path";
import { log } from "../modules/logger.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { saveGroupChatMessage, loadGroupChatMessages } from "../modules/db.js";
import { resolveLunaMint } from "../utils/mint.js";

/**
 * Setup Chat, Notification, and Referral routes
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Dependencies needed by routes
 */
export function setupChatRoutes(app, dependencies) {
  const {
    // WebSocket
    wss,
    clients, // Shared WebSocket clients Set from index.js
    
    // Chat System State
    chatRooms,
    messageReactions,
    messageTips,
    chatRewards,
    onlineUsers,
    chatLeaderboard,
    badgeCache,
    
    // Notification System State
    userNotifications,
    
    // Referral System State
    referralData,
    referralMap,
    
    // Helper Functions
    isValidWalletAddress,
    validateWalletAddress,
    
    // Constants
    CHAT_MESSAGE_LIMIT,
    CHAT_MESSAGE_EXPIRY,
    BADGE_CACHE_TTL,
    VIP_BADGES,
    MESSAGE_REWARD_CHANCE,
    MESSAGE_REWARD_MIN,
    MESSAGE_REWARD_MAX,
    FIRST_MESSAGE_BONUS,
    REFERRAL_REWARD_SIGNUP,
    REFERRAL_REWARD_FIRST_GAME,
    REFERRAL_REWARD_TOP10,
  } = dependencies;

  const chatUploadDir = path.join(process.cwd(), "public", "uploads", "chat");
  fs.mkdirSync(chatUploadDir, { recursive: true });
  const uploadParser = express.json({ limit: "8mb" });
  const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
  const ALLOWED_ATTACHMENT_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp"
  ]);
  const typingUsers = new Map(); // Map<roomId, Map<wallet, { username, timeout }>>
  const TYPING_TIMEOUT_MS = 5000;
  const groupChatBalanceCache = new Map();
  const GROUP_CHAT_BALANCE_TTL = 60 * 1000;

  // ----------------------
  // WebSocket Clients and Broadcast
  // ----------------------
  
  // Initialize WebSocket connection handling (clients is shared from index.js)
  wss.on('connection', (ws) => {
    clients.add(ws);
    log.info(`[websocket] Client connected. Total clients: ${clients.size}`);
    
    ws.on('message', (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        if (payload?.type === 'chat_typing') {
          const { roomId, wallet, username, isTyping } = payload;
          handleTypingEvent(roomId, wallet, username, !!isTyping);
        }
      } catch (error) {
        log.warn('[websocket] Failed to parse client message:', error.message);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      log.info(`[websocket] Client disconnected. Total clients: ${clients.size}`);
    });
    
    ws.on('error', (error) => {
      log.error('[websocket] Client error:', error);
      clients.delete(ws);
    });
  });
  
  /**
   * Broadcast message to all WebSocket clients
   */
  function broadcast(data) {
    const message = JSON.stringify(data);
    let sentCount = 0;
    let skippedCount = 0;
    
    clients.forEach((client) => {
      try {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(message);
          sentCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        log.error('[websocket] Broadcast error:', error);
        clients.delete(client);
      }
    });
    
    log.info(`[websocket] Broadcast ${data.type} to ${sentCount} clients (${skippedCount} skipped, ${clients.size} total)`);
  }

  function broadcastTypingState(roomId) {
    if (!roomId) return;
    const roomTyping = typingUsers.get(roomId);
    const users = roomTyping
      ? Array.from(roomTyping.values()).map(({ wallet, username }) => ({
          wallet,
          username
        }))
      : [];
    broadcast({
      type: 'chat_typing',
      roomId,
      users
    });
  }

  function handleTypingEvent(roomId, wallet, username, isTyping) {
    if (!roomId || !wallet) return;
    if (!typingUsers.has(roomId)) {
      typingUsers.set(roomId, new Map());
    }
    const roomTyping = typingUsers.get(roomId);
    const displayName = username && username.trim().length > 0
      ? username.trim()
      : `${wallet.substring(0, 4)}...${wallet.substring(wallet.length - 4)}`;

    if (!isTyping) {
      const existing = roomTyping.get(wallet);
      if (existing?.timeout) {
        clearTimeout(existing.timeout);
      }
      roomTyping.delete(wallet);
      if (roomTyping.size === 0) {
        typingUsers.delete(roomId);
      }
      broadcastTypingState(roomId);
      return;
    }

    const timeout = setTimeout(() => {
      const currentRoom = typingUsers.get(roomId);
      if (!currentRoom) {
        return;
      }
      currentRoom.delete(wallet);
      if (currentRoom.size === 0) {
        typingUsers.delete(roomId);
      }
      broadcastTypingState(roomId);
    }, TYPING_TIMEOUT_MS);

    const existing = roomTyping.get(wallet);
    if (existing?.timeout) {
      clearTimeout(existing.timeout);
    }

    roomTyping.set(wallet, {
      wallet,
      username: displayName,
      timeout
    });
    broadcastTypingState(roomId);
  }

  // ----------------------
  // Chat Helper Functions
  // ----------------------
  
  /**
   * Get or create a chat room
   */
  function getOrCreateChatRoom(roomId) {
    if (!chatRooms.has(roomId)) {
      chatRooms.set(roomId, {
        messages: [],
        participants: new Set(),
        createdAt: Date.now()
      });
    }
    return chatRooms.get(roomId);
  }

  function sanitizeAttachments(attachments = []) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return [];
    }
    return attachments
      .slice(0, 4)
      .map((attachment) => {
        if (!attachment || typeof attachment !== "object") {
          return null;
        }
        const url = typeof attachment.url === "string" ? attachment.url.trim() : "";
        if (!url.startsWith("/uploads/chat/")) {
          return null;
        }
        const mimeType = typeof attachment.mimeType === "string" ? attachment.mimeType : "application/octet-stream";
        const name = typeof attachment.name === "string" ? attachment.name.substring(0, 120) : "attachment";
        const size = Number(attachment.size) || 0;
        return { url, mimeType, name, size };
      })
      .filter(Boolean);
  }
  
  /**
   * Send a chat message
   */
  async function sendChatMessage(roomId, wallet, message, username, balance = null, attachments = []) {
    const room = getOrCreateChatRoom(roomId);
    const messageId = `${roomId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Get VIP badge
    const badge = await getVIPBadge(wallet);
    
    // Check for mentions
    const mentions = [];
    const mentionRegex = /@(\w+)/g;
    let match;
    while ((match = mentionRegex.exec(message)) !== null) {
      mentions.push(match[1]);
    }
    
    const chatMessage = {
      id: messageId,
      roomId: roomId,
      wallet: wallet,
      username: username || wallet.substring(0, 8) + '...',
      message: message,
      badge: badge,
      mentions: mentions,
      attachments,
      timestamp: Date.now()
    };
    
    // Add to room messages
    room.messages.push(chatMessage);
    
    // Limit messages
    if (room.messages.length > CHAT_MESSAGE_LIMIT) {
      room.messages.shift();
    }
    
    // Add participant
    room.participants.add(wallet);
    
    // Update online users
    onlineUsers.set(wallet, {
      ws: null, // Will be set by WebSocket connection
      lastSeen: Date.now(),
      roomId: roomId
    });
    
    // Update leaderboard
    const currentCount = chatLeaderboard.get(wallet) || 0;
    chatLeaderboard.set(wallet, currentCount + 1);
    
    // Save to database if group chat
    if (roomId === 'group_chat') {
      try {
        await saveGroupChatMessage(chatMessage);
      } catch (dbError) {
        log.error('[chat] Failed to save message to database:', dbError);
      }
    }
    
    // Broadcast message
    log.info(`[chat] Broadcasting message from ${wallet.substring(0, 8)}... in room ${roomId}`);
    broadcast({
      type: 'chat_message',
      roomId: roomId,
      message: chatMessage
    });
    
    return chatMessage;
  }
  
  /**
   * Get chat messages for a room
   */
  async function getChatMessages(roomId, limit = 50) {
    const room = getOrCreateChatRoom(roomId);
    
    // If group chat, try to load from database
    if (roomId === 'group_chat' && room.messages.length === 0) {
      try {
        const dbMessages = await loadGroupChatMessages(roomId, limit);
        room.messages = dbMessages;
      } catch (dbError) {
        log.error('[chat] Failed to load messages from database:', dbError);
      }
    }
    
    // Return last N messages
    return room.messages.slice(-limit);
  }
  
  /**
   * Get VIP badge for a wallet based on Luna balance
   */
  async function getVIPBadge(wallet) {
    // Check cache first
    if (badgeCache.has(wallet)) {
      const cached = badgeCache.get(wallet);
      if (Date.now() - cached.timestamp < BADGE_CACHE_TTL) {
        return cached.badge;
      }
    }
    
    try {
      // Get token mint address from env (with fallback)
      const mint = resolveLunaMint();
      if (!mint) {
        return null;
      }
      
      // Check balance
      const connection = new Connection(
        process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
        "confirmed"
      );
      
      let mintPublicKey;
      let walletPubKey;
      try {
        mintPublicKey = new PublicKey(mint);
        walletPubKey = new PublicKey(wallet);
      } catch (error) {
        return null;
      }
      
      // Get token accounts
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        walletPubKey,
        { mint: mintPublicKey }
      );
      
      let balance = 0;
      if (tokenAccounts.value && tokenAccounts.value.length > 0) {
        const tokenAccount = tokenAccounts.value[0];
        const tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;
        
        if (tokenAmount.uiAmountString) {
          balance = parseFloat(tokenAmount.uiAmountString);
        } else if (tokenAmount.uiAmount !== null && tokenAmount.uiAmount !== undefined) {
          balance = tokenAmount.uiAmount;
        } else {
          const rawAmount = tokenAmount.amount;
          const decimals = tokenAmount.decimals || 0;
          balance = parseFloat(rawAmount) / Math.pow(10, decimals);
        }
      }
      
      // Determine badge
      let badge = null;
      if (balance >= VIP_BADGES.LEGEND) {
        badge = '👑';
      } else if (balance >= VIP_BADGES.DIAMOND) {
        badge = '💎';
      } else if (balance >= VIP_BADGES.GOLD) {
        badge = '🥇';
      } else if (balance >= VIP_BADGES.SILVER) {
        badge = '🥈';
      } else if (balance >= VIP_BADGES.BRONZE) {
        badge = '🥉';
      }
      
      // Cache result
      badgeCache.set(wallet, {
        badge: badge,
        balance: balance,
        timestamp: Date.now()
      });
      
      return badge;
    } catch (error) {
      log.error('[chat] Failed to get VIP badge:', error);
      return null;
    }
  }

  // ----------------------
  // Notification Helper Functions
  // ----------------------
  
  /**
   * Send notification to a wallet (or broadcast if wallet is null)
   */
  function sendNotification(wallet, type, title, message, data = {}) {
    const notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: type,
      title: title,
      message: message,
      data: data,
      timestamp: Date.now(),
      read: false
    };
    
    if (wallet) {
      // Send to specific wallet
      if (!userNotifications.has(wallet)) {
        userNotifications.set(wallet, []);
      }
      userNotifications.get(wallet).push(notification);
      
      // Broadcast to WebSocket clients
      broadcast({
        type: 'notification',
        wallet: wallet,
        notification: notification
      });
    } else {
      // Broadcast to all
      broadcast({
        type: 'notification',
        notification: notification
      });
    }
  }
  
  /**
   * Get notifications for a wallet
   */
  function getNotifications(wallet, unreadOnly = false) {
    const notifications = userNotifications.get(wallet) || [];
    if (unreadOnly) {
      return notifications.filter(n => !n.read);
    }
    return notifications;
  }
  
  /**
   * Mark notification as read
   */
  function markNotificationRead(wallet, notificationId) {
    const notifications = userNotifications.get(wallet) || [];
    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      return true;
    }
    return false;
  }

  // ----------------------
  // Referral Helper Functions
  // ----------------------
  
  /**
   * Register a referral
   */
  function registerReferral(wallet, referrer) {
    // Cannot refer yourself
    if (wallet === referrer) {
      return false;
    }
    
    // Check if already referred
    if (referralMap.has(wallet)) {
      return false;
    }
    
    // Register referral
    referralMap.set(wallet, referrer);
    
    // Update referrer data
    if (!referralData.has(referrer)) {
      referralData.set(referrer, {
        referrals: new Set(),
        totalRewards: 0,
        stats: {
          signups: 0,
          firstGames: 0,
          top10s: 0
        }
      });
    }
    
    const referrerData = referralData.get(referrer);
    referrerData.referrals.add(wallet);
    referrerData.stats.signups++;
    referrerData.totalRewards += REFERRAL_REWARD_SIGNUP;
    
    return true;
  }
  
  /**
   * Get referral stats for a wallet
   */
  function getReferralStats(wallet) {
    const data = referralData.get(wallet) || {
      referrals: new Set(),
      totalRewards: 0,
      stats: {
        signups: 0,
        firstGames: 0,
        top10s: 0
      }
    };
    
    return {
      referrer: referralMap.get(wallet) || null,
      referrals: Array.from(data.referrals),
      referralCount: data.referrals.size,
      totalRewards: data.totalRewards,
      stats: data.stats
    };
  }
  
  /**
   * Get referral link for a wallet
   */
  function getReferralLink(wallet) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:8787';
    return `${baseUrl}?ref=${wallet}`;
  }

  // ----------------------
  // Chat Routes
  // ----------------------
  
  /**
   * Send chat message
   * POST /luna/chat/send
   * Body: { roomId: "room_id", wallet: "wallet_address", message: "message", username: "username" }
   */
  app.post("/luna/chat/send", async (req, res) => {
    try {
      const { roomId, wallet, message, username, attachments } = req.body || {};
      
      if (!roomId || typeof roomId !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Room ID is required",
        });
      }
      
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Wallet address is required",
        });
      }
      
      const textMessage = typeof message === "string" ? message : "";
      const trimmedMessage = textMessage.trim();
      const sanitizedAttachments = sanitizeAttachments(attachments);
      const hasText = trimmedMessage.length > 0;
      const hasAttachments = sanitizedAttachments.length > 0;
      
      if (!hasText && !hasAttachments) {
        return res.status(400).json({
          ok: false,
          error: "Message or attachment is required",
        });
      }
      
      if (hasText && trimmedMessage.length > 500) {
        return res.status(400).json({
          ok: false,
          error: "Message is too long (max 500 characters)",
        });
      }
      
      // Check balance for group chat (using dynamic requirement)
      if (roomId === 'group_chat') {
        const GROUP_CHAT_BASE_MIN_USD = 10; // Base requirement: 10 USD
        const GROUP_CHAT_MIN_USD_FLOOR = 5; // Floor: 5 USD
        const GROUP_CHAT_MIN_USD_CAP = 20; // Cap: 20 USD
        const DYNAMIC_CACHE_MS = 60000; // Cache for 60 seconds
        
        try {
          // Validate wallet address
          if (!isValidWalletAddress(wallet)) {
            return res.status(400).json({
              ok: false,
              error: "Invalid wallet address format",
            });
          }
          
          // Get token mint address from env (with fallback)
          const mint = resolveLunaMint();
          if (!mint) {
            return res.status(500).json({
              ok: false,
              error: "Token mint address not configured",
            });
          }
          
          // Get dynamic requirement for group chat (10 USD base, 5-20 USD range)
          // Note: We import the function from deposit.js since it handles dynamic pricing
          let minRequirement = 100000; // Fallback: ~10 USD at default price
          try {
            // Import dynamic requirement function from deposit routes
            const { getDynamicRequirement } = await import('./deposit.js');
            // Note: getDynamicRequirement is not exported, so we use the API endpoint instead
            const baseUrl = req.protocol + '://' + req.get('host');
            const dynamicReqResponse = await fetch(`${baseUrl}/luna/dynamic-requirement?context=group-chat`);
            if (dynamicReqResponse.ok) {
              const dynamicReqData = await dynamicReqResponse.json();
              if (dynamicReqData.ok && dynamicReqData.amount) {
                minRequirement = Math.round(dynamicReqData.amount);
              }
            }
          } catch (dynamicReqError) {
            log.warn('[chat] Failed to get dynamic requirement, using fallback:', dynamicReqError);
            // Keep fallback value
          }
          
          const now = Date.now();
          const cachedEntry = groupChatBalanceCache.get(wallet);
          if (
            cachedEntry &&
            now - cachedEntry.timestamp < GROUP_CHAT_BALANCE_TTL
          ) {
            if (cachedEntry.balance < minRequirement) {
              return res.status(403).json({
                ok: false,
                error: `Insufficient balance. You need at least ${Math.round(minRequirement).toLocaleString()} Luna tokens to send messages in group chat.`,
                balance: cachedEntry.balance,
                minRequired: minRequirement,
                cached: true
              });
            }

            const chatMessage = await sendChatMessage(
              roomId,
              wallet,
              hasText ? trimmedMessage : '',
              username,
              cachedEntry.balance,
              sanitizedAttachments
            );
            
            return res.json({
              ok: true,
              message: chatMessage,
              cached: true
            });
          }

          // Check balance
          const connection = new Connection(
            process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
            "confirmed"
          );
          
          let mintPublicKey;
          let walletPubKey;
          try {
            mintPublicKey = new PublicKey(mint);
            walletPubKey = new PublicKey(wallet);
          } catch (error) {
            return res.status(400).json({
              ok: false,
              error: "Invalid wallet or mint address format",
            });
          }
          
          // Get token accounts
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            walletPubKey,
            { mint: mintPublicKey }
          );
          
          let balance = 0;
          if (tokenAccounts.value && tokenAccounts.value.length > 0) {
            const tokenAccount = tokenAccounts.value[0];
            const tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;
            
            // Use uiAmountString for accurate balance, or calculate from amount and decimals
            if (tokenAmount.uiAmountString) {
              balance = parseFloat(tokenAmount.uiAmountString);
            } else if (tokenAmount.uiAmount !== null && tokenAmount.uiAmount !== undefined) {
              balance = tokenAmount.uiAmount;
            } else {
              // Calculate from raw amount and decimals
              const rawAmount = tokenAmount.amount;
              const decimals = tokenAmount.decimals || 0;
              balance = parseFloat(rawAmount) / Math.pow(10, decimals);
            }
            
            // Don't round to integer - keep decimal precision for accurate display
            // Only round if balance is very large (to avoid floating point issues)
            if (balance >= 1000000) {
              balance = Math.round(balance);
            } else {
              balance = Math.round(balance * 100) / 100; // Round to 2 decimal places
            }
          }
          
          // Check if balance meets requirement
          if (balance < minRequirement) {
            return res.status(403).json({
              ok: false,
              error: `Insufficient balance. You need at least ${Math.round(minRequirement).toLocaleString()} Luna tokens to send messages in group chat. Current balance: ${balance.toLocaleString()} Luna`,
              balance: balance,
              minRequired: minRequirement,
            });
          }
          
          log.info(`[group_chat] ${wallet.substring(0, 8)}... sent message (balance: ${balance} Luna)`);
          groupChatBalanceCache.set(wallet, { balance, timestamp: Date.now() });
          
          // Pass balance to sendChatMessage to avoid duplicate RPC call
          const chatMessage = await sendChatMessage(
            roomId,
            wallet,
            hasText ? trimmedMessage : '',
            username,
            balance,
            sanitizedAttachments
          );
          
          return res.json({
            ok: true,
            message: chatMessage
          });
        } catch (balanceError) {
          log.error("[group_chat] Balance check error:", balanceError);
          const cachedEntry = groupChatBalanceCache.get(wallet);
          if (cachedEntry) {
            const cacheAge = Date.now() - cachedEntry.timestamp;
            if (cacheAge < GROUP_CHAT_BALANCE_TTL * 5) {
              log.warn(`[group_chat] Using cached balance for ${wallet.substring(0,8)}... due to RPC error`);
              if (cachedEntry.balance < minRequirement) {
                return res.status(403).json({
                  ok: false,
                  error: `Insufficient balance. You need at least ${Math.round(minRequirement).toLocaleString()} Luna tokens to send messages in group chat.`,
                  balance: cachedEntry.balance,
                  minRequired: minRequirement,
                  cached: true
                });
              }
              const chatMessage = await sendChatMessage(
                roomId,
                wallet,
                hasText ? trimmedMessage : '',
                username,
                cachedEntry.balance,
                sanitizedAttachments
              );
              
              return res.json({
                ok: true,
                message: chatMessage,
                cached: true,
                warning: "RPC rate limited - using cached balance"
              });
            }
          }
          return res.status(500).json({
            ok: false,
            error: "Failed to verify balance. Please try again later.",
          });
        }
      }
      
      // For non-group-chat rooms, send message without balance check
      const chatMessage = await sendChatMessage(
        roomId,
        wallet,
        hasText ? trimmedMessage : '',
        username,
        null,
        sanitizedAttachments
      );
      
      return res.json({
        ok: true,
        message: chatMessage
      });
    } catch (e) {
      log.error("[chat] Send message error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to send chat message",
      });
    }
  });

  /**
   * Upload chat attachment
   * POST /luna/chat/upload
   * Body: { roomId, wallet, fileName, mimeType, data }
   */
  app.post("/luna/chat/upload", uploadParser, async (req, res) => {
    try {
      const { roomId, wallet, fileName, mimeType, data } = req.body || {};

      if (roomId !== 'group_chat') {
        return res.status(400).json({ ok: false, error: "Invalid room" });
      }

      if (!wallet || typeof wallet !== "string" || !isValidWalletAddress(wallet)) {
        return res.status(400).json({ ok: false, error: "Valid wallet is required" });
      }

      if (!fileName || !mimeType || !data) {
        return res.status(400).json({ ok: false, error: "Invalid upload payload" });
      }

      const normalizedMime = typeof mimeType === "string" ? mimeType.toLowerCase() : "";

      if (!ALLOWED_ATTACHMENT_TYPES.has(normalizedMime)) {
        return res.status(400).json({ ok: false, error: "Unsupported file type" });
      }

      const base64Payload = typeof data === "string" ? data.split(',').pop() : "";
      if (!base64Payload) {
        return res.status(400).json({ ok: false, error: "Invalid file data" });
      }

      const buffer = Buffer.from(base64Payload, "base64");
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ ok: false, error: "Empty file data" });
      }

      if (buffer.length > MAX_ATTACHMENT_BYTES) {
        return res.status(400).json({
          ok: false,
          error: `File too large. Max ${(MAX_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(1)} MB`
        });
      }

      const safeExtension = normalizedMime.split("/").pop().replace(/[^a-z0-9]/g, "") || "bin";
      const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "").substring(0, 100) || `attachment.${safeExtension}`;
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${sanitizedName}`;
      const filePath = path.join(chatUploadDir, uniqueName);

      await fs.promises.writeFile(filePath, buffer);

      return res.json({
        ok: true,
        url: `/uploads/chat/${uniqueName}`,
        mimeType: normalizedMime,
        size: buffer.length,
        name: sanitizedName
      });
    } catch (error) {
      log.error("[chat] Upload error:", error);
      return res.status(500).json({
        ok: false,
        error: "Failed to upload attachment"
      });
    }
  });

  /**
   * Get chat messages
   * GET /luna/chat/messages?roomId=room_id&limit=50&search=keyword&wallet=wallet
   */
  app.get("/luna/chat/messages", async (req, res) => {
    try {
      const { roomId, limit, search, wallet } = req.query || {};
      
      if (!roomId || typeof roomId !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Room ID is required",
        });
      }
      
      const messageLimit = parseInt(limit || "50", 10);
      let messages = await getChatMessages(roomId, messageLimit);
      
      // Filter by search keyword
      if (search && typeof search === "string" && search.trim().length > 0) {
        const searchLower = search.toLowerCase();
        messages = messages.filter(msg => 
          msg.message.toLowerCase().includes(searchLower) ||
          msg.username.toLowerCase().includes(searchLower)
        );
      }
      
      // Filter by wallet
      if (wallet && typeof wallet !== "string") {
        messages = messages.filter(msg => msg.wallet === wallet);
      }
      
      // Add reactions and tips to messages
      messages = messages.map(msg => {
        const reactions = messageReactions.get(msg.id);
        const tips = messageTips.get(msg.id) || [];
        return {
          ...msg,
          reactions: reactions ? Object.fromEntries(
            Array.from(reactions.entries()).map(([type, wallets]) => [type, wallets.size])
          ) : {},
          tips: tips.map(t => ({ wallet: t.wallet, amount: t.amount, timestamp: t.timestamp }))
        };
      });
      
      return res.json({
        ok: true,
        messages: messages,
        roomId: roomId
      });
    } catch (e) {
      log.error("[chat] Get messages error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to get chat messages",
      });
    }
  });

  /**
   * Add reaction to message
   * POST /luna/chat/reaction
   * Body: { messageId, wallet, reactionType }
   */
  app.post("/luna/chat/reaction", async (req, res) => {
    try {
      const { messageId, wallet, reactionType } = req.body || {};
      
      if (!messageId || typeof messageId !== "string") {
        return res.status(400).json({ ok: false, error: "Message ID is required" });
      }
      
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({ ok: false, error: "Wallet is required" });
      }
      
      if (!reactionType || typeof reactionType !== "string") {
        return res.status(400).json({ ok: false, error: "Reaction type is required" });
      }
      
      const validReactions = ['👍', '❤️', '🎉', '🔥', '💬'];
      if (!validReactions.includes(reactionType)) {
        return res.status(400).json({ ok: false, error: "Invalid reaction type" });
      }
      
      if (!messageReactions.has(messageId)) {
        messageReactions.set(messageId, new Map());
      }
      
      const reactions = messageReactions.get(messageId);
      if (!reactions.has(reactionType)) {
        reactions.set(reactionType, new Set());
      }
      
      const reactionSet = reactions.get(reactionType);
      
      // Toggle reaction
      if (reactionSet.has(wallet)) {
        reactionSet.delete(wallet);
      } else {
        reactionSet.add(wallet);
      }
      
      // Broadcast reaction update
      broadcast({
        type: 'chat_reaction',
        messageId: messageId,
        reactionType: reactionType,
        wallet: wallet,
        count: reactionSet.size,
        active: reactionSet.has(wallet)
      });
      
      return res.json({
        ok: true,
        reactionType: reactionType,
        count: reactionSet.size,
        active: reactionSet.has(wallet)
      });
    } catch (e) {
      log.error("[chat] Reaction error:", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * Tip a message
   * POST /luna/chat/tip
   * Body: { messageId, fromWallet, toWallet, amount }
   */
  app.post("/luna/chat/tip", async (req, res) => {
    try {
      const { messageId, fromWallet, toWallet, amount } = req.body || {};
      
      if (!messageId || typeof messageId !== "string") {
        return res.status(400).json({ ok: false, error: "Message ID is required" });
      }
      
      if (!fromWallet || !toWallet || typeof fromWallet !== "string" || typeof toWallet !== "string") {
        return res.status(400).json({ ok: false, error: "Wallet addresses are required" });
      }
      
      if (fromWallet === toWallet) {
        return res.status(400).json({ ok: false, error: "Cannot tip yourself" });
      }
      
      const tipAmount = parseInt(amount, 10);
      if (!tipAmount || tipAmount <= 0) {
        return res.status(400).json({ ok: false, error: "Invalid tip amount" });
      }
      
      // Note: In production, this would trigger an actual Solana transaction
      // For now, we just record it
      if (!messageTips.has(messageId)) {
        messageTips.set(messageId, []);
      }
      
      const tips = messageTips.get(messageId);
      tips.push({
        wallet: fromWallet,
        amount: tipAmount,
        timestamp: Date.now()
      });
      
      // Send notification to recipient
      sendNotification(toWallet, 'chat_tip', '💰 You received a tip!', 
        `You received ${tipAmount.toLocaleString()} Luna tip`,
        { messageId, fromWallet, amount: tipAmount });
      
      // Broadcast tip
      broadcast({
        type: 'chat_tip',
        messageId: messageId,
        fromWallet: fromWallet,
        toWallet: toWallet,
        amount: tipAmount
      });
      
      return res.json({
        ok: true,
        message: "Tip recorded (Note: Actual transfer would happen via Solana transaction)"
      });
    } catch (e) {
      log.error("[chat] Tip error:", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * Get online users count
   * GET /luna/chat/online?roomId=room_id
   */
  app.get("/luna/chat/online", async (req, res) => {
    try {
      const { roomId } = req.query || {};
      
      // Count users in the room
      let count = 0;
      if (roomId) {
        const room = chatRooms.get(roomId);
        if (room) {
          count = room.participants.size;
        }
      } else {
        // Count all online users
        count = onlineUsers.size;
      }
      
      return res.json({
        ok: true,
        count: count,
        roomId: roomId || 'all'
      });
    } catch (e) {
      log.error("[chat] Online count error:", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * Get chat leaderboard
   * GET /luna/chat/leaderboard?type=daily|weekly|alltime
   */
  app.get("/luna/chat/leaderboard", async (req, res) => {
    try {
      const { type = 'daily' } = req.query || {};
      
      // Convert Map to Array and sort
      const leaderboard = Array.from(chatLeaderboard.entries())
        .map(([wallet, count]) => ({
          wallet: wallet,
          username: wallet.substring(0, 8) + '...',
          messageCount: count
        }))
        .sort((a, b) => b.messageCount - a.messageCount)
        .slice(0, 10); // Top 10
      
      return res.json({
        ok: true,
        type: type,
        leaderboard: leaderboard
      });
    } catch (e) {
      log.error("[chat] Leaderboard error:", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /**
   * Get user chat stats
   * GET /luna/chat/stats?wallet=wallet_address
   */
  app.get("/luna/chat/stats", async (req, res) => {
    try {
      const { wallet } = req.query || {};
      
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({ ok: false, error: "Wallet is required" });
      }
      
      const messageCount = chatLeaderboard.get(wallet) || 0;
      const badge = await getVIPBadge(wallet);
      
      return res.json({
        ok: true,
        wallet: wallet,
        messageCount: messageCount,
        badge: badge
      });
    } catch (e) {
      log.error("[chat] Stats error:", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ----------------------
  // Notification Routes
  // ----------------------
  
  /**
   * Get notifications for a wallet
   * GET /luna/notifications?wallet=wallet_address&unreadOnly=true
   */
  app.get("/luna/notifications", async (req, res) => {
    try {
      const { wallet, unreadOnly } = req.query || {};
      
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Wallet address is required",
        });
      }
      
      const notifications = getNotifications(wallet, unreadOnly === 'true');
      const unreadCount = notifications.filter(n => !n.read).length;
      
      return res.json({
        ok: true,
        notifications: notifications.reverse(), // Most recent first
        unreadCount: unreadCount,
        total: notifications.length
      });
    } catch (e) {
      log.error("[notifications] Get notifications error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to get notifications",
      });
    }
  });

  /**
   * Mark notification as read
   * POST /luna/notifications/read
   * Body: { wallet: "wallet_address", notificationId: "notification_id" }
   */
  app.post("/luna/notifications/read", async (req, res) => {
    try {
      const { wallet, notificationId } = req.body || {};
      
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Wallet address is required",
        });
      }
      
      if (!notificationId || typeof notificationId !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Notification ID is required",
        });
      }
      
      const success = markNotificationRead(wallet, notificationId);
      
      return res.json({
        ok: success,
        message: success ? "Notification marked as read" : "Notification not found"
      });
    } catch (e) {
      log.error("[notifications] Mark read error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to mark notification as read",
      });
    }
  });

  /**
   * Test notification system
   * POST /luna/notifications/test
   * Body: { wallet: "wallet_address" (optional), type: "test_type" (optional) }
   */
  app.post("/luna/notifications/test", async (req, res) => {
    try {
      const { wallet, type } = req.body || {};
      
      const testTypes = {
        'match_found': {
          title: '🎮 Match Found!',
          message: 'You have been matched with an opponent. Game starting soon!',
          data: { matchId: 'test_match_' + Date.now(), opponent: 'TestOpponent123...' }
        },
        'room_new': {
          title: '🏠 New Betting Room!',
          message: 'A new betting room has been created with bet amount: 10,000 Luna tokens',
          data: { roomId: 'test_room_' + Date.now(), betAmount: 10000 }
        },
        'reward_time': {
          title: '💰 Reward Distribution Soon!',
          message: 'Weekly competition ends in 1 hour. Make sure you are in top 5!',
          data: { timeRemaining: 3600 }
        },
        'reward_received': {
          title: '🎁 Reward Received!',
          message: 'You received 0.5 SOL as reward for being in top 5!',
          data: { amount: 0.5, rank: 3 }
        },
        'referral_reward': {
          title: '👥 Referral Reward!',
          message: 'You earned 0.1 SOL from your referral!',
          data: { amount: 0.1, referredWallet: 'RefWallet123...' }
        },
        'default': {
          title: '🔔 Test Notification',
          message: 'This is a test notification to verify the notification system is working correctly!',
          data: { test: true }
        }
      };
      
      const notificationType = type && testTypes[type] ? type : 'default';
      const notificationData = testTypes[notificationType];
      
      // Send notification
      sendNotification(wallet || null, notificationType, notificationData.title, notificationData.message, notificationData.data);
      
      return res.json({
        ok: true,
        message: `Test notification sent${wallet ? ` to ${wallet.substring(0, 8)}...` : ' (broadcast to all)'}`,
        notification: {
          type: notificationType,
          title: notificationData.title,
          message: notificationData.message,
          data: notificationData.data
        },
        availableTypes: Object.keys(testTypes).filter(t => t !== 'default')
      });
    } catch (e) {
      log.error("[notifications] Test notification error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to send test notification",
      });
    }
  });

  // ----------------------
  // Referral Routes
  // ----------------------
  
  /**
   * Register referral
   * POST /luna/referral/register
   * Body: { wallet: "wallet_address", referrer: "referrer_wallet_address" }
   */
  app.post("/luna/referral/register", async (req, res) => {
    try {
      const { wallet, referrer } = req.body || {};
      
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Wallet address is required",
        });
      }
      
      if (!referrer || typeof referrer !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Referrer wallet address is required",
        });
      }
      
      // Security: Validate wallet addresses
      try {
        validateWalletAddress(wallet, 'wallet');
        validateWalletAddress(referrer, 'referrer');
      } catch (e) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: e.message || "Invalid wallet address format",
        });
      }
      
      const success = registerReferral(wallet, referrer);
      
      if (success) {
        return res.json({
          ok: true,
          message: "Referral registered successfully"
        });
      } else {
        return res.status(400).json({
          ok: false,
          error: "Invalid referral",
          message: "Wallet already referred or cannot refer yourself"
        });
      }
    } catch (e) {
      log.error("[referral] Register error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to register referral",
      });
    }
  });

  /**
   * Get referral stats
   * GET /luna/referral/stats?wallet=wallet_address
   */
  app.get("/luna/referral/stats", async (req, res) => {
    try {
      const { wallet } = req.query || {};
      
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Wallet address is required",
        });
      }
      
      const stats = getReferralStats(wallet);
      
      return res.json({
        ok: true,
        stats: stats
      });
    } catch (e) {
      log.error("[referral] Get stats error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to get referral stats",
      });
    }
  });

  /**
   * Get referral link
   * GET /luna/referral/link?wallet=wallet_address
   */
  app.get("/luna/referral/link", async (req, res) => {
    try {
      const { wallet } = req.query || {};
      
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Wallet address is required",
        });
      }
      
      const link = getReferralLink(wallet);
      
      return res.json({
        ok: true,
        referralLink: link,
        wallet: wallet
      });
    } catch (e) {
      log.error("[referral] Get link error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to get referral link",
      });
    }
  });
}

