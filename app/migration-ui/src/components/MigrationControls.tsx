import { useState } from "react";
import { Button, Input, FlexBox, MessageStrip } from "@ui5/webcomponents-react";
import { useMigrationActions } from "../hooks/useMigrationActions";
import "@ui5/webcomponents-icons/dist/play.js";
import "@ui5/webcomponents-icons/dist/refresh.js";
import "@ui5/webcomponents-icons/dist/redo.js";

interface MigrationControlsProps {
  isRunning: boolean;
  pendingFailed: number;
  onRefresh: () => void;
}

export function MigrationControls({ isRunning, pendingFailed, onRefresh }: MigrationControlsProps) {
  const { triggerMigration, retryAllFailed, isTriggering, isRetrying } = useMigrationActions();
  const [leadId, setLeadId] = useState("");
  const [message, setMessage] = useState<{ type: "Positive" | "Negative"; text: string } | null>(null);

  const handleTrigger = async (mode: string) => {
    try {
      setMessage(null);
      const result = await triggerMigration({ mode, leadId: leadId || undefined });
      setMessage({ type: "Positive", text: result.message || "Migration triggered successfully" });
      setLeadId("");
      onRefresh();
    } catch (err) {
      setMessage({ type: "Negative", text: err instanceof Error ? err.message : "Failed to trigger migration" });
    }
  };

  const handleRetryAll = async () => {
    try {
      setMessage(null);
      await retryAllFailed();
      setMessage({ type: "Positive", text: "Retry all failed initiated" });
      onRefresh();
    } catch (err) {
      setMessage({ type: "Negative", text: err instanceof Error ? err.message : "Failed to retry" });
    }
  };

  return (
    <FlexBox direction="Column" style={{ gap: "1rem" }}>
      {message && (
        <MessageStrip design={message.type} hideCloseButton>
          {message.text}
        </MessageStrip>
      )}
      
      <FlexBox style={{ gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.75rem", color: "var(--sapContent_LabelColor)", marginBottom: "0.25rem" }}>
            Specific Lead ID (optional)
          </label>
          <Input
            value={leadId}
            placeholder="e.g., 00163E03-A070-1EE5-B5B5-..."
            style={{ width: "300px" }}
            onInput={(e) => setLeadId((e.target as unknown as { value: string }).value)}
          />
        </div>
        
        <Button
          icon="play"
          design="Emphasized"
          disabled={isRunning || isTriggering}
          onClick={() => handleTrigger(leadId ? "single" : "full")}
        >
          {leadId ? "Migrate Lead" : "Run Full Migration"}
        </Button>
        
        <Button
          icon="redo"
          design="Attention"
          disabled={isRunning || isRetrying || pendingFailed === 0}
          onClick={handleRetryAll}
        >
          Retry All Failed ({pendingFailed})
        </Button>
        
        <Button icon="refresh" design="Transparent" onClick={onRefresh}>
          Refresh
        </Button>
      </FlexBox>
    </FlexBox>
  );
}
