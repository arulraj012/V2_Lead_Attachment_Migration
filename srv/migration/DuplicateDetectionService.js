/**
 * DuplicateDetectionService - Multi-level duplicate detection for attachment migration
 * 
 * Prevents re-migration of already migrated attachments by checking:
 * 1. Local audit log by V1 attachment ID (fast, no API call)
 * 2. Local audit log by parent + filename
 * 3. Content hash comparison (optional)
 * 4. V2 API check (fallback safety net)
 * 
 * NOTE: Parent objects (Leads, etc.) are migrated via DTT - no mapping needed.
 */
const cds = require('@sap/cds');
const crypto = require('crypto');

class DuplicateDetectionService {
    constructor() {
        this.db = null;
        this.entities = {};
    }

    async init() {
        if (!this.db) {
            this.db = await cds.connect.to('db');
            this.entities = {
                ObjectAuditLog: this.db.entities('migration').ObjectAuditLog,
                ParentMigrationStatus: this.db.entities('migration').ParentMigrationStatus
            };
        }
    }

    /**
     * Check if an object was already migrated (by V1 Object ID)
     * @param {string} objectType - e.g., 'LEAD_ATTACHMENT'
     * @param {string} v1ObjectID - V1 object identifier
     */
    async isAlreadyMigrated(objectType, v1ObjectID) {
        await this.init();
        const existing = await SELECT.one
            .from(this.entities.ObjectAuditLog)
            .where({ objectType, v1ObjectID });
        
        return existing 
            ? { migrated: true, v2ObjectID: existing.v2ObjectID, migratedAt: existing.createdAt, runId: existing.runId }
            : { migrated: false };
    }

    /**
     * Check by parent displayId + filename
     * Since DTT preserves displayId, we use parentDisplayId (not parentV1ObjectID)
     */
    async isAttachmentMigratedByName(objectType, parentDisplayId, fileName) {
        await this.init();
        const existing = await SELECT.one
            .from(this.entities.ObjectAuditLog)
            .where({ objectType, parentDisplayId, fileName });
        
        return existing 
            ? { migrated: true, v2ObjectID: existing.v2ObjectID, migratedAt: existing.createdAt }
            : { migrated: false };
    }

    /**
     * Check by content hash (most accurate)
     * @param {string} parentDisplayId - Optional parent displayId for scoped check
     */
    async isContentAlreadyMigrated(objectType, contentHash, parentDisplayId = null) {
        await this.init();
        const where = { objectType, contentHash };
        if (parentDisplayId) where.parentDisplayId = parentDisplayId;
        
        const existing = await SELECT.one.from(this.entities.ObjectAuditLog).where(where);
        return existing 
            ? { migrated: true, v2ObjectID: existing.v2ObjectID, existingFileName: existing.fileName }
            : { migrated: false };
    }

    /** Compute SHA256 hash */
    computeContentHash(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Multi-level duplicate check - combines all detection methods
     * 
     * @param {Object} options
     * @param {string} options.objectType - e.g., 'LEAD_ATTACHMENT'
     * @param {string} options.v1ObjectID - V1 attachment ObjectID
     * @param {string} options.parentDisplayId - Parent displayId (Lead.ID, same in V1 & V2)
     * @param {string} options.fileName - Attachment filename
     * @param {Buffer} options.content - File content (optional, for hash check)
     * @param {Function} options.v2ApiCheck - Async function returning { exists, id }
     */
    async shouldSkip(options) {
        const { objectType, v1ObjectID, parentDisplayId, fileName, content, v2ApiCheck } = options;

        // Level 1: Check by V1 Object ID (fastest)
        if (v1ObjectID) {
            const byId = await this.isAlreadyMigrated(objectType, v1ObjectID);
            if (byId.migrated) {
                return { skip: true, reason: 'ALREADY_MIGRATED_BY_ID', existingV2ID: byId.v2ObjectID };
            }
        }

        // Level 2: Check by parent displayId + filename
        if (parentDisplayId && fileName) {
            const byName = await this.isAttachmentMigratedByName(objectType, parentDisplayId, fileName);
            if (byName.migrated) {
                return { skip: true, reason: 'ALREADY_MIGRATED_BY_NAME', existingV2ID: byName.v2ObjectID };
            }
        }

        // Level 3: Check by content hash (within same parent)
        if (content) {
            const hash = this.computeContentHash(content);
            const byHash = await this.isContentAlreadyMigrated(objectType, hash, parentDisplayId);
            if (byHash.migrated) {
                return { skip: true, reason: 'ALREADY_MIGRATED_BY_CONTENT', existingV2ID: byHash.v2ObjectID };
            }
        }

        // Level 4: V2 API check (optional fallback)
        if (v2ApiCheck && typeof v2ApiCheck === 'function') {
            try {
                const apiResult = await v2ApiCheck();
                if (apiResult.exists) {
                    return { skip: true, reason: 'EXISTS_IN_V2', existingV2ID: apiResult.id };
                }
            } catch (err) {
                console.warn(`[DuplicateDetection] V2 API check failed: ${err.message}`);
            }
        }

        return { skip: false };
    }

    /**
     * Check if parent (Lead/Ticket) exists in V2 (from our cache)
     * @param {string} objectType - e.g., 'LEAD_ATTACHMENT'
     * @param {string} parentDisplayId - displayId (same in V1 & V2)
     */
    async getParentStatus(objectType, parentDisplayId) {
        await this.init();
        const status = await SELECT.one
            .from(this.entities.ParentMigrationStatus)
            .where({ objectType, parentDisplayId });
        
        return status 
            ? { found: true, v2Validated: status.v2Validated, parentV2ObjectID: status.parentV2ObjectID }
            : { found: false };
    }
}

module.exports = new DuplicateDetectionService();

