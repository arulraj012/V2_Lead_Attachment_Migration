import { AnalyticalTable, type AnalyticalTableColumnDefinition } from "@ui5/webcomponents-react";
import type { LeadAttachmentAuditLog } from "../types/migration";
import { formatDateTime, formatFileSize } from "../utils/formatDate";

interface MigrationHistoryTableProps {
  records: LeadAttachmentAuditLog[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const columns: AnalyticalTableColumnDefinition[] = [
  { Header: "Lead ID", accessor: "parentDisplayId", width: 100, Cell: (instance: any) => (
    <span style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 500 }}>
      {instance.value}
    </span>
  )},
  { Header: "Attachment", accessor: "fileName", width: 220, Cell: (instance: any) => (
    <span title={instance.value}>{instance.value?.length > 30 ? instance.value.substring(0, 27) + "..." : instance.value}</span>
  )},
  { Header: "Size", accessor: "fileSize", width: 80, Cell: (instance: any) => formatFileSize(instance.value) },
  { Header: "Mode", accessor: "migrationMode", width: 110, Cell: (instance: any) => {
    const isSkipped = instance.value === 'SKIPPED';
    return (
      <span style={{ 
        padding: "0.125rem 0.375rem", 
        borderRadius: "4px", 
        backgroundColor: isSkipped ? "var(--sapNeutralBackground)" : "var(--sapPositiveBackground)", 
        color: isSkipped ? "var(--sapNeutralTextColor)" : "var(--sapPositiveTextColor)",
        fontSize: "0.75rem" 
      }}>
        {instance.value}
      </span>
    );
  }},
  { Header: "Source", accessor: "recordSource", width: 110, Cell: (instance: any) => (
    <span style={{ fontSize: "0.75rem", color: "var(--sapNeutralTextColor)" }}>
      {instance.value}
    </span>
  )},
  { Header: "V2 Attachment ID", accessor: "v2ObjectID", width: 150, Cell: (instance: any) => (
    <span style={{ fontFamily: "monospace", fontSize: "0.7rem", color: instance.value ? "inherit" : "var(--sapNeutralTextColor)" }}>
      {instance.value ? (instance.value.length > 20 ? instance.value.substring(0, 17) + "..." : instance.value) : "—"}
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
