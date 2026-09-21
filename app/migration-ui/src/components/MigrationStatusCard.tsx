import { Card, CardHeader, ObjectStatus, FlexBox, Text } from "@ui5/webcomponents-react";
import type { MigrationStatus } from "../types/migration";
import { formatDateTime, formatRelativeTime, formatDuration } from "../utils/formatDate";
import "@ui5/webcomponents-icons/dist/status-positive.js";
import "@ui5/webcomponents-icons/dist/status-critical.js";
import "@ui5/webcomponents-icons/dist/status-negative.js";

function getStatusDesign(status: string): "Positive" | "Critical" | "Negative" | "Information" {
  switch (status) {
    case "IDLE":
    case "COMPLETED": return "Positive";
    case "RUNNING":   return "Information";
    case "FAILED":    return "Negative";
    case "PAUSED":    return "Critical";
    default:          return "Information";
  }
}

export function MigrationStatusCard({ status }: { status: MigrationStatus }) {
  const hasLastRun = !!status.lastRunId;
  return (
    <Card header={<CardHeader titleText="Migration Status" subtitleText="Last migration run summary" />} style={{ height: "100%" }}>
      <FlexBox direction="Column" style={{ padding: "1rem", gap: "0.75rem" }}>
        {status.status !== "IDLE" && (
          <FlexBox alignItems="Center" justifyContent="Center">
            <ObjectStatus state={getStatusDesign(status.status)} showDefaultIcon style={{ fontSize: "1.25rem" }}>
              {status.status === "RUNNING" ? "Running..." : status.status}
            </ObjectStatus>
          </FlexBox>
        )}

        <FlexBox direction="Column" alignItems="Center" style={{ gap: "0.25rem" }}>
          <Text style={{ color: "var(--sapContent_LabelColor)", fontSize: "0.875rem" }}>
            Last Run: {formatRelativeTime(status.lastRunAt)}
          </Text>
          {status.lastSuccessAt && (
            <Text style={{ color: "var(--sapContent_LabelColor)", fontSize: "0.75rem" }}>
              Last Success: {formatDateTime(status.lastSuccessAt)}
            </Text>
          )}
        </FlexBox>

        {hasLastRun && (
          <FlexBox direction="Column" style={{ gap: "0.35rem", padding: "0.5rem", backgroundColor: "var(--sapBackgroundColor)", borderRadius: "4px" }}>
            <Text style={{ fontSize: "0.7rem", color: "var(--sapContent_LabelColor)", fontFamily: "monospace", wordBreak: "break-all" }}>
              Run: {status.lastRunId}
            </Text>
            <FlexBox style={{ gap: "1rem", flexWrap: "wrap" }}>
              <Text style={{ fontSize: "0.8rem", color: "var(--sapPositiveColor)" }}>
                Migrated: {status.lastRunMigrated}
              </Text>
              <Text style={{
                fontSize: "0.8rem",
                color: status.lastRunFailed > 0 ? "var(--sapNegativeColor)" : "var(--sapContent_LabelColor)",
                fontWeight: status.lastRunFailed > 0 ? "600" : "normal"
              }}>
                Failed: {status.lastRunFailed}
              </Text>
              <Text style={{ fontSize: "0.8rem", color: "var(--sapContent_LabelColor)" }}>
                Duration: {formatDuration(status.lastRunDurationMs)}
              </Text>
            </FlexBox>
          </FlexBox>
        )}
      </FlexBox>
    </Card>
  );
}
