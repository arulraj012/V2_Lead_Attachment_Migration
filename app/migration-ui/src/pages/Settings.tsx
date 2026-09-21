import { FlexBox, Title } from "@ui5/webcomponents-react";
import { BatchSettings } from "../components/BatchSettings";

export function Settings() {
  return (
    <FlexBox direction="Column" style={{ gap: "1.5rem", maxWidth: "800px" }}>
      <Title level="H3">Settings</Title>
      <BatchSettings />
    </FlexBox>
  );
}
