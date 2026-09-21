import { useState, useEffect } from "react";
import { Card, CardHeader, FlexBox, Input, Button, Label, Switch, MessageStrip } from "@ui5/webcomponents-react";
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
    <Card header={<CardHeader titleText="Batch Processing Configuration" subtitleText="Configure migration batch settings" />}>
      <FlexBox direction="Column" style={{ padding: "1rem", gap: "1rem" }}>
        {message && (
          <MessageStrip design={message.type} hideCloseButton>{message.text}</MessageStrip>
        )}

        <FlexBox direction="Column" style={{ gap: "0.5rem" }}>
          <Label>Batch Size</Label>
          <Input
            type="Number"
            value={String(config.batchSize)}
            onChange={(e) => setConfig({ ...config, batchSize: parseInt((e.target as unknown as { value: string }).value) || 10 })}
            style={{ width: "200px" }}
          />
        </FlexBox>

        <FlexBox direction="Column" style={{ gap: "0.5rem" }}>
          <Label>Max Records Per Run</Label>
          <Input
            type="Number"
            value={String(config.maxRecordsPerRun)}
            onChange={(e) => setConfig({ ...config, maxRecordsPerRun: parseInt((e.target as unknown as { value: string }).value) || 100 })}
            style={{ width: "200px" }}
          />
        </FlexBox>

        <FlexBox direction="Column" style={{ gap: "0.5rem" }}>
          <Label>Delay Between Batches (ms)</Label>
          <Input
            type="Number"
            value={String(config.delayBetweenBatches)}
            onChange={(e) => setConfig({ ...config, delayBetweenBatches: parseInt((e.target as unknown as { value: string }).value) || 1000 })}
            style={{ width: "200px" }}
          />
        </FlexBox>

        <FlexBox direction="Column" style={{ gap: "0.5rem" }}>
          <Label>Delay Between Records (ms)</Label>
          <Input
            type="Number"
            value={String(config.delayBetweenRecords)}
            onChange={(e) => setConfig({ ...config, delayBetweenRecords: parseInt((e.target as unknown as { value: string }).value) || 100 })}
            style={{ width: "200px" }}
          />
        </FlexBox>

        <FlexBox alignItems="Center" style={{ gap: "0.75rem" }}>
          <Switch
            checked={config.isActive}
            onChange={(e) => setConfig({ ...config, isActive: (e.target as unknown as { checked: boolean }).checked })}
          />
          <Label>Migration Active</Label>
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
