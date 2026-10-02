import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../types";
import {
  getModelOptions,
  hasSameProviderConfig,
  selectActiveModel,
  selectProvider,
} from "./model-selection";

describe("composer model selection", () => {
  it("switches providers without changing their saved models", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    const next = selectProvider(settings, "anthropic");

    expect(next.provider).toBe("anthropic");
    expect(next.providers).toBe(settings.providers);
    expect(settings.provider).toBe("gemini");
  });

  it("changes only the active provider model", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.provider = "openai";
    const next = selectActiveModel(settings, "gpt-custom");

    expect(next.providers.openai.model).toBe("gpt-custom");
    expect(next.providers.gemini).toBe(settings.providers.gemini);
    expect(settings.providers.openai.model).toBe("gpt-4.1-mini");
  });

  it("retains a selected custom model alongside discovered models", () => {
    expect(
      getModelOptions([{ id: "model-a", name: "Model A" }], "custom-model"),
    ).toEqual([
      { id: "custom-model", name: "Saved or custom model" },
      { id: "model-a", name: "Model A" },
    ]);
  });

  it("does not duplicate a selected discovered model", () => {
    const models = [{ id: "model-a" }, { id: "model-b" }];
    expect(getModelOptions(models, "model-b")).toBe(models);
  });

  it("rejects catalog results from a changed provider connection", () => {
    const snapshot = structuredClone(DEFAULT_SETTINGS);
    snapshot.provider = "local";
    const changed = structuredClone(snapshot);
    changed.providers.local.endpoint = "http://localhost:1234/v1";

    expect(hasSameProviderConfig(snapshot, snapshot, "local")).toBe(true);
    expect(hasSameProviderConfig(changed, snapshot, "local")).toBe(false);
  });
});
