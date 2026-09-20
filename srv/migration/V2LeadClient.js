/**
 * V2LeadClient - Client for managing leads and attachments in SAP Sales/Service Cloud V2
 * BTP Destination name: V2_SSCV2
 */
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { resolveDestination } = require('./DestinationService');

const V2_DESTINATION = 'V2_SSCV2';
const V2_ENV_FALLBACK = { baseUrl: 'V2_BASE_URL', user: 'V2_USER', password: 'V2_PASSWORD' };

class V2LeadClient {
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

    async findLeadByDisplayId(displayId) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const url = `${this.baseUrl}/sap/c4c/api/v1/lead-service/leads?$filter=displayId eq '${encodeURIComponent(displayId)}'`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': this._getAuthHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) return null;

        const leads = (await response.json()).value || [];
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

    async uploadAttachment(leadId, attachmentData) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const url = `${this.baseUrl}/sap/c4c/api/v1/lead-service/leads/${leadId}/attachments`;
        const startTime = Date.now();
        const boundary = '----FormBoundary' + Date.now();
        const body = this._buildMultipartBody(boundary, attachmentData);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': this._getAuthHeader(),
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Accept': 'application/json'
            },
            body: body
        });

        if (!response.ok) {
            const err = new Error(`HTTP ${response.status}`);
            err.step = 'UPLOAD_ATTACHMENT';
            throw err;
        }

        const data = await response.json();
        return { attachmentId: data.value?.id || data.id, durationMs: Date.now() - startTime };
    }

    _buildMultipartBody(boundary, { fileName, mimeType, content, description }) {
        let body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
        body += `Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`;
        body += content.toString('binary') + '\r\n';
        if (description) {
            body += `--${boundary}\r\nContent-Disposition: form-data; name="description"\r\n\r\n${description}\r\n`;
        }
        body += `--${boundary}--\r\n`;
        return Buffer.from(body, 'binary');
    }

    async getLeadAttachments(leadId) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const url = `${this.baseUrl}/sap/c4c/api/v1/lead-service/leads/${leadId}/attachments`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': this._getAuthHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) return [];
        return (await response.json()).value || [];
    }

    async attachmentExists(leadId, fileName) {
        const attachments = await this.getLeadAttachments(leadId);
        return attachments.some(a => a.fileName === fileName || a.name === fileName);
    }
}

module.exports = V2LeadClient;
