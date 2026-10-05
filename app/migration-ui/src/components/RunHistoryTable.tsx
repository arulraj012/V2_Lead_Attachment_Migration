import { AnalyticalTable, ObjectStatus, Button, Title, type AnalyticalTableColumnDefinition } from "@ui5/webcomponents-react";
import type { RunHistory } from "../types/migration";
import { formatDateTime, formatDuration } from "../utils/formatDate";
import "@ui5/webcomponents-icons/dist/refresh.js";

interface RunHistoryTableProps {
  records: RunHistory[];
  count: number;
  onRefresh: () => void;
  isLoading: boolean;
}

function getStatusDesign(status: string): "Positive" | "Negative" | "Information" {
  switch (status) {
    case "COMPLETED": return "Positive";
    case "FAILED":    return "Negative";
    default:          return "Information";
  }
}

function truncateError(msg: string | null | undefined, maxLen: number = 40): string {
  if (!msg) return "";
  return msg.length > maxLen ? msg.substring(0, maxLen - 3) + "..." : msg;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const columns: AnalyticalTableColumnDefinition[] = [
  { Header: "Run ID", accessor: "runId", width: 100, Cell: (instance: any) => (
    <span 
      style={{ fontFamily: "monospace", fontSize: "0.75rem", cursor: "pointer", textDecoration: "underline dotted" }} 
      title={`Click to copy: ${instance.value}`}
      onClick={() => copyToClipboard(instance.value)}
    >
      {instance.value?.substring(0, 8)}...
    </span>
  )},
  { Header: "Mode", accessor: "mode", width: 80 },
  { Header: "Status", accessor: "status", width: 90, Cell: (instance: any) => (
    <ObjectStatus state={getStatusDesign(instance.value)}>{instance.value}</ObjectStatus>
  )},
  { Header: "Started", accessor: "startedAt", width: 130, Cell: (instance: any) => formatDateTime(instance.value) },
  { Header: "Duration", accessor: "durationMs", width: 70, Cell: (instance: any) => formatDuration(instance.value) },
  { Header: "Total", accessor: "total", width: 50, Cell: (instance: any) => {
    const row = instance.row.original;
    const total = (row.migrated || 0) + (row.failed || 0) + (row.skipped || 0);
    return <span style={{ fontWeight: "500" }}>{total}</span>;
  }},
  { Header: "Migrated", accessor: "migrated", width: 65, Cell: (instance: any) => (
    <span style={{ color: "var(--sapPositiveColor)" }}>{instance.value}</span>
  )},
  { Header: "Skipped", accessor: "skipped", width: 60, Cell: (instance: any) => (
    <span style={{ color: instance.value > 0 ? "var(--sapCriticalColor)" : undefined }}>{instance.value || 0}</span>
  )},
  { Header: "Failed", accessor: "failed", width: 50, Cell: (instance: any) => (
    <span style={{ color: instance.value > 0 ? "var(--sapNegativeColor)" : undefined }}>{instance.value}</span>
  )},
  { Header: "Error", accessor: "errorMessage", width: 180, Cell: (instance: any) => (
    instance.value ? (
      <span style={{ color: "var(--sapNegativeColor)", fontSize: "0.75rem", cursor: "help" }} title={instance.value}>
        {truncateError(instance.value)}
      </span>
    ) : null
  )},
];

export function RunHistoryTable({ records, onRefresh, isLoading }: RunHistoryTableProps) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <Title level="H5">Recent Runs</Title>
        <Button icon="refresh" design="Transparent" onClick={onRefresh} disabled={isLoading}>Refresh</Button>
      </div>

      <AnalyticalTable
        columns={columns}
        data={records}
        minRows={1}
        visibleRows={Math.min(records.length || 5, 10)}
        noDataText="No run history available"
      />
    </div>
  );
}
