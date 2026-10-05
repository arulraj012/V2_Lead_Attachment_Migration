/**
 * V2LeadClient - Client for managing leads and attachments in SAP Sales/Service Cloud V2
 * 
 * Uses V2DocumentService for attachment uploads (4-step document-service API flow)
 * BTP Destination name: V2_SSCV2
 */
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { resolveDestination } = require('./DestinationService');
const V2DocumentService = require('./V2DocumentService');

const V2_DESTINATION = 'V2_SSCV2';
const V2_ENV_FALLBACK = { baseUrl: 'V2_BASE_URL', user: 'V2_USER', password: 'V2_PASSWORD' };

// V2 entity service configuration for Leads
const LEAD_ENTITY_SERVICE = 'lead-service';
const LEAD_ENTITY_PATH = 'leads';

class V2LeadClient {
    constructor() { 
        this._credentials = null;
        this._documentService = new V2DocumentService();
    }

    async _getCredentials() {
        if (!this._credentials) {
            this._credentials = await resolveDestination(V2_DESTINATION, V2_ENV_FALLBACK);
        }
        return this._credentials;
    }

    _getAuthHeader() {
        return 'Basic ' + Buffer.from(`${this.user}:${this.password}`).toString('base64');
    }

    async findLeadByDisplayId(displayId) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const url = `${this.baseUrl}/sap/c4c/api/v1/lead-service/leads?$filter=displayId eq '${encodeURIComponent(displayId)}'`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': this._getAuthHeader(), 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`[V2LeadClient] Failed to find lead: HTTP ${response.status} - ${errorText.substring(0, 200)}`);
            return null;
        }

        const data = await response.json();
        const leads = data.value || [];
        return leads.length > 0 ? leads[0] : null;
    }

    async getLeadById(leadId) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const url = `${this.baseUrl}/sap/c4c/api/v1/lead-service/leads/${leadId}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': this._getAuthHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.value || data;
    }

    /**
     * Upload attachment to a Lead using V2 Document Service (4-step flow)
     * 
     * @param {string} leadId - V2 Lead ID
     * @param {Object} attachmentData - { fileName, mimeType, content, description, category }
     * @returns {Promise<{attachmentId: string, durationMs: number}>}
     */
    async uploadAttachment(leadId, attachmentData) {

        try {
            // Use the 4-step document-service API flow
            const result = await this._documentService.uploadAndLinkDocument(
                LEAD_ENTITY_SERVICE,
                LEAD_ENTITY_PATH,
                leadId,
                {
                    fileName: attachmentData.fileName,
                    mimeType: attachmentData.mimeType || 'application/octet-stream',
                    content: attachmentData.content,
                    category: attachmentData.category || 'DOCUMENT'
                }
            );

            return {
                attachmentId: result.documentId,
                durationMs: result.durationMs,
                fileSize: result.fileSize,
                displayId: result.displayId
            };

        } catch (err) {
            // Preserve error step if set by document service
            if (!err.step) err.step = 'UPLOAD_ATTACHMENT';
            throw err;
        }
    }

    /**
     * Get all attachments for a Lead
     */
    async getLeadAttachments(leadId) {
        return this._documentService.getEntityAttachments(
            LEAD_ENTITY_SERVICE,
            LEAD_ENTITY_PATH,
            leadId
        );
    }

    /**
     * Check if attachment with given filename exists on Lead
     */
    async attachmentExists(leadId, fileName) {
        const result = await this._documentService.attachmentExistsByName(
            LEAD_ENTITY_SERVICE,
            LEAD_ENTITY_PATH,
            leadId,
            fileName
        );
        return result.exists;
    }

    /**
     * Get all attachments for debugging
     */
    async debugListAttachments(leadId) {
        return this.getLeadAttachments(leadId);
    }

    /**
     * Upload a web link attachment to a Lead (no binary content)
     * 
     * @param {string} leadId - V2 Lead ID
     * @param {Object} linkData - { title, url }
     * @returns {Promise<{attachmentId: string, durationMs: number}>}
     */
    async uploadWebLink(leadId, linkData) {

        try {
            const result = await this._documentService.createAndLinkWebLink(
                LEAD_ENTITY_SERVICE,
                LEAD_ENTITY_PATH,
                leadId,
                {
                    title: linkData.title,
                    url: linkData.url
                }
            );

            return {
                attachmentId: result.documentId,
                durationMs: result.durationMs
            };

        } catch (err) {
            if (!err.step) err.step = 'UPLOAD_WEB_LINK';
            throw err;
        }
    }
}

module.exports = V2LeadClient;
