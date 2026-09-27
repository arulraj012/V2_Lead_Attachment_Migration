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

        console.log(`[V1LeadClient] Using credentials: baseUrl=${baseUrl}, user=${user}, password=${password ? '***' : '(empty)'}`);

        const filters = [];
        if (filterOptions.leadId) filters.push(`ID eq '${filterOptions.leadId}'`);
        if (filterOptions.createdFrom) {
            filters.push(`CreationDateTime ge datetimeoffset'${filterOptions.createdFrom}T00:00:00Z'`);
        }
        if (filterOptions.createdTo) {
            filters.push(`CreationDateTime le datetimeoffset'${filterOptions.createdTo}T23:59:59Z'`);
        }

        // V1 C4C Lead API property names (from API documentation)
        const selectFields = 'ObjectID,ID,Name,UserStatusCode,AccountPartyID,AccountPartyName,OwnerPartyID,CreationDateTime';
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
        
        if (!response.ok) {
            let errorDetail = '';
            try {
                const errorBody = await response.text();
                console.error(`[V1LeadClient] API Error Response (${response.status}): ${errorBody}`);
                // Try to parse OData error format
                try {
                    const errorJson = JSON.parse(errorBody);
                    errorDetail = errorJson.error?.message?.value || errorJson.error?.message || errorBody.substring(0, 300);
                } catch {
                    errorDetail = errorBody.substring(0, 300);
                }
            } catch (e) { 
                errorDetail = response.statusText || 'Unknown error';
            }
            const err = new Error(`HTTP ${response.status}: ${errorDetail}`);
            err.step = 'FETCH_V1';
            throw err;
        }

        const data = await response.json();
        return data.d?.results || [];
    }

    async fetchLeadAttachments(leadObjectId) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        // C4C OData API: LeadAttachmentFolder IS the attachment itself (not a folder containing files)
        // The Name property of the folder is the filename, and we download via $value
        const folderUrl = `${this.baseUrl}/sap/c4c/odata/v1/c4codataapi/LeadCollection('${leadObjectId}')/LeadAttachmentFolder?$format=json`;
        console.log(`[V1LeadClient] Fetching attachments: ${folderUrl}`);
        
        const folderResponse = await fetch(folderUrl, {
            method: 'GET',
            headers: { 'Authorization': this._getAuthHeader(), 'Accept': 'application/json' }
        });
        
        if (!folderResponse.ok) {
            console.error(`[V1LeadClient] Failed to fetch attachments: HTTP ${folderResponse.status}`);
            return [];
        }

        const folderData = await folderResponse.json();
        const attachmentEntities = folderData.d?.results || [];
        console.log(`[V1LeadClient] Found ${attachmentEntities.length} attachment(s) for lead ${leadObjectId}`);
        
        if (attachmentEntities.length === 0) {
            console.log(`[V1LeadClient] Lead has no attachments`);
            return [];
        }

        // Log all properties of first attachment for debugging
        if (attachmentEntities.length > 0) {
            console.log(`[V1LeadClient] Attachment entity properties:`, JSON.stringify(attachmentEntities[0], null, 2));
        }

        const allAttachments = [];
        
        for (const att of attachmentEntities) {
            // In C4C, LeadAttachmentFolder IS the attachment
            // CategoryCode '3' or CategoryCodeText 'Link' indicates a web link (not a binary file)
            const isWebLink = att.CategoryCode === '3' || att.CategoryCodeText === 'Link' || !!att.LinkWebURI;
            
            const attachment = {
                folderId: att.ObjectID, 
                objectId: att.ObjectID,  // Use folder ObjectID for download (files only)
                name: att.Name || att.FileName || att.DocumentLink || 'unnamed',
                mimeType: att.MimeType || 'application/octet-stream',
                sizeInBytes: att.SizeInKB ? att.SizeInKB * 1024 : (att.SizeInkB ? att.SizeInkB * 1024 : 0),
                categoryCode: att.CategoryCode, 
                categoryCodeText: att.CategoryCodeText,
                description: att.Description,
                // Web link specific properties
                isWebLink: isWebLink,
                linkWebURI: att.LinkWebURI || null,
                // Additional properties
                uuid: att.UUID,
                typeCode: att.TypeCode,
                createdOn: att.CreatedOn,
                createdBy: att.CreatedBy
            };
            
            if (isWebLink) {
                console.log(`[V1LeadClient] → [LINK] ${attachment.name} → ${attachment.linkWebURI} (ObjectID: ${attachment.objectId})`);
            } else {
                console.log(`[V1LeadClient] → [FILE] ${attachment.name} (${attachment.mimeType}, ${attachment.sizeInBytes} bytes, ObjectID: ${attachment.objectId})`);
            }
            allAttachments.push(attachment);
        }
        
        console.log(`[V1LeadClient] Total attachments found: ${allAttachments.length}`);
        return allAttachments;
    }

    async downloadAttachment(attachmentObjectId, leadObjectId) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        // C4C OData: Correct URL pattern for Lead attachment binary download
        // LeadCollection('{LeadObjectID}')/LeadAttachmentFolder('{AttachmentObjectID}')/Binary/$value
        const url = `${this.baseUrl}/sap/c4c/odata/v1/c4codataapi/LeadCollection('${leadObjectId}')/LeadAttachmentFolder('${attachmentObjectId}')/Binary/$value`;
        
        console.log(`[V1LeadClient] Downloading: ${url}`);
        const startTime = Date.now();
        
        const response = await fetch(url, { 
            method: 'GET', 
            headers: { 'Authorization': this._getAuthHeader() } 
        });
        
        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`[V1LeadClient] Download failed: HTTP ${response.status} - ${errorText.substring(0, 200)}`);
            const err = new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
            err.step = 'DOWNLOAD';
            throw err;
        }

        const buffer = await response.arrayBuffer();
        const durationMs = Date.now() - startTime;
        console.log(`[V1LeadClient] ✓ Downloaded: ${buffer.byteLength} bytes in ${durationMs}ms`);
        return { buffer: Buffer.from(buffer), durationMs };
    }
}

module.exports = V1LeadClient;
