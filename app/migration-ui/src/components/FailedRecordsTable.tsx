import { useState } from "react";
import { AnalyticalTable, Button, Dialog, Bar, Title, Text, type AnalyticalTableColumnDefinition } from "@ui5/webcomponents-react";
import type { LeadAttachmentFailedRecord } from "../types/migration";
import { formatDateTime, formatFileSize } from "../utils/formatDate";
import { useMigrationActions } from "../hooks/useMigrationActions";
import "@ui5/webcomponents-icons/dist/redo.js";
import "@ui5/webcomponents-icons/dist/detail-view.js";

interface FailedRecordsTableProps {
  records: LeadAttachmentFailedRecord[];
  onRefresh: () => void;
}

export function FailedRecordsTable({ records, onRefresh }: FailedRecordsTableProps) {
  const { retryFailed, isRetrying } = useMigrationActions();
  const [selectedRecord, setSelectedRecord] = useState<LeadAttachmentFailedRecord | null>(null);

  const handleRetry = async (recordId: string) => {
    try {
      await retryFailed(recordId);
      onRefresh();
    } catch (err) {
      console.error("Retry failed:", err);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: AnalyticalTableColumnDefinition[] = [
    { Header: "Lead ID", accessor: "parentDisplayId", width: 150, Cell: (instance: any) => (
      <span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
        {instance.row.original.parentDisplayId || instance.row.original.v1DisplayId || "-"}
      </span>
    )},
    { Header: "Attachment", accessor: "fileName", width: 200, Cell: (instance: any) => (
      <span title={instance.value}>{instance.value?.length > 30 ? instance.value.substring(0, 27) + "..." : instance.value}</span>
    )},
    { Header: "Size", accessor: "fileSize", width: 80, Cell: (instance: any) => formatFileSize(instance.value) },
    { Header: "Error Step", accessor: "errorStep", width: 100, Cell: (instance: any) => (
      <span style={{ padding: "0.125rem 0.375rem", borderRadius: "4px", backgroundColor: "var(--sapNegativeBackground)", color: "var(--sapNegativeColor)", fontSize: "0.75rem" }}>
        {instance.value}
      </span>
    )},
    { Header: "Retries", accessor: "retryCount", width: 70 },
    { Header: "Created", accessor: "createdAt", width: 150, Cell: (instance: any) => formatDateTime(instance.value) },
    { Header: "Actions", accessor: "ID", width: 100, Cell: (instance: any) => (
      <>
        <Button icon="detail-view" design="Transparent" onClick={() => setSelectedRecord(instance.row.original)} />
        <Button icon="redo" design="Transparent" disabled={isRetrying} onClick={() => handleRetry(instance.row.original.ID)} />
      </>
    )},
  ];

  return (
    <>
      <AnalyticalTable
        columns={columns}
        data={records}
        minRows={1}
        visibleRows={Math.min(records.length || 5, 20)}
        noDataText="No failed records"
      />

      <Dialog
        open={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        headerText="Failed Record Details"
        footer={<Bar endContent={<Button design="Emphasized" onClick={() => setSelectedRecord(null)}>Close</Button>} />}
      >
        {selectedRecord && (
          <div style={{ padding: "1rem", minWidth: "400px" }}>
            <div style={{ marginBottom: "1rem" }}>
              <Title level="H6">Lead Information</Title>
              <Text>Lead ID: {selectedRecord.parentDisplayId || "-"}</Text><br/>
              <Text>V1 Attachment ID: {selectedRecord.v1ObjectID}</Text>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Title level="H6">Attachment</Title>
              <Text>Name: {selectedRecord.fileName}</Text><br/>
              <Text>Size: {formatFileSize(selectedRecord.fileSize)}</Text><br/>
              <Text>MIME Type: {selectedRecord.mimeType}</Text>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <Title level="H6">Error Details</Title>
              <Text>Step: {selectedRecord.errorStep}</Text><br/>
              <Text style={{ color: "var(--sapNegativeColor)", wordBreak: "break-word" }}>
                {selectedRecord.errorMessage}
              </Text>
            </div>
            <div>
              <Title level="H6">Retry Info</Title>
              <Text>Retry Count: {selectedRecord.retryCount}</Text><br/>
              <Text>First Failed: {formatDateTime(selectedRecord.createdAt)}</Text>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
