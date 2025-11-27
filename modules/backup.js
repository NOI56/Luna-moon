// modules/backup.js
// Backup system for Luna AI - Database and Memory files

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Backup configuration
const BACKUP_DIR = path.join(process.cwd(), 'backups');
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '10', 10); // Keep last 10 backups
const BACKUP_INTERVAL = parseInt(process.env.BACKUP_INTERVAL || '3600000', 10); // 1 hour default

// Files to backup
const FILES_TO_BACKUP = [
  { source: path.join(process.cwd(), 'tmp', 'luna.db'), name: 'luna.db' },
  { source: path.join(process.cwd(), 'tmp', 'luna_memory.json'), name: 'luna_memory.json' },
  { source: path.join(process.cwd(), 'tmp', 'luna_memory_log.jsonl'), name: 'luna_memory_log.jsonl' },
  { source: path.join(process.cwd(), 'tmp', 'personality.json'), name: 'personality.json', optional: true }
];

/**
 * Create backup directory if it doesn't exist
 */
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    log.info(`[backup] Created backup directory: ${BACKUP_DIR}`);
  }
}

/**
 * Get timestamp for backup filename
 */
function getBackupTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // YYYY-MM-DDTHH-MM-SS
}

/**
 * Create a backup
 * @returns {Promise<{success: boolean, backupPath?: string, error?: string}>}
 */
export async function createBackup() {
  try {
    ensureBackupDir();
    
    const timestamp = getBackupTimestamp();
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);
    
    // Create backup directory
    fs.mkdirSync(backupPath, { recursive: true });
    
    let backedUpFiles = 0;
    const errors = [];
    
    // Backup each file
    for (const file of FILES_TO_BACKUP) {
      try {
        if (!fs.existsSync(file.source)) {
          if (file.optional) {
            log.debug(`[backup] Skipping optional file: ${file.name}`);
            continue;
          } else {
            log.warn(`[backup] File not found: ${file.source}`);
            errors.push(`File not found: ${file.name}`);
            continue;
          }
        }
        
        const destPath = path.join(backupPath, file.name);
        fs.copyFileSync(file.source, destPath);
        backedUpFiles++;
        log.debug(`[backup] Backed up: ${file.name}`);
      } catch (error) {
        log.error(`[backup] Failed to backup ${file.name}:`, error);
        errors.push(`Failed to backup ${file.name}: ${error.message}`);
      }
    }
    
    // Create backup metadata
    const metadata = {
      timestamp: new Date().toISOString(),
      files: FILES_TO_BACKUP.map(f => f.name),
      backedUpFiles,
      errors: errors.length > 0 ? errors : undefined
    };
    
    fs.writeFileSync(
      path.join(backupPath, 'backup-metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    if (errors.length > 0) {
      log.warn(`[backup] Backup completed with ${errors.length} errors: ${backupPath}`);
      return {
        success: true,
        backupPath,
        errors,
        backedUpFiles
      };
    }
    
    log.info(`[backup] ✅ Backup created successfully: ${backupPath} (${backedUpFiles} files)`);
    
    // Cleanup old backups
    cleanupOldBackups();
    
    return {
      success: true,
      backupPath,
      backedUpFiles
    };
  } catch (error) {
    log.error('[backup] Failed to create backup:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * List all backups
 * @returns {Array<{path: string, timestamp: string, files: string[]}>}
 */
export function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return [];
    }
    
    const backups = [];
    const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('backup-')) {
        const backupPath = path.join(BACKUP_DIR, entry.name);
        const metadataPath = path.join(backupPath, 'backup-metadata.json');
        
        let metadata = null;
        if (fs.existsSync(metadataPath)) {
          try {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          } catch (e) {
            log.warn(`[backup] Failed to read metadata for ${entry.name}`);
          }
        }
        
        backups.push({
          path: backupPath,
          name: entry.name,
          timestamp: metadata?.timestamp || entry.name.replace('backup-', '').replace(/-/g, ':'),
          files: metadata?.files || [],
          backedUpFiles: metadata?.backedUpFiles || 0,
          errors: metadata?.errors
        });
      }
    }
    
    // Sort by timestamp (newest first)
    backups.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });
    
    return backups;
  } catch (error) {
    log.error('[backup] Failed to list backups:', error);
    return [];
  }
}

