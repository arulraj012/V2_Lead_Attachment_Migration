# V2 Lead Attachment Migration

SAP CAP application for migrating **Attachments** from SAP C4C V1 to SAP Sales/Service Cloud V2.

## Important: DTT vs This Tool

| What | Migrated By |
|------|-------------|
| **Leads, Tickets, Accounts, Contacts** | DTT (Data Transfer Tool) |
| **Attachments** (Lead, Ticket, etc.) | **This Application** |

**Key Point**: DTT preserves the `displayId` when migrating objects. So:
- V1 `Lead.ID` = V2 `Lead.displayId`
- No ID mapping is needed - we look up V2 objects by `displayId`

## Architecture

### Key Features

- **Attachment-Only Migration**: Migrates attachments for objects already in V2 (via DTT)
- **Duplicate Detection**: Multi-level checks (audit log → filename → content hash → V2 API)
- **V2 Document Service**: Proper 4-step upload flow (create metadata → S3 upload → verify → link)
- **Parent Tracking**: Tracks migration progress per parent (Lead, Ticket, etc.)

### CDS Schema Structure

```
db/
└── schema.cds
    ├── Types & Enums         # MigrationStatus, ObjectType (attachment types only), ErrorStep
    ├── Aspects               # timestamped, v1Source, v2Target, parentRef, attachmentMeta
    ├── Base Entities         # Checkpoint, RunHistory, BatchConfig, MappingConfig
    ├── Generic Entities      # ObjectAuditLog, ObjectFailedRecord, ObjectQueue
    ├── ParentMigrationStatus # Track attachment progress per parent (Lead, Ticket)
    └── Views                 # LeadAttachmentAuditLog, LeadMigrationProgress, etc.
```

### Service Layer

```
srv/
├── migration-service.cds    # CAP service definition
├── migration-service.js     # Service handlers
└── migration/
    ├── MigrationJob.js              # Core migration orchestration
    ├── CheckpointService.js         # State management & audit logging
    ├── DuplicateDetectionService.js # Prevent re-migration
    ├── FieldMappingService.js       # Field transformation (optional)
    ├── V2DocumentService.js         # V2 4-step upload flow (generic)
    ├── V2LeadClient.js              # Lead-specific V2 operations
    ├── V1LeadClient.js              # V1 Lead/Attachment fetch
    └── DestinationService.js        # BTP destination resolution
```

### V2 Document Service Upload Flow

The V2 API requires a 4-step process for uploading attachments:

```
Step 1: POST /document-service/documents
        → Create metadata, get uploadUrl (S3 pre-signed URL)

Step 2: PUT {uploadUrl}
        → Upload binary content to S3 (NO authentication)

Step 3: GET /document-service/documents/{id}
        → Verify status is ACTIVE (retry until ready)

Step 4: PATCH /lead-service/leads/{id}
        → Link document to Lead (or other entity)
```

### Migration Flow

```
1. Fetch Leads with attachments from V1
2. For each Lead:
   a. Find V2 Lead by displayId (same as V1 LeadID)
   b. If V2 Lead not found → skip all attachments
   c. For each attachment:
      - Check if already migrated (audit log, filename, hash)
      - Download from V1
      - Upload to V2 (4-step document service)
      - Record success/failure
```

### Adding New Object Types

To add migration for Ticket Attachments:

1. **No schema changes** - use `objectType = 'TICKET_ATTACHMENT'`
2. Create `V2TicketClient.js` with entity config: `{ entityService: 'case-service', entityPath: 'cases' }`
3. Update `MigrationJob.js` to handle the new type

## Setup

### Prerequisites
- Node.js >= 20
- SAP BTP account with HANA Cloud
- V1 C4C system access
- V2 Sales/Service Cloud system access

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment template:
   ```bash
   cp .env.example .env
   ```

3. Configure `.env` with your credentials

4. Run locally:
   ```bash
   npm run watch
   ```

### BTP Deployment

1. Build MTA:
   ```bash
   npm run build:mta
   ```

2. Deploy:
   ```bash
   cf deploy *.mtar
   ```

3. Configure BTP Destinations:
   - `V1_C4C`: V1 system URL with Basic Auth
   - `V2_SSCV2`: V2 system URL with Basic Auth

## API Endpoints

### Migration Control
- `POST /migration/triggerRun` - Start migration
- `GET /migration/getStatus()` - Get current status
- `POST /migration/retryFailed` - Retry failed record
- `POST /migration/runMigration` - CPI/Job trigger endpoint

### Configuration
- `GET /migration/getBatchConfig()` - Get batch settings
- `POST /migration/updateBatchConfig` - Update batch settings

## License

UNLICENSED - Internal use only
