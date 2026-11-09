/**
 * waves — calm mode for Pi with an ocean working row.
 *
 * Behaviour adapted from Calm in Firstmate by Kun Chen (@kunchenguid), MIT,
 * https://github.com/kunchenguid/firstmate (see docs/calm.md), minus the Firstmate-only operational/queued-input handling:
 *  - hides collapsed thinking labels
 *  - hides short mid-turn assistant "working notes" (no newline and < 240 chars)
 *  - hides the rows for built-in tools: bash, read, edit, write, grep, find, ls
 *  - replaces Pi's "Working..." row with a full-width wave animation (fades out)
 *  - leaves model context, session storage and /export /share untouched
 * Toggle with /waves (remembered in ~/.pi/agent/waves.json).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Box, Container, getKeybindings, Text, type Component, type TUI } from "@earendil-works/pi-tui";
import { installCalmAssistantLayout } from "./lib/assistant-layout.ts";
import {
	calmPresentationHides,
	calmPresentationIsActive,
	setCalmPresentation,
	setCalmStockExportRendering,
} from "./lib/visibility.ts";
import { makeWidget, type WaveState } from "./lib/widget.ts";

const WIDGET_KEY = "waves";
const FADE_FRAMES = 18;
const PREF = join(homedir(), ".pi", "agent", "waves.json");

const loadEnabled = (): boolean => {
	try {
		return existsSync(PREF) ? JSON.parse(readFileSync(PREF, "utf8")).enabled !== false : true;
	} catch {
		return true;
	}
};

type ShellState = { shell?: Box; call?: Component; result?: Component };

export default function (pi: ExtensionAPI) {
	try {
		installCalmAssistantLayout();
	} catch (error) {
		console.error(`waves: collapsed-thinking adapter unavailable, skipping. ${error instanceof Error ? error.message : error}`);
	}

	let exportRendering = false;
	const toolRowRepaints = new Map<object, () => void>();
	const rememberRow = (state: object, invalidate: unknown) => {
		if (exportRendering || typeof invalidate !== "function") return;
		toolRowRepaints.set(state, invalidate as () => void);
	};

	// Same approach as Calm: wrap each built-in with renderShell "self" so the
	// whole row (call + result + background box) can render as nothing.
	function wrapBuiltIn(factory: (cwd: string) => ToolDefinition<any, any, any>): ToolDefinition<any, any, any> {
		const defs = new Map<string, ToolDefinition<any, any, any>>();
		const defFor = (cwd: string) => {
			let d = defs.get(cwd);
			if (!d) defs.set(cwd, (d = factory(cwd)));
			return d;
		};
		const original = defFor(process.cwd());
		const origCall = original.renderCall!;
		const origResult = original.renderResult!;
		const selfShell = original.renderShell === "self";
		const shells = new WeakMap<object, ShellState>();
		const shellFor = (ctx: any): ShellState => {
			let s = shells.get(ctx.state);
			if (!s) shells.set(ctx.state, (s = {}));
			return s;
		};
		const refresh = (s: ShellState, theme: any, ctx: any): Box => {
			const bg = ctx.isPartial
				? (t: string) => theme.bg("toolPendingBg", t)
				: ctx.isError
					? (t: string) => theme.bg("toolErrorBg", t)
					: (t: string) => theme.bg("toolSuccessBg", t);
			const shell = s.shell ?? new Box(1, 1, bg);
			s.shell = shell;
			shell.setBgFn(bg);
			shell.clear();
			if (s.call) shell.addChild(s.call);
			if (s.result) shell.addChild(s.result);
			return shell;
		};

		return {
			...original,
			renderShell: "self",
			async execute(id, params, signal, onUpdate, ctx) {
				return defFor(ctx.cwd).execute(id, params, signal, onUpdate, ctx);
			},
			renderCall(args, theme, ctx: any) {
				rememberRow(ctx.state, ctx.invalidate);
				if (exportRendering) return origCall(args, theme, ctx);
				if (calmPresentationHides("assistant-tool-call")) return new Container();
				if (selfShell) return origCall(args, theme, ctx);
				const s = shellFor(ctx);
				s.call = origCall(args, theme, { ...ctx, lastComponent: s.call });
				return refresh(s, theme, ctx);
			},
			renderResult(result, options: ToolRenderResultOptions, theme, ctx: any) {
				rememberRow(ctx.state, ctx.invalidate);
				if (exportRendering) return origResult(result, options, theme, ctx);
				if (calmPresentationHides("tool-result")) return new Container();
				if (selfShell) return origResult(result, options, theme, ctx);
				const s = shellFor(ctx);
				s.result = origResult(result, options, theme, { ...ctx, lastComponent: s.result });
				refresh(s, theme, ctx);
				return new Container();
			},
		};
	}

	// Registered unconditionally so restored rows and toggles both work; when waves
	// is off these behave exactly like the stock tools.
	for (const f of [
		createReadToolDefinition,
		createBashToolDefinition,
		createEditToolDefinition,
		createWriteToolDefinition,
		createGrepToolDefinition,
		createFindToolDefinition,
		createLsToolDefinition,
	]) {
		pi.registerTool(wrapBuiltIn(f as any));
	}

	// Beyond Calm: also hide rows for tools from other extensions / MCP (e.g. pi-web-access
	// fetch/web_search). Built-ins are already handled by the wrappers above.
	const BUILTINS = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);
	pi.registerToolRenderer((toolName, next) => {
		if (BUILTINS.has(toolName)) return next();
		const inner = next();
		const shells = new WeakMap<object, ShellState>();
		const shellFor = (ctx: any): ShellState => {
			let s = shells.get(ctx.state);
			if (!s) shells.set(ctx.state, (s = {}));
			return s;
		};
		const refresh = (s: ShellState, theme: any, ctx: any): Box => {
			const bg = ctx.isPartial
				? (t: string) => theme.bg("toolPendingBg", t)
				: ctx.isError
					? (t: string) => theme.bg("toolErrorBg", t)
					: (t: string) => theme.bg("toolSuccessBg", t);
			const shell = s.shell ?? new Box(1, 1, bg);
			s.shell = shell;
			shell.setBgFn(bg);
			shell.clear();
			if (s.call) shell.addChild(s.call);
			if (s.result) shell.addChild(s.result);
			return shell;
		};
		// fallbacks when the tool has no custom renderer of its own
		const callFn =
			inner?.renderCall ??
			((args: any, theme: any) => {
				const a = JSON.stringify(args ?? {});
				return new Text(`${theme.fg("toolTitle", theme.bold(toolName))} ${theme.fg("muted", a.length > 120 ? a.slice(0, 117) + "..." : a)}`, 0, 0);
			});
		const resultFn =
			inner?.renderResult ??
			((result: any, _o: any, theme: any) => {
				const text = (result?.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
				const lines = text.split("\n");
				const shown = lines.slice(0, 10).join("\n") + (lines.length > 10 ? `\n${theme.fg("muted", `… ${lines.length - 10} more lines`)}` : "");
				return new Text(theme.fg("toolOutput", shown), 0, 0);
			});
		const innerSelf = inner?.renderShell === "self";
		return {
			renderShell: "self",
			renderCall(args: any, theme: any, ctx: any) {
				rememberRow(ctx.state, ctx.invalidate);
				if (!exportRendering && calmPresentationHides("assistant-tool-call")) return new Container();
				if (innerSelf) return callFn(args, theme, ctx);
				const s = shellFor(ctx);
				s.call = callFn(args, theme, { ...ctx, lastComponent: s.call });
				return refresh(s, theme, ctx);
			},
			renderResult(result: any, options: any, theme: any, ctx: any) {
				rememberRow(ctx.state, ctx.invalidate);
				if (!exportRendering && calmPresentationHides("tool-result")) return new Container();
				if (innerSelf) return resultFn(result, options, theme, ctx);
				const s = shellFor(ctx);
				s.result = resultFn(result, options, theme, { ...ctx, lastComponent: s.result });
				refresh(s, theme, ctx);
				return new Container();
			},
		};
	});

	// ---- working-row wave animation ----
	const wave: WaveState = { t: 0, fade: 0 };
	let shown = false;
	let running = false;

	const remove = (ui: any) => {
		wave.fade = 0;
		wave.onFaded = undefined;
		if (!shown) return;
		shown = false;
		ui.setWidget(WIDGET_KEY, undefined);
		ui.setWorkingVisible(true);
	};
	const show = (ui: any) => {
		if (!calmPresentationIsActive()) return;
		if (wave.fade > 0) {
			wave.fade = 0;
			wave.onFaded = undefined;
			return;
		}
		if (shown) return;
		shown = true;
		ui.setWidget(WIDGET_KEY, (tui: TUI) => makeWidget(tui, wave));
		ui.setWorkingVisible(false);
	};
	const fadeOut = (ui: any) => {
		if (!shown || wave.fade > 0) return;
		wave.fade = FADE_FRAMES;
		wave.onFaded = () => remove(ui);
	};

	pi.on("session_start", (_e, ctx) => {
		toolRowRepaints.clear();
		exportRendering = false;
		setCalmPresentation(loadEnabled());
		setCalmStockExportRendering(false);
		wave.t = 0;
		running = false;
		if (!ctx.hasUI) return;
		remove(ctx.ui);
		ctx.ui.setHiddenThinkingLabel(calmPresentationIsActive() ? "" : undefined);
		// /export and /share render the full stock transcript
		ctx.ui.onTerminalInput((data) => {
			if (!getKeybindings().matches(data, "tui.input.submit")) return undefined;
			const input = ctx.ui.getEditorText().trim();
			if (input !== "/share" && input !== "/export" && !input.startsWith("/export ")) return undefined;
			exportRendering = true;
			setCalmStockExportRendering(true);
			setTimeout(() => {
				exportRendering = false;
				setCalmStockExportRendering(false);
				for (const inv of toolRowRepaints.values()) inv();
				ctx.ui.setStatus("waves", undefined);
			}, 0);
			return undefined;
		});
	});

	pi.on("agent_start", (_e, ctx) => {
		running = true;
		if (ctx.hasUI) show(ctx.ui);
	});
	// agent_settled also fires on abort and failure
	pi.on("agent_settled", (_e, ctx) => {
		running = false;
		if (ctx.hasUI) fadeOut(ctx.ui);
	});
	pi.on("session_shutdown", (_e, ctx) => {
		running = false;
		if (ctx.hasUI) remove(ctx.ui);
	});

	pi.registerCommand("waves", {
		description: "Toggle waves calm mode (/waves, /waves on, /waves off)",
		handler: async (args, ctx) => {
			const a = args.trim().toLowerCase();
			const active = a === "on" ? true : a === "off" ? false : !calmPresentationIsActive();
			try {
				writeFileSync(PREF, JSON.stringify({ enabled: active }) + "\n");
			} catch {}
			setCalmPresentation(active);
			if (active && running) show(ctx.ui);
			if (!active) remove(ctx.ui);
			// re-layout rows already on screen (same trick Calm uses)
			ctx.ui.setHiddenThinkingLabel(active ? "" : undefined);
			const expanded = ctx.ui.getToolsExpanded();
			ctx.ui.setToolsExpanded(!expanded);
			ctx.ui.setToolsExpanded(expanded);
			ctx.ui.notify(`waves ${active ? "on" : "off"}`, "info");
		},
	});
}