/**
 * Restore from backup
 * @param {string} backupName - Name of the backup directory
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function restoreBackup(backupName) {
  try {
    const backupPath = path.join(BACKUP_DIR, backupName);
    
    if (!fs.existsSync(backupPath)) {
      return {
        success: false,
        error: `Backup not found: ${backupName}`
      };
    }
    
    // Read metadata
    const metadataPath = path.join(backupPath, 'backup-metadata.json');
    let metadata = null;
    if (fs.existsSync(metadataPath)) {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    }
    
    let restoredFiles = 0;
    const errors = [];
    
    // Restore each file
    for (const file of FILES_TO_BACKUP) {
      try {
        const backupFile = path.join(backupPath, file.name);
        
        if (!fs.existsSync(backupFile)) {
          if (file.optional) {
            log.debug(`[backup] Skipping optional file: ${file.name}`);
            continue;
          } else {
            log.warn(`[backup] Backup file not found: ${file.name}`);
            errors.push(`Backup file not found: ${file.name}`);
            continue;
          }
        }
        
        // Ensure destination directory exists
        fs.mkdirSync(path.dirname(file.source), { recursive: true });
        
        // Copy file back
        fs.copyFileSync(backupFile, file.source);
        restoredFiles++;
        log.info(`[backup] Restored: ${file.name}`);
      } catch (error) {
        log.error(`[backup] Failed to restore ${file.name}:`, error);
        errors.push(`Failed to restore ${file.name}: ${error.message}`);
      }
    }
    
    if (errors.length > 0) {
      log.warn(`[backup] Restore completed with ${errors.length} errors`);
      return {
        success: true,
        restoredFiles,
        errors
      };
    }
    
    log.info(`[backup] ✅ Restore completed successfully (${restoredFiles} files)`);
    
    return {
      success: true,
      restoredFiles
    };
  } catch (error) {
    log.error('[backup] Failed to restore backup:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete old backups (keep only MAX_BACKUPS)
 */
function cleanupOldBackups() {
  try {
    const backups = listBackups();
    
    if (backups.length <= MAX_BACKUPS) {
      return;
    }
    
    // Delete oldest backups
    const toDelete = backups.slice(MAX_BACKUPS);
    
    for (const backup of toDelete) {
      try {
        fs.rmSync(backup.path, { recursive: true, force: true });
        log.info(`[backup] Deleted old backup: ${backup.name}`);
      } catch (error) {
        log.error(`[backup] Failed to delete backup ${backup.name}:`, error);
      }
    }
    
    log.info(`[backup] Cleaned up ${toDelete.length} old backup(s)`);
  } catch (error) {
    log.error('[backup] Failed to cleanup old backups:', error);
  }
}

/**
 * Get backup statistics
 * @returns {Object}
 */
export function getBackupStats() {
  const backups = listBackups();
  const totalSize = backups.reduce((size, backup) => {
    try {
      const stats = fs.statSync(backup.path);
      return size + (stats.isDirectory() ? getDirectorySize(backup.path) : stats.size);
    } catch {
      return size;
    }
  }, 0);
  
  return {
    totalBackups: backups.length,
    totalSize: totalSize,
    totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
    maxBackups: MAX_BACKUPS,
    oldestBackup: backups.length > 0 ? backups[backups.length - 1]?.timestamp : null,
    newestBackup: backups.length > 0 ? backups[0]?.timestamp : null
  };
}

/**
 * Calculate directory size recursively
 */
function getDirectorySize(dirPath) {
  let size = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        size += getDirectorySize(filePath);
      } else {
        size += stats.size;
      }
    }
  } catch {
    // Ignore errors
  }
  return size;
}

/**
 * Start automatic backup schedule
 */
export function startAutoBackup() {
  const enabled = process.env.AUTO_BACKUP_ENABLED !== 'false';
  
  if (!enabled) {
    log.info('[backup] Auto-backup is disabled');
    return;
  }
  
  log.info(`[backup] Starting auto-backup (interval: ${BACKUP_INTERVAL / 1000 / 60} minutes)`);
  
  // Create initial backup
  createBackup().catch(err => {
    log.error('[backup] Initial backup failed:', err);
  });
  
  // Schedule periodic backups
  setInterval(() => {
    createBackup().catch(err => {
      log.error('[backup] Scheduled backup failed:', err);
    });
  }, BACKUP_INTERVAL);
}

