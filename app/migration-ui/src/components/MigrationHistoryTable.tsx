import { AnalyticalTable, type AnalyticalTableColumnDefinition } from "@ui5/webcomponents-react";
import type { LeadAttachmentAuditLog } from "../types/migration";
import { formatDateTime, formatFileSize } from "../utils/formatDate";

interface MigrationHistoryTableProps {
  records: LeadAttachmentAuditLog[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const columns: AnalyticalTableColumnDefinition[] = [
  { Header: "V1 Lead", accessor: "v1DisplayId", width: 150, Cell: (instance: any) => (
    <span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
      {instance.row.original.v1DisplayId || instance.row.original.v1ObjectID.substring(0, 12) + "..."}
    </span>
  )},
  { Header: "V2 Lead", accessor: "v2DisplayId", width: 150, Cell: (instance: any) => (
    <span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
      {instance.row.original.v2DisplayId || instance.row.original.v2ObjectID.substring(0, 12) + "..."}
    </span>
  )},
  { Header: "Attachment", accessor: "attachmentName", width: 200, Cell: (instance: any) => (
    <span title={instance.value}>{instance.value?.length > 25 ? instance.value.substring(0, 22) + "..." : instance.value}</span>
  )},
  { Header: "Size", accessor: "attachmentSize", width: 80, Cell: (instance: any) => formatFileSize(instance.value) },
  { Header: "Mode", accessor: "migrationMode", width: 100, Cell: (instance: any) => (
    <span style={{ padding: "0.125rem 0.375rem", borderRadius: "4px", backgroundColor: "var(--sapInformationBackground)", fontSize: "0.75rem" }}>
      {instance.value}
    </span>
  )},
  { Header: "Migrated At", accessor: "createdAt", width: 150, Cell: (instance: any) => formatDateTime(instance.value) },
];

export function MigrationHistoryTable({ records }: MigrationHistoryTableProps) {
  return (
    <AnalyticalTable
      columns={columns}
      data={records}
      minRows={1}
      visibleRows={Math.min(records.length || 5, 25)}
      noDataText="No migration history available"
    />
  );
}
