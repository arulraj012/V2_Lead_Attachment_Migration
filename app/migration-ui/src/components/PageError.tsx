import { FlexBox, Button, Text, IllustratedMessage } from "@ui5/webcomponents-react";
import "@ui5/webcomponents-fiori/dist/illustrations/ErrorScreen.js";

interface PageErrorProps {
  error: Error | string | null;
  title?: string;
  onRetry?: () => void;
}

export function PageError({ error, title = "An error occurred", onRetry }: PageErrorProps) {
  const errorMessage = error instanceof Error ? error.message : error;
  
  return (
    <FlexBox direction="Column" alignItems="Center" justifyContent="Center" style={{ height: "300px", gap: "1rem" }}>
      <IllustratedMessage name="ErrorScreen" titleText={title} subtitleText="" />
      <Text style={{ color: "var(--sapNegativeColor)", maxWidth: "400px", textAlign: "center" }}>
        {errorMessage}
      </Text>
      {onRetry && <Button design="Emphasized" onClick={onRetry}>Retry</Button>}
    </FlexBox>
  );
}
