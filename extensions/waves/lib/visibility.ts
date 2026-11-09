// Visibility policy ported from firstmate Calm (MIT, kunchenguid/firstmate),
// minus the Firstmate-only operational/synthetic input classes.
export type CalmTranscriptClass =
  | "genuine-user-prompt" | "genuine-agent-response" | "assistant-working-note"
  | "assistant-thinking" | "assistant-tool-call" | "tool-result" | "working-status";

// Calm keeps only the prompt, the final reply, and the working row.
const VISIBLE = new Set<CalmTranscriptClass>(["genuine-user-prompt", "genuine-agent-response", "working-status"]);

let calm = false;
let stockExportRendering = false;

export const setCalmPresentation = (active: boolean): void => { calm = active; };
export const setCalmStockExportRendering = (active: boolean): void => { stockExportRendering = active; };
export const calmPresentationIsActive = (): boolean => calm;
export const calmPresentationHides = (c: CalmTranscriptClass): boolean => calm && !stockExportRendering && !VISIBLE.has(c);
