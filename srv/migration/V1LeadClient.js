/**
 * V1LeadClient - Client for fetching leads and attachments from C4C V1 OData API
 * BTP Destination name: V1_C4C
 */
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { resolveDestination } = require('./DestinationService');

const V1_DESTINATION = 'V1_C4C';
const V1_ENV_FALLBACK = { baseUrl: 'V1_BASE_URL', user: 'V1_USER', password: 'V1_PASSWORD' };

class V1LeadClient {
    constructor() { this._credentials = null; }

    async _getCredentials() {
        if (!this._credentials) {
            this._credentials = await resolveDestination(V1_DESTINATION, V1_ENV_FALLBACK);
        }
        return this._credentials;
    }

    _getAuthHeader() {
        return 'Basic ' + Buffer.from(`${this.user}:${this.password}`).toString('base64');
    }

    async fetchLeads(filterOptions = {}) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const filters = [];
        if (filterOptions.leadId) filters.push(`LeadID eq '${filterOptions.leadId}'`);
        if (filterOptions.createdFrom) {
            filters.push(`CreationDateTime ge datetimeoffset'${filterOptions.createdFrom}T00:00:00Z'`);
        }
        if (filterOptions.createdTo) {
            filters.push(`CreationDateTime le datetimeoffset'${filterOptions.createdTo}T23:59:59Z'`);
        }

        const selectFields = 'ObjectID,LeadID,Name,StatusCode,AccountID,AccountName,OwnerID,CreationDateTime';
        const queryParams = new URLSearchParams({
            '$format': 'json', '$select': selectFields, '$orderby': 'CreationDateTime desc'
        });
        if (filters.length > 0) queryParams.set('$filter', filters.join(' and '));
        if (filterOptions.maxRecords) queryParams.set('$top', filterOptions.maxRecords.toString());

        const url = `${this.baseUrl}/sap/c4c/odata/v1/c4codataapi/LeadCollection?${queryParams}`;
        console.log(`[V1LeadClient] Fetching leads: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': this._getAuthHeader(), 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        return data.d?.results || [];
    }

    async fetchLeadAttachments(leadObjectId) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const folderUrl = `${this.baseUrl}/sap/c4c/odata/v1/c4codataapi/LeadCollection('${leadObjectId}')/LeadAttachmentFolder?$format=json`;
        const folderResponse = await fetch(folderUrl, {
            method: 'GET',
            headers: { 'Authorization': this._getAuthHeader(), 'Accept': 'application/json' }
        });
        if (!folderResponse.ok) return [];

        const folders = (await folderResponse.json()).d?.results || [];
        const allAttachments = [];
        
        for (const folder of folders) {
            const docUrl = `${this.baseUrl}/sap/c4c/odata/v1/c4codataapi/LeadAttachmentFolderCollection('${folder.ObjectID}')/Documents?$format=json`;
            try {
                const docRes = await fetch(docUrl, {
                    method: 'GET',
                    headers: { 'Authorization': this._getAuthHeader(), 'Accept': 'application/json' }
                });
                if (docRes.ok) {
                    const docs = (await docRes.json()).d?.results || [];
                    for (const doc of docs) {
                        allAttachments.push({
                            folderId: folder.ObjectID, objectId: doc.ObjectID,
                            name: doc.Name || doc.FileName, mimeType: doc.MimeType,
                            sizeInBytes: doc.SizeInkB ? doc.SizeInkB * 1024 : 0,
                            categoryCode: doc.CategoryCode, description: doc.Description
                        });
                    }
                }
            } catch (err) { console.warn(`[V1LeadClient] Folder error: ${err.message}`); }
        }
        return allAttachments;
    }

    async downloadAttachment(attachmentObjectId) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const url = `${this.baseUrl}/sap/c4c/odata/v1/c4codataapi/LeadAttachmentFolderDocumentCollection('${attachmentObjectId}')/$value`;
        const startTime = Date.now();
        const response = await fetch(url, { method: 'GET', headers: { 'Authorization': this._getAuthHeader() } });
        if (!response.ok) { const err = new Error(`HTTP ${response.status}`); err.step = 'DOWNLOAD_ATTACHMENT'; throw err; }

        const buffer = await response.arrayBuffer();
        return { buffer: Buffer.from(buffer), durationMs: Date.now() - startTime };
    }
}

module.exports = V1LeadClient;
