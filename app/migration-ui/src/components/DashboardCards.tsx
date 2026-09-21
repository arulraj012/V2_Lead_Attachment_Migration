import { Card, CardHeader, FlexBox, Text } from "@ui5/webcomponents-react";
import "@ui5/webcomponents-icons/dist/accept.js";
import "@ui5/webcomponents-icons/dist/error.js";
import "@ui5/webcomponents-icons/dist/attachment.js";

interface StatCardProps {
  title: string;
  subtitle: string;
  value: number;
  color?: "positive" | "negative" | "neutral";
}

function StatCard({ title, subtitle, value, color = "neutral" }: StatCardProps) {
  const colorMap = {
    positive: "var(--sapPositiveColor)",
    negative: "var(--sapNegativeColor)",
    neutral: "var(--sapTextColor)",
  };

  return (
    <Card header={<CardHeader titleText={title} subtitleText={subtitle} />} style={{ height: "100%" }}>
      <FlexBox direction="Column" alignItems="Center" justifyContent="Center" style={{ padding: "1rem" }}>
        <Text style={{ fontSize: "2.5rem", fontWeight: "bold", color: colorMap[color] }}>
          {value.toLocaleString()}
        </Text>
      </FlexBox>
    </Card>
  );
}

interface DashboardCardsProps {
  totalMigrated: number;
  pendingFailed: number;
  pendingInQueue?: number;
}

export function DashboardCards({ totalMigrated, pendingFailed, pendingInQueue }: DashboardCardsProps) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: "1rem", height: "100%" }}>
      <div style={{ flex: "1 1 200px", minWidth: "180px", display: "flex", flexDirection: "column" }}>
        <StatCard title="Total Migrated" subtitle="Attachments completed" value={totalMigrated} color="positive" />
      </div>
      <div style={{ flex: "1 1 200px", minWidth: "180px", display: "flex", flexDirection: "column" }}>
        <StatCard title="Pending Failed" subtitle="Awaiting retry" value={pendingFailed} color={pendingFailed > 0 ? "negative" : "positive"} />
      </div>
      {pendingInQueue !== undefined && (
        <div style={{ flex: "1 1 200px", minWidth: "180px", display: "flex", flexDirection: "column" }}>
          <StatCard title="In Queue" subtitle="Pending migration" value={pendingInQueue} color="neutral" />
        </div>
      )}
    </div>
  );
}
