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

        // Credentials loaded from destination/env

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
            '$format': 'json', '$select': selectFields, '$orderby': 'CreationDateTime asc,ID asc'  // Ascending for cursor-based pagination
        });
        if (filters.length > 0) queryParams.set('$filter', filters.join(' and '));
        if (filterOptions.maxRecords) queryParams.set('$top', filterOptions.maxRecords.toString());

        const url = `${this.baseUrl}/sap/c4c/odata/v1/c4codataapi/LeadCollection?${queryParams}`;

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

    /**
     * Fetch leads using keyset pagination (cursor-based)
     * More efficient than offset pagination for large datasets
     * 
     * @param {Object} options - Pagination options
     * @param {string} options.createdFrom - Start date (YYYY-MM-DD)
     * @param {string} options.createdTo - End date (YYYY-MM-DD)
     * @param {string} options.afterLeadId - Cursor: last processed Lead ID
     * @param {string} options.afterCreationDateTime - Cursor: last processed CreationDateTime
     * @param {number} options.limit - Max leads to fetch (default 50)
     * @returns {Promise<Array>} Leads after the cursor position
     */
    async fetchLeadsAfterCursor(options = {}) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const { createdFrom, createdTo, afterLeadId, afterCreationDateTime, limit = 50 } = options;

        // Build keyset pagination filter
        const filters = [];
        
        // Date range filter
        if (createdFrom) {
            filters.push(`CreationDateTime ge datetimeoffset'${createdFrom}T00:00:00Z'`);
        }
        if (createdTo) {
            filters.push(`CreationDateTime le datetimeoffset'${createdTo}T23:59:59Z'`);
        }

        // Keyset cursor filter: fetch records AFTER the cursor position
        // Using composite key (CreationDateTime, ID) for deterministic ordering
        if (afterCreationDateTime && afterLeadId) {
            // Records where: (CreationDateTime > cursor) OR (CreationDateTime = cursor AND ID > cursorId)
            const cursorDate = new Date(afterCreationDateTime).toISOString();
            filters.push(`(CreationDateTime gt datetimeoffset'${cursorDate}' or (CreationDateTime eq datetimeoffset'${cursorDate}' and ID gt '${afterLeadId}'))`);
        } else if (afterLeadId) {
            // Fallback: just use ID if no datetime available
            filters.push(`ID gt '${afterLeadId}'`);
        }

        const selectFields = 'ObjectID,ID,Name,UserStatusCode,AccountPartyID,AccountPartyName,OwnerPartyID,CreationDateTime';
        const queryParams = new URLSearchParams({
            '$format': 'json',
            '$select': selectFields,
            '$orderby': 'CreationDateTime asc,ID asc',  // Must match cursor ordering
            '$top': limit.toString()
        });
        
        if (filters.length > 0) {
            queryParams.set('$filter', filters.join(' and '));
        }

        const url = `${this.baseUrl}/sap/c4c/odata/v1/c4codataapi/LeadCollection?${queryParams}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': this._getAuthHeader(), 'Accept': 'application/json' }
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            const err = new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
            err.step = 'FETCH_V1';
            throw err;
        }

        const data = await response.json();
        return data.d?.results || [];
    }

    /**
     * Count total leads in date range (for progress calculation)
     */
    async countLeadsInRange(createdFrom, createdTo) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        const filters = [];
        if (createdFrom) filters.push(`CreationDateTime ge datetimeoffset'${createdFrom}T00:00:00Z'`);
        if (createdTo) filters.push(`CreationDateTime le datetimeoffset'${createdTo}T23:59:59Z'`);

        const queryParams = new URLSearchParams({ '$format': 'json', '$inlinecount': 'allpages', '$top': '1' });
        if (filters.length > 0) queryParams.set('$filter', filters.join(' and '));

        const url = `${this.baseUrl}/sap/c4c/odata/v1/c4codataapi/LeadCollection?${queryParams}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': this._getAuthHeader(), 'Accept': 'application/json' }
        });

        if (!response.ok) return null;

        const data = await response.json();
        const count = parseInt(data.d?.__count, 10);
        return isNaN(count) ? null : count;
    }

    async fetchLeadAttachments(leadObjectId) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        // C4C OData API: LeadAttachmentFolder IS the attachment itself (not a folder containing files)
        // The Name property of the folder is the filename, and we download via $value
        const folderUrl = `${this.baseUrl}/sap/c4c/odata/v1/c4codataapi/LeadCollection('${leadObjectId}')/LeadAttachmentFolder?$format=json`;
        
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
        if (attachmentEntities.length === 0) return [];



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
            
            allAttachments.push(attachment);
        }
        
        return allAttachments;
    }

    /**
     * Find a V1 Lead by its displayId (ID field)
     * @param {string} displayId - The Lead's display ID (e.g., "12345")
     * @returns {Object|null} - The lead object with ObjectID, or null if not found
     */
    async findLeadByDisplayId(displayId) {
        const leads = await this.fetchLeads({ leadId: displayId, maxRecords: 1 });
        if (leads.length === 0) {
            console.log(`[V1LeadClient] Lead not found by displayId: ${displayId}`);
            return null;
        }
        const lead = leads[0];
        return {
            objectId: lead.ObjectID,
            displayId: lead.ID,
            name: lead.Name,
            statusCode: lead.UserStatusCode
        };
    }

    async downloadAttachment(attachmentObjectId, leadObjectId) {
        const { baseUrl, user, password } = await this._getCredentials();
        this.baseUrl = baseUrl; this.user = user; this.password = password;

        // C4C OData: Correct URL pattern for Lead attachment binary download
        // LeadCollection('{LeadObjectID}')/LeadAttachmentFolder('{AttachmentObjectID}')/Binary/$value
        const url = `${this.baseUrl}/sap/c4c/odata/v1/c4codataapi/LeadCollection('${leadObjectId}')/LeadAttachmentFolder('${attachmentObjectId}')/Binary/$value`;
        

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

        return { buffer: Buffer.from(buffer), durationMs };
    }
}

module.exports = V1LeadClient;
