/**
 * FieldMappingService - Generic field mapping engine for V1 to V2 migration
 * Loads configuration and transforms V1 data to V2 format
 */
const cds = require('@sap/cds');

// Default field mapping for Lead Attachments
const DEFAULT_LEAD_ATTACHMENT_MAPPING = {
    objectType: 'LEAD_ATTACHMENT',
    version: '1.0.0',
    fieldMappings: [
        { source: 'ObjectID', target: null, auditAs: 'v1ObjectID' },
        { source: 'Name', target: 'fileName', transforms: ['trim', 'sanitizeFileName'], maxLength: 255 },
        { source: 'MimeType', target: 'mimeType', default: 'application/octet-stream' },
        { source: 'Description', target: 'description', transforms: [{ truncate: 500 }] },
        { source: 'SizeInkB', target: 'fileSize', transforms: [{ multiply: 1024 }] },
        { source: 'CategoryCode', target: 'categoryCode' }
    ],
    parentMapping: {
        sourceIdField: 'LeadObjectID',
        sourceDisplayField: 'LeadID',
        targetType: 'LEAD'
    }
};

class FieldMappingService {
    constructor() {
        this.db = null;
        this.configCache = new Map();
        this.transforms = {
            trim: (v) => typeof v === 'string' ? v.trim() : v,
            lowercase: (v) => typeof v === 'string' ? v.toLowerCase() : v,
            uppercase: (v) => typeof v === 'string' ? v.toUpperCase() : v,
            truncate: (v, len) => typeof v === 'string' ? v.substring(0, len) : v,
            multiply: (v, factor) => typeof v === 'number' ? v * factor : (parseInt(v) || 0) * factor,
            sanitizeFileName: (v) => v?.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'),
            parseDate: (v) => v ? new Date(v).toISOString() : null,
            toString: (v) => v != null ? String(v) : null,
            toNumber: (v) => v != null ? Number(v) : null
        };
    }

    async init() {
        if (!this.db) {
            this.db = await cds.connect.to('db');
        }
    }

    /**
     * Load mapping configuration for an object type
     * Priority: 1. Database MappingConfig, 2. Default config
     */
    async loadConfig(objectType) {
        // Check cache
        const cached = this.configCache.get(objectType);
        if (cached && Date.now() - cached.loadedAt < 5 * 60 * 1000) {
            return cached.config;
        }

        await this.init();
        
        // Try to load from database
        const dbConfig = await SELECT.one
            .from('migration.MappingConfig')
            .where({ objectType, mappingType: 'FIELD_MAPPING', isActive: true });
        
        let config;
        if (dbConfig?.mappings) {
            try {
                config = JSON.parse(dbConfig.mappings);
            } catch (e) {
                console.warn(`[FieldMapping] Invalid JSON for ${objectType}, using default`);
            }
        }

        // Fallback to defaults
        if (!config) {
            config = this.getDefaultConfig(objectType);
        }

        this.configCache.set(objectType, { config, loadedAt: Date.now() });
        return config;
    }

    /** Get default configuration for known object types */
    getDefaultConfig(objectType) {
        const defaults = {
            'LEAD_ATTACHMENT': DEFAULT_LEAD_ATTACHMENT_MAPPING
        };
        return defaults[objectType] || { objectType, fieldMappings: [] };
    }

    /**
     * Apply a single transform to a value
     */
    applyTransform(value, transform) {
        if (typeof transform === 'string') {
            return this.transforms[transform] ? this.transforms[transform](value) : value;
        }
        if (typeof transform === 'object') {
            const [name, param] = Object.entries(transform)[0];
            return this.transforms[name] ? this.transforms[name](value, param) : value;
        }
        return value;
    }

    /**
     * Map source object to target format using field mappings
     */
    mapSourceToTarget(sourceObject, config) {
        const result = {};
        
        for (const mapping of (config.fieldMappings || [])) {
            if (!mapping.target) continue; // Skip audit-only fields
            
            let value = sourceObject[mapping.source];
            
            // Apply transforms
            for (const transform of (mapping.transforms || [])) {
                value = this.applyTransform(value, transform);
            }
            
            // Apply max length
            if (mapping.maxLength && typeof value === 'string') {
                value = value.substring(0, mapping.maxLength);
            }
            
            // Apply default
            if ((value === undefined || value === null) && mapping.default !== undefined) {
                value = mapping.default;
            }
            
            // Apply value mapping
            if (mapping.valueMapping && value != null) {
                value = mapping.valueMapping[value] ?? mapping.valueMapping['*'] ?? value;
            }
            
            result[mapping.target] = value;
        }
        
        return result;
    }

    /**
     * Build audit record from source object
     */
    buildAuditRecord(sourceObject, config) {
        const audit = {};
        
        for (const mapping of (config.fieldMappings || [])) {
            const auditField = mapping.auditAs || mapping.target;
            if (!auditField) continue;
            
            let value = sourceObject[mapping.source];
            for (const transform of (mapping.transforms || [])) {
                value = this.applyTransform(value, transform);
            }
            audit[auditField] = value;
        }
        
        return audit;
    }

    /** Clear config cache */
    clearCache() {
        this.configCache.clear();
    }
}

module.exports = new FieldMappingService();

