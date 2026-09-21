import { FlexBox, Title } from "@ui5/webcomponents-react";
import { useMigrationStatus } from "../hooks/useMigrationStatus";
import { useRunHistory } from "../hooks/useRunHistory";
import { MigrationStatusCard } from "../components/MigrationStatusCard";
import { DashboardCards } from "../components/DashboardCards";
import { MigrationControls } from "../components/MigrationControls";
import { RunHistoryTable } from "../components/RunHistoryTable";
import { PageLoading } from "../components/PageLoading";
import { PageError } from "../components/PageError";

export function Dashboard() {
  const { data: status, isLoading, error, refetch } = useMigrationStatus();
  const { data: runHistoryData, isLoading: runHistoryLoading, refetch: refetchRunHistory } = useRunHistory({ top: 10 });

  if (isLoading && !status) {
    return <PageLoading message="Loading migration status..." />;
  }

  if (error && !status) {
    return <PageError error={error} title="Failed to load migration status" onRetry={() => refetch()} />;
  }

  if (!status) {
    return <PageError error="No status data available" onRetry={() => refetch()} />;
  }

  return (
    <FlexBox direction="Column" style={{ gap: "1.5rem", maxWidth: "1200px" }}>
      <Title level="H3">Lead Attachment Migration Dashboard</Title>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "stretch" }}>
        <div style={{ flex: "1 1 300px", minWidth: "280px", display: "flex", flexDirection: "column" }}>
          <MigrationStatusCard status={status} />
        </div>
        <div style={{ flex: "2 1 400px", minWidth: "350px", display: "flex", flexDirection: "column" }}>
          <DashboardCards
            totalMigrated={status.totalMigrated}
            pendingFailed={status.pendingFailed}
            pendingInQueue={status.pendingInQueue}
          />
        </div>
      </div>

      <div>
        <Title level="H5" style={{ marginBottom: "0.75rem" }}>Migration Actions</Title>
        <MigrationControls
          isRunning={status.status === "RUNNING"}
          pendingFailed={status.pendingFailed}
          onRefresh={() => refetch()}
        />
      </div>

      <div>
        <RunHistoryTable
          records={runHistoryData?.records || []}
          count={runHistoryData?.count || 0}
          onRefresh={() => refetchRunHistory()}
          isLoading={runHistoryLoading}
        />
      </div>
    </FlexBox>
  );
}
