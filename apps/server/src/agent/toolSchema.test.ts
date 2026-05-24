import { describe, expect, test } from "bun:test";

import type { ToolDescriptor } from "@ilms/contracts/tool";

import {
  anthropicToolName,
  toolIdFromAnthropicName,
  toolToAnthropic,
} from "./toolSchema";

const sample: ToolDescriptor = {
  id: "facebook-recover",
  label: "Facebook Recover Lookup",
  description: "Search recovery hints.",
  risk: "tos-grey",
  inputFields: [
    {
      name: "identifier",
      label: "Email, phone, or full name",
      kind: "text",
      required: true,
      placeholder: "x",
    },
    {
      name: "depth",
      label: "Search depth",
      kind: "number",
      required: false,
    },
    {
      name: "mode",
      label: "Mode",
      kind: "select",
      required: true,
      options: [
        { value: "fast", label: "Fast" },
        { value: "deep", label: "Deep" },
      ],
    },
  ],
  requiredSecrets: [
    { key: "facebook.session", label: "Facebook session cookie" },
  ],
};

describe("toolSchema", () => {
  test("hyphens become underscores in tool names", () => {
    expect(anthropicToolName("facebook-recover")).toBe("facebook_recover");
    expect(toolIdFromAnthropicName("facebook_recover")).toBe("facebook-recover");
  });

  test("description carries risk tag and secret keys", () => {
    const spec = toolToAnthropic(sample);
    expect(spec.description).toContain("[tos-grey]");
    expect(spec.description).toContain("facebook.session");
  });

  test("required fields surface in `required` array", () => {
    const spec = toolToAnthropic(sample);
    expect(spec.input_schema.required.sort()).toEqual(["identifier", "mode"].sort());
  });

  test("field kinds map to JSON Schema types", () => {
    const spec = toolToAnthropic(sample);
    expect(spec.input_schema.properties.identifier?.type).toBe("string");
    expect(spec.input_schema.properties.depth?.type).toBe("number");
    expect(spec.input_schema.properties.mode?.type).toBe("string");
  });

  test("select fields expose an enum", () => {
    const spec = toolToAnthropic(sample);
    expect(spec.input_schema.properties.mode?.enum).toEqual(["fast", "deep"]);
  });
});
