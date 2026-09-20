# V2 Lead Attachment Migration

SAP CAP application for migrating Lead Attachments from SAP C4C V1 to SAP Sales/Service Cloud V2.

## Architecture

This project uses a **reusable migration framework** that can be extended for other object types.

### CDS Schema Structure

```
db/
├── common/
│   ├── types.cds       # Reusable enums (MigrationStatus, ObjectType, ErrorStep, etc.)
│   └── aspects.cds     # Reusable aspects (timestamped, v1Source, v2Target, errorTracked)
├── base/
│   └── migration-base.cds  # Generic entities (Checkpoint, RunHistory, BatchConfig, etc.)
├── lead/
│   └── lead-attachment.cds # Lead-specific entities (LeadAttachmentAuditLog, etc.)
└── index.cds           # Main entry point
```

### Reusability

The `common/` and `base/` folders contain generic migration framework components that can be reused:

- **Types**: `MigrationStatus`, `ObjectType`, `MigrationMode`, `ErrorStep`, `TriggerSource`
- **Aspects**: `timestamped`, `v1Source`, `v2Target`, `errorTracked`, `attachmentMeta`
- **Base Entities**: `Checkpoint`, `FailedRecord`, `AuditLog`, `RunHistory`, `BatchConfig`

To create a new migration (e.g., Ticket Attachments):
1. Copy `common/` and `base/` folders
2. Create new object-specific folder (e.g., `ticket/`)
3. Extend base entities with object-specific fields

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
