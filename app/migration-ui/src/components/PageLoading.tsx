import { FlexBox, BusyIndicator } from "@ui5/webcomponents-react";

export function PageLoading({ message = "Loading..." }: { message?: string }) {
  return (
    <FlexBox direction="Column" alignItems="Center" justifyContent="Center" style={{ height: "200px" }}>
      <BusyIndicator active size="L" />
      <span style={{ marginTop: "1rem", color: "var(--sapContent_LabelColor)" }}>{message}</span>
    </FlexBox>
  );
}
