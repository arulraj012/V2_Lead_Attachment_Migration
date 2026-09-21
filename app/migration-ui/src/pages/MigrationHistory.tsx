import { useState } from "react";
import { FlexBox, Title, Button } from "@ui5/webcomponents-react";
import { useMigrationHistory } from "../hooks/useMigrationHistory";
import { MigrationHistoryTable } from "../components/MigrationHistoryTable";
import { PageLoading } from "../components/PageLoading";
import { PageError } from "../components/PageError";
import "@ui5/webcomponents-icons/dist/refresh.js";
import "@ui5/webcomponents-icons/dist/navigation-left-arrow.js";
import "@ui5/webcomponents-icons/dist/navigation-right-arrow.js";

const PAGE_SIZE = 25;

export function MigrationHistory() {
  const [page, setPage] = useState(0);
  const { data, isLoading, error, refetch } = useMigrationHistory({ top: PAGE_SIZE, skip: page * PAGE_SIZE });

  if (isLoading && !data) {
    return <PageLoading message="Loading migration history..." />;
  }

  if (error && !data) {
    return <PageError error={error} title="Failed to load history" onRetry={() => refetch()} />;
  }

  const totalPages = Math.ceil((data?.count || 0) / PAGE_SIZE);

  return (
    <FlexBox direction="Column" style={{ gap: "1rem", maxWidth: "1200px" }}>
      <FlexBox justifyContent="SpaceBetween" alignItems="Center">
        <Title level="H3">Migration History ({data?.count || 0} attachments)</Title>
        <Button icon="refresh" design="Transparent" onClick={() => refetch()}>
          Refresh
        </Button>
      </FlexBox>

      <MigrationHistoryTable records={data?.records || []} />

      {totalPages > 1 && (
        <FlexBox justifyContent="Center" alignItems="Center" style={{ marginTop: "1rem", gap: "0.5rem" }}>
          <Button
            icon="navigation-left-arrow"
            design="Transparent"
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
          />
          <span style={{ padding: "0 1rem" }}>Page {page + 1} of {totalPages}</span>
          <Button
            icon="navigation-right-arrow"
            design="Transparent"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          />
        </FlexBox>
      )}
    </FlexBox>
  );
}
