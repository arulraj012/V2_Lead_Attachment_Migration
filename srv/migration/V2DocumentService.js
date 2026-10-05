/**
 * V2DocumentService - Generic document upload service for SAP Sales/Service Cloud V2
 * 
 * Implements the 4-step document-service API flow:
 * 1. POST /document-service/documents → create metadata, get uploadUrl
 * 2. PUT {uploadUrl} → upload binary content to S3 (NO AUTH)
 * 3. GET /document-service/documents/{id} → verify status is ACTIVE
 * 4. PATCH /{entity-service}/{entities}/{id} → link document to entity
 */
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { resolveDestination } = require('./DestinationService');

const V2_DESTINATION = 'V2_SSCV2';
const V2_ENV_FALLBACK = { baseUrl: 'V2_BASE_URL', user: 'V2_USER', password: 'V2_PASSWORD' };
const DOCUMENT_CATEGORIES = { DOCUMENT: 'DOCUMENT', IMAGE: 'IMAGE', NOTE: 'NOTE', LINK: 'LINK' };
const VERIFY_MAX_RETRIES = 10;
const VERIFY_RETRY_DELAY_MS = 1000;

class V2DocumentService {
    constructor() { this._credentials = null; }

    async _getCredentials() {
        if (!this._credentials) {
            this._credentials = await resolveDestination(V2_DESTINATION, V2_ENV_FALLBACK);
        }
        return this._credentials;
    }

    _getAuthHeader() {
        return 'Basic ' + Buffer.from(`${this.user}:${this.password}`).toString('base64');
    }

