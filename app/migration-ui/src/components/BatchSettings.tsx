import { useState, useEffect } from "react";
import { Card, CardHeader, FlexBox, Input, Button, Label, MessageStrip, Text } from "@ui5/webcomponents-react";
import { getBatchConfig, updateBatchConfig } from "../services/migrationApi";
import type { BatchConfig } from "../types/migration";

export function BatchSettings() {
  const [config, setConfig] = useState<BatchConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "Positive" | "Negative"; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await getBatchConfig();
      setConfig(data);
    } catch (err) {
      setMessage({ type: "Negative", text: err instanceof Error ? err.message : "Failed to load config" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);
      setMessage(null);
      await updateBatchConfig(config);
      setMessage({ type: "Positive", text: "Configuration saved successfully" });
    } catch (err) {
      setMessage({ type: "Negative", text: err instanceof Error ? err.message : "Failed to save config" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div>Loading configuration...</div>;
  }

  if (!config) {
    return <div>Failed to load configuration</div>;
  }

  return (
    <Card header={<CardHeader titleText="Migration Configuration" subtitleText="Configure batch processing and API throttling" />}>
      <FlexBox direction="Column" style={{ padding: "1rem", gap: "1.25rem" }}>
        {message && (
          <MessageStrip design={message.type} hideCloseButton>{message.text}</MessageStrip>
        )}

        {/* Batch Processing Section */}
        <Text style={{ fontWeight: "bold", fontSize: "0.875rem", color: "#666" }}>Batch Processing</Text>
        
        <FlexBox direction="Column" style={{ gap: "0.25rem" }}>
          <Label>Max Leads Per Run</Label>
          <Input
            type="Number"
            value={String(config.maxLeadsPerRun || 50)}
            onChange={(e) => setConfig({ ...config, maxLeadsPerRun: parseInt((e.target as unknown as { value: string }).value) || 50 })}
            style={{ width: "200px" }}
          />
          <Text style={{ fontSize: "0.75rem", color: "#888" }}>Number of leads to process per migration run (1-200)</Text>
        </FlexBox>

        <FlexBox direction="Column" style={{ gap: "0.25rem" }}>
          <Label>Attachment Concurrency</Label>
          <Input
            type="Number"
            value={String(config.attachmentConcurrency || 5)}
            onChange={(e) => setConfig({ ...config, attachmentConcurrency: parseInt((e.target as unknown as { value: string }).value) || 5 })}
            style={{ width: "200px" }}
          />
          <Text style={{ fontSize: "0.75rem", color: "#888" }}>Parallel attachment uploads per lead (1-10)</Text>
        </FlexBox>

        {/* API Throttling Section */}
        <Text style={{ fontWeight: "bold", fontSize: "0.875rem", color: "#666", marginTop: "0.5rem" }}>API Throttling</Text>

        <FlexBox direction="Column" style={{ gap: "0.25rem" }}>
          <Label>Delay Between Leads (ms)</Label>
          <Input
            type="Number"
            value={String(config.delayBetweenLeads ?? 500)}
            onChange={(e) => setConfig({ ...config, delayBetweenLeads: parseInt((e.target as unknown as { value: string }).value) || 0 })}
            style={{ width: "200px" }}
          />
          <Text style={{ fontSize: "0.75rem", color: "#888" }}>Wait time after processing each lead (0 = no delay)</Text>
        </FlexBox>

        <FlexBox direction="Column" style={{ gap: "0.25rem" }}>
          <Label>Delay Between Attachments (ms)</Label>
          <Input
            type="Number"
            value={String(config.delayBetweenAttachments ?? 100)}
            onChange={(e) => setConfig({ ...config, delayBetweenAttachments: parseInt((e.target as unknown as { value: string }).value) || 0 })}
            style={{ width: "200px" }}
          />
          <Text style={{ fontSize: "0.75rem", color: "#888" }}>Wait time between attachment uploads (0 = no delay)</Text>
        </FlexBox>

        <FlexBox style={{ marginTop: "1rem" }}>
          <Button design="Emphasized" disabled={saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
        </FlexBox>
      </FlexBox>
    </Card>
  );
}
