# V1 to V2 Lead Attachment Migration Tool

## Documentation

**Version:** 1.0  

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Challenge with V2](#2-challenge-with-v2)
3. [High-Level Solution](#3-high-level-solution)
4. [Execution](#4-execution)
5. [Summary & Conclusion](#5-summary--conclusion)
6. [Technical Details](#6-technical-details)

---

## 1. Introduction

### 1.1 Purpose

The **V1 to V2 Lead Attachment Migration Tool** is a specialized utility designed to migrate attachments (files and web links) from SAP C4C (Cloud for Customer) V1 to SAP Sales and Service Cloud V2. This tool complements the SAP Data Transfer Tool (DTT), which handles the migration of parent objects but does not support attachment migration.

### 1.2 Scope

| In Scope | Out of Scope |
|----------|--------------|
| Lead attachments (binary files) | Parent Lead migration (handled by DTT) |
| Web link attachments | Ticket/Account/Contact attachments (future) |
| Duplicate detection & skip | Data transformation or field mapping |
| Audit logging & progress tracking | Custom field migration |
| Failed record retry mechanism | Business logic migration |

### 1.3 Target Audience

- **Technical Consultants** - Implementing and configuring the tool
- **Developers** - Extending the tool for additional object types

### 1.4 Key Assumption

> **DTT Preserves DisplayId**: The SAP Data Transfer Tool preserves the displayId when migrating Leads from V1 to V2. V1 Lead ID 2898 becomes V2 Lead with displayId: 2898. This tool uses this preserved identifier to locate target Leads in V2.

---

## 2. Challenge with V2

### 2.1 V2s New Document Service Architecture

SAP Sales and Service Cloud V2 introduces a fundamentally different approach to attachment management:

**V1 (C4C) Approach:** Single API call creates and links attachment

**V2 Approach:** 4-step process required:
1. Create metadata - Get upload URL
2. Upload binary to S3 - No authentication
3. Verify document status - Poll until ACTIVE  
4. Link document to entity - Requires ETag

### 2.2 The 4-Step Upload Flow

| Step | API Call | Purpose |
|------|----------|---------|
| 1 | POST /document-service/documents | Create metadata, get S3 upload URL |
| 2 | PUT {uploadUrl} | Upload binary to S3 (NO AUTH!) |
| 3 | GET /document-service/documents/{id} | Poll until status = ACTIVE |
| 4 | PATCH /{entity-service}/{entities}/{id} | Link document (requires ETag) |

### 2.3 Web Link Attachments

V1 supports web link attachments (URLs stored as attachments):

| Property | V1 | V2 |
|----------|----|----|
| Detection | CategoryCode=3 or LinkWebURI | N/A |
| Storage | LinkWebURI field | url field |
| Upload | Same as files | No S3 upload |
| Category | Various | category: LINK |

Web links use a simplified 2-step flow (no binary upload to S3).

### 2.4 DTT Limitations

The SAP Data Transfer Tool (DTT) has limitations:

- Does NOT migrate Lead attachments

---

## 3. High-Level Solution

### 3.1 Architecture Overview

The tool follows a layered architecture:

- **UI Layer**: React dashboard with UI5 Web Components
- **Service Layer**: SAP CAP OData service with actions
- **Business Logic**: Migration job with client adapters
- **Data Layer**: SQLite (dev) / HANA (prod) for state management

### 3.2 Key Components

| Component | Responsibility |
|-----------|----------------|
| **MigrationJob.js** | Core migration orchestration |
| **V1LeadClient.js** | Fetch leads & download attachments from V1 |
| **V2LeadClient.js** | Find leads & upload attachments to V2 |
| **V2DocumentService.js** | 4-step document upload flow |
| **CheckpointService.js** | State management & audit logging |
| **DuplicateDetectionService.js** | Prevents duplicate migrations |

### 3.3 Migration Flow Per Lead

1. **Fetch V1 Lead** - GET /LeadCollection?filter=ID eq leadId
2. **Fetch Attachments** - Detect file vs web link (CategoryCode=3)
3. **Find V2 Lead** - GET /lead-service/leads?filter=displayId eq ID
4. **For Each Attachment:**
   - Check duplicate - Skip if exists
   - [FILE] Download from V1 - Upload to V2 (4-step)
   - [LINK] Create web link in V2 (2-step)
   - Log success/failure
5. **Update Progress** - Increment counters

---

## 4. Execution

### 4.1 Prerequisites

- Node.js 20+, SAP CAP 8+
- Access to V1 C4C tenant (read) and V2 SSC tenant (write)
- .env file with credentials:

```
V1_BASE_URL=https://myXXXXXX.crm.ondemand.com
V1_USER=migration_user
V1_PASSWORD=*****
V2_BASE_URL=https://myXXXXXX.crm.cloud.sap
V2_USER=migration_user
V2_PASSWORD=*****
```

### 4.2 Running the Migration

**Via UI Dashboard:**
1. npm run watch - Start CAP server
2. cd app/migration-ui && npm run build:local - Build UI
3. Open http://localhost:4004/ui/
4. Click Start Migration and configure filters

**Via API:**
```bash
# Full migration
curl -X POST "http://localhost:4004/migration/triggerRun" \
  -H "Authorization: Basic YWRtaW46YWRtaW4=" \
  -d '{"objectType": "LEAD_ATTACHMENT"}'

# Specific lead
curl -X POST "http://localhost:4004/migration/triggerRun" \
  -d '{"parentId": "2898"}'
```

### 4.3 Monitoring Progress

| Dashboard View | Description |
|----------------|-------------|
| Migration Status | Current run status, totals |
| Run History | All runs with Migrated/Skipped/Failed |
| Failed Records | Records with error details |
| Audit Log | Per-attachment migration log |

### 4.4 Handling Failures

Failed records are logged with error step and message. Retry via:

```bash
curl -X POST "http://localhost:4004/migration/retryFailed"
```

### 4.5 Batch Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| batchSize | 10 | Leads per batch |
| maxRecordsPerRun | 500 | Max attachments per run |
| delayBetweenBatches | 1000ms | Pause between batches |
| delayBetweenRecords | 200ms | Pause between attachments |

---

## 5. Summary & Conclusion

### 5.1 Benefits Achieved

| Benefit | Description |
|---------|-------------|
| **Complete Migration** | Fills the attachment gap left by DTT |
| **Idempotent** | Safe to re-run; duplicates are skipped |
| **Auditable** | Full audit trail of every attachment |
| **Resumable** | Checkpointing allows interrupted runs to continue |
| **Web Links Support** | Handles both binary files and URL attachments |

### 5.2 Example Run Summary

```
Run ID:      a1b2c3d4-e5f6-...
Duration:    45 minutes
Leads:       1,250
Attachments: 3,847

Migrated:  3,102 (80.6%)
Skipped:     698 (18.2%)
Failed:       47 (1.2%)
```

### 5.3 Future Extensibility


### 5.4 Recommendations

1. **Run DTT First** - Ensure Leads are migrated before attachments
2. **Test with Small Batch** - Use maxRecords: 5 for initial testing
3. **Monitor Failed Records** - Review and resolve before production
4. **Schedule Off-Peak** - Run large migrations during low-usage periods

---

## 6. Technical Details

### 6.1 Project Structure

```
V2_Lead_Attachment_Migration/
├── app/migration-ui/          # React Dashboard
│   ├── src/components/        # UI Components
│   ├── src/hooks/             # React Query hooks
│   └── dist/                  # Built UI
├── db/schema.cds              # Database schema
├── srv/
│   ├── migration/             # Migration logic
│   │   ├── MigrationJob.js
│   │   ├── V1LeadClient.js
│   │   ├── V2LeadClient.js
│   │   ├── V2DocumentService.js
│   │   └── CheckpointService.js
│   ├── migration-service.cds
│   └── migration-service.js
└── .env                       # Local credentials
```

### 6.2 Database Entities

| Entity | Purpose |
|--------|---------|
| Checkpoint | Track migration state per object type |
| RunHistory | History of all migration runs |
| ObjectAuditLog | Per-attachment success records |
| ObjectFailedRecord | Failed records for retry |
| ParentMigrationStatus | Per-lead progress tracking |

### 6.3 V2 Document Service API

**File Upload (4 Steps):**
```
Step 1: POST /document-service/documents
        Body: { fileName: "report.pdf", category: "DOCUMENT" }
        Response: { id: "doc-uuid", uploadUrl: "https://s3.../presigned" }

Step 2: PUT https://s3.../presigned (NO AUTH!)
        Body: binary content

Step 3: GET /document-service/documents/{doc-uuid}
        Response: { status: "ACTIVE" }

Step 4: PATCH /lead-service/leads/{lead-uuid}
        Headers: { If-Match: "{etag}" }
        Body: { attachments: [...existing, { id: "doc-uuid" }] }
```

**Web Link (2 Steps):**
```
Step 1: POST /document-service/documents
        Body: { title: "Google", url: "https://google.com", category: "LINK" }

Step 2: Link to Lead (same as files)
```

### 6.4 Error Steps

| Step | Description |
|------|-------------|
| FETCH_V1 | Failed to fetch from V1 |
| DOWNLOAD | Failed to download binary |
| CREATE_DOCUMENT_METADATA | V2 metadata creation failed |
| UPLOAD_TO_S3 | S3 upload failed |
| VERIFY_DOCUMENT | Document stuck in PENDING |
| LINK_DOCUMENT | ETag mismatch or concurrent update |

### 6.5 Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| All attachments skipped | Already migrated | Expected behavior |
| "Lead not found in V2" | DTT not run | Run DTT first |
| "ETag mismatch" | Concurrent update | Retry |
| UI shows blank page | Wrong base path | Run npm run build:local |

---

## Appendix: Glossary

| Term | Definition |
|------|------------|
| **DTT** | Data Transfer Tool - SAP tool for migrating business objects |
| **displayId** | Human-readable ID (e.g., Lead number 2898) |
| **ObjectID** | V1 internal UUID for API operations |
| **id** | V2 internal UUID |
| **ETag** | Entity version tag for optimistic concurrency |
| **Pre-signed URL** | Time-limited S3 URL for direct upload |

---

*End of Documentation*


---

## 7. Performance Architecture (v2.0)

### 7.1 Cursor-Based Pagination

The migration uses **keyset pagination** instead of offset pagination for efficient large-scale migrations.

**Why Keyset Pagination?**
| Offset Pagination | Keyset Pagination |
|-------------------|-------------------|
| `$skip=1000&$top=50` | `$filter=ID gt 'last-id'&$top=50` |
| Performance degrades with large offsets | Consistent performance |
| Can miss/duplicate records | Stable cursor position |
| Not suitable for 10K+ records | Scales to millions |

**Cursor Structure:**
```
Cursor = (CreationDateTime, LeadID)

Query: $filter=CreationDateTime ge '2025-01-01'
         AND (CreationDateTime gt '{cursorDate}'
              OR (CreationDateTime eq '{cursorDate}' AND ID gt '{cursorId}'))
       &$orderby=CreationDateTime asc,ID asc
       &$top=50
```

### 7.2 Parallel Attachment Processing

| Level | Processing | Why |
|-------|------------|-----|
| **Leads** | Sequential | Maintains cursor order, crash-safe checkpointing |
| **Attachments** | Parallel (5 concurrent) | Speed! Download/upload are I/O bound |

**Performance Improvement:**
- Sequential: 50 leads x 10 attachments x 3s each = ~25 minutes
- Parallel (5): 50 leads x 10 attachments / 5 = ~5 minutes

### 7.3 Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxLeadsPerRun` | 50 | Leads to process per job run |
| `attachmentConcurrency` | 5 | Parallel attachments per lead |
| `delayBetweenLeads` | 500ms | API throttling between leads |
| `delayBetweenAttachments` | 100ms | Delay between parallel attachments |

### 7.4 Lead Status Tracking

Each lead is tracked with status:
- **PENDING** - Not yet processed
- **PROCESSING** - Currently being processed
- **COMPLETED** - All attachments migrated
- **SKIPPED** - Lead not found in V2
- **FAILED** - Error during processing

**Key Benefit:** Once a lead is COMPLETED, it is never re-processed on subsequent runs.

### 7.5 Resume Behavior

```
Scenario: Job crashes after processing 30 of 50 leads

Before (v1.0):
  - Next run starts from beginning
  - Duplicate detection skips attachments
  - Wastes time re-fetching all leads

After (v2.0):
  - Cursor saved at lead #30
  - Next run: $filter=ID gt ''30th-lead-id''
  - Fetches ONLY leads 31-50
  - No wasted work
```

### 7.6 API Usage Example

```bash
# Start migration with cursor-based pagination
curl -X POST "http://localhost:4004/migration/triggerRun" \
  -H "Content-Type: application/json" \
  -d ''{
    "createdFrom": "2025-01-01",
    "createdTo": "2025-12-31",
    "maxLeadsPerRun": 50,
    "resetCursor": false
  }''

# Reset cursor to start from beginning
curl -X POST "http://localhost:4004/migration/triggerRun" \
  -d ''{ "createdFrom": "2025-01-01", "createdTo": "2025-12-31", "resetCursor": true }''
```

---

*Documentation updated for v2.0 - Cursor-based pagination and parallel processing*