    _sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    /** Step 1: Create document metadata and get upload URL */
    async createDocumentMetadata(fileName, category = 'DOCUMENT') {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const url = `${this.baseUrl}/sap/c4c/api/v1/document-service/documents`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': this._getAuthHeader(), 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ fileName, category })
        });

        if (!response.ok) {
            const err = new Error(`Failed to create document metadata: HTTP ${response.status}`);
            err.step = 'CREATE_DOCUMENT_METADATA';
            throw err;
        }

        const data = await response.json();
        const doc = data.value || data;
        return { documentId: doc.id, uploadUrl: doc.uploadUrl, status: doc.status };
    }

    /** Step 2: Upload file content to S3 pre-signed URL (NO AUTH) */
    async uploadContentToS3(uploadUrl, content, mimeType = 'application/octet-stream') {

        const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': mimeType, 'Content-Length': content.length.toString() },
            body: content
        });

        if (!response.ok) {
            const err = new Error(`Failed to upload to S3: HTTP ${response.status}`);
            err.step = 'UPLOAD_TO_S3';
            throw err;
        }
        return true;
    }

    /** Step 3: Get document status */
    async getDocumentStatus(documentId) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const url = `${this.baseUrl}/sap/c4c/api/v1/document-service/documents/${documentId}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': this._getAuthHeader(), 'Accept': 'application/json' }
        });

        if (!response.ok) {
            const err = new Error(`Failed to get document status: HTTP ${response.status}`);
            err.step = 'VERIFY_DOCUMENT';
            throw err;
        }

        const data = await response.json();
        const doc = data.value || data;
        return { status: doc.status, fileSize: doc.fileSize, contentType: doc.contentType };
    }


    /** Step 3 with retry: Wait for document to become ACTIVE */
    async waitForDocumentActive(documentId, maxRetries = VERIFY_MAX_RETRIES, delayMs = VERIFY_RETRY_DELAY_MS) {
        let lastStatus = 'UNKNOWN';

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const docStatus = await this.getDocumentStatus(documentId);
            lastStatus = docStatus.status;

            if (docStatus.status === 'ACTIVE') {
                return docStatus;
            }

            await this._sleep(delayMs);
        }

        const err = new Error(`Document not ACTIVE after ${maxRetries} attempts. Status: ${lastStatus}`);
        err.step = 'VERIFY_DOCUMENT';
        throw err;
    }

    /** Step 4: Link document to entity via PATCH (requires ETag for V2 API) */
    async linkDocumentToEntity(entityService, entityPath, entityId, documentId) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const url = `${this.baseUrl}/sap/c4c/api/v1/${entityService}/${entityPath}/${entityId}`;
        
        // Step 4a: GET entity to retrieve current ETag (required for PATCH)
        const getResponse = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': this._getAuthHeader(), 'Accept': 'application/json' }
        });
        
        if (!getResponse.ok) {
            const errorText = await getResponse.text().catch(() => '');
            const err = new Error(`Failed to get entity for ETag: HTTP ${getResponse.status} - ${errorText.substring(0, 100)}`);
            err.step = 'LINK_DOCUMENT';
            throw err;
        }
        
        const etag = getResponse.headers.get('ETag');
        
        if (!etag) {
            console.warn(`[V2DocumentService] Warning: No ETag returned, proceeding with '*'`);
        }

        // Step 4b: PATCH with If-Match header to link document
        const patchResponse = await fetch(url, {
            method: 'PATCH',
            headers: { 
                'Authorization': this._getAuthHeader(), 
                'Content-Type': 'application/json', 
                'Accept': 'application/json',
                'If-Match': etag || '*'  // Use ETag or '*' as fallback
            },
            body: JSON.stringify({ attachments: [{ id: documentId }] })
        });

        if (!patchResponse.ok) {
            const errorText = await patchResponse.text();
            const err = new Error(`Failed to link document: HTTP ${patchResponse.status} - ${errorText}`);
            err.step = 'LINK_DOCUMENT';
            throw err;
        }

        const data = await patchResponse.json();
        const entity = data.value || data;
        return { success: true, entityId: entity.id, displayId: entity.displayId, attachments: entity.attachments || [] };
    }

    /** Full upload flow - combines all 4 steps */
    async uploadAndLinkDocument(entityService, entityPath, entityId, attachmentData) {
        const { fileName, mimeType, content, category } = attachmentData;
        const startTime = Date.now();

        // Step 1: Create document metadata
        const { documentId, uploadUrl } = await this.createDocumentMetadata(fileName, category || 'DOCUMENT');

        // Step 2: Upload content to S3
        await this.uploadContentToS3(uploadUrl, content, mimeType);

        // Step 3: Wait for ACTIVE status
        const docStatus = await this.waitForDocumentActive(documentId);

        // Step 4: Link to entity
        const linkResult = await this.linkDocumentToEntity(entityService, entityPath, entityId, documentId);

        const durationMs = Date.now() - startTime;

        return {
            documentId,
            fileName,
            fileSize: docStatus.fileSize,
            contentType: docStatus.contentType,
            entityId: linkResult.entityId,
            displayId: linkResult.displayId,
            durationMs
        };
    }

    /** Get all attachments for an entity */
    async getEntityAttachments(entityService, entityPath, entityId) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const url = `${this.baseUrl}/sap/c4c/api/v1/${entityService}/${entityPath}/${entityId}?$select=attachments`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': this._getAuthHeader(), 'Accept': 'application/json' }
        });

        if (!response.ok) {
            console.error(`[V2DocumentService] Failed to get attachments: HTTP ${response.status}`);
            return [];
        }
        const data = await response.json();
        return (data.value || data).attachments || [];
    }

    /** Check if attachment exists by filename */
    async attachmentExistsByName(entityService, entityPath, entityId, fileName) {
        const attachments = await this.getEntityAttachments(entityService, entityPath, entityId);
        const existing = attachments.find(a => a.fileName === fileName || a.title === fileName);
        return { exists: !!existing, documentId: existing?.id };
    }

    /**
     * Create a web link attachment (no binary upload needed)
     * Uses document-service with category: "LINK"
     * 
     * @param {string} title - Display name for the link
     * @param {string} url - The web URL
     * @returns {Promise<{documentId: string, status: string}>}
     */
    async createWebLinkDocument(title, url) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const apiUrl = `${this.baseUrl}/sap/c4c/api/v1/document-service/documents`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Authorization': this._getAuthHeader(), 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ 
                title: title,
                url: url,
                category: 'LINK',
                isDisplayDocument: true
            })
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            const err = new Error(`Failed to create web link: HTTP ${response.status} - ${errorText.substring(0, 200)}`);
            err.step = 'CREATE_WEB_LINK';
            throw err;
        }

        const data = await response.json();
        const doc = data.value || data;
        return { documentId: doc.id, status: doc.status };
    }

    /**
     * Create and link a web link to an entity (simplified flow - no S3 upload)
     * Steps: 1. Create link document → 2. Link to entity (with ETag)
     * 
     * @param {string} entityService - e.g., 'lead-service'
     * @param {string} entityPath - e.g., 'leads'
     * @param {string} entityId - V2 entity UUID
     * @param {Object} linkData - { title, url }
     * @returns {Promise<{documentId: string, durationMs: number}>}
     */
    async createAndLinkWebLink(entityService, entityPath, entityId, linkData) {
        const { title, url } = linkData;
        const startTime = Date.now();

        // Step 1: Create web link document
        const { documentId } = await this.createWebLinkDocument(title, url);

        // Step 2: Link to entity (with ETag - same as file attachments)
        await this.linkDocumentToEntity(entityService, entityPath, entityId, documentId);

        const durationMs = Date.now() - startTime;

        return {
            documentId,
            title,
            url,
            entityId,
            durationMs
        };
    }
}

module.exports = V2DocumentService;
module.exports.DOCUMENT_CATEGORIES = DOCUMENT_CATEGORIES;

