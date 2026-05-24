import type { ToolDescriptor, ToolInputField } from "@ilms/contracts/tool";

/**
 * Anthropic tool spec — the subset of JSON Schema the API needs. Generated
 * from a ToolDescriptor's inputFields so we don't have to maintain a second
 * schema per driver.
 */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, FieldSchema>;
    required: string[];
  };
}

interface FieldSchema {
  type: "string" | "number";
  description?: string;
  enum?: string[];
}

function fieldToSchema(field: ToolInputField): FieldSchema {
  const schema: FieldSchema = {
    type: field.kind === "number" ? "number" : "string",
  };
  const description = [field.label, field.help].filter(Boolean).join(" — ") || undefined;
  if (description) schema.description = description;
  if (field.kind === "select" && field.options) {
    schema.enum = field.options.map((o) => o.value);
  }
  return schema;
}

/**
 * Convert a ToolDescriptor to an Anthropic tool spec. Tool names use the
 * descriptor id with `-` replaced by `_` because Anthropic restricts tool
 * names to [a-zA-Z0-9_-]{1,64} but some SDKs choke on hyphens; underscores
 * are always safe.
 */
export function toolToAnthropic(descriptor: ToolDescriptor): AnthropicTool {
  const properties: Record<string, FieldSchema> = {};
  const required: string[] = [];
  for (const field of descriptor.inputFields) {
    properties[field.name] = fieldToSchema(field);
    if (field.required) required.push(field.name);
  }
  return {
    name: anthropicToolName(descriptor.id),
    description:
      `[${descriptor.risk}] ${descriptor.description}` +
      (descriptor.requiredSecrets.length > 0
        ? ` (requires secrets: ${descriptor.requiredSecrets.map((s) => s.key).join(", ")})`
        : ""),
    input_schema: { type: "object", properties, required },
  };
}

export function anthropicToolName(toolId: string): string {
  return toolId.replace(/-/g, "_");
}

export function toolIdFromAnthropicName(name: string): string {
  return name.replace(/_/g, "-");
}
