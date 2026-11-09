/**
 * waves — calm-style working row for Pi.
 * While Pi is thinking / running tools, the stock "Working..." row and the
 * thinking label are replaced by a slow full-width ocean swell until Pi is
 * fully done. Toggle with /waves (remembered).
 * Position modelled on firstmate's Calm (setWidget slot + hidden working row).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

const WIDGET_KEY = "waves";
const TICK_MS = 200;
// 2 rows tall → 8 eighth-block levels per row, 16 total
const BARS = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
const BLUE = "\u001b[34m";
const CYAN = "\u001b[36m";
const RESET = "\u001b[0m";
const DIM = "\u001b[2m";
const FADE_MS = 70;
const FADE_FRAMES = 18; // ~1.3s fade-out

export type WaveState = { t: number; fade: number; onFaded?: () => void };

export function makeWidget(tui: TUI, state: WaveState): Component & { dispose(): void } {
	let disposed = false;
	const timer = setInterval(() => {
		if (disposed) return;
		state.t++;
		tui.requestRender();
	}, TICK_MS);
	timer.unref?.();
	// fade-out: waves sink and dim, then the row is removed
	const fader = setInterval(() => {
		if (disposed || state.fade <= 0) return;
		state.fade--;
		tui.requestRender();
		if (state.fade === 0) state.onFaded?.();
	}, FADE_MS);
	fader.unref?.();

	return {
		render(width: number): string[] {
			if (disposed) return [];
			const t = state.t * 0.25;
			const f = state.fade > 0 ? state.fade / FADE_FRAMES : 1; // 1 → 0 while fading
			const dim = f < 0.6 ? DIM : "";
			const top: string[] = [];
			const bottom: string[] = [];
			for (let x = 0; x < width; x++) {
				// long swell + smaller chop travelling the other way
				const h =
					0.55 +
					0.28 * Math.sin(x / 11 - t) +
					0.12 * Math.sin(x / 4.3 + t * 1.7) +
					0.05 * Math.sin(x / 2.1 - t * 2.3);
				const level = Math.max(f < 1 ? 0 : 1, Math.min(16, Math.round(h * f * 16)));
				const low = Math.min(8, level);
				const high = Math.max(0, level - 8);
				bottom.push(low ? dim + BLUE + BARS[low] + RESET : " ");
				top.push(high ? dim + CYAN + BARS[high] + RESET : " ");
			}
			return [top.join(""), bottom.join("")];
		},
		invalidate() {},
		dispose() {
			if (disposed) return;
			disposed = true;
			clearInterval(timer);
			clearInterval(fader);
		},
	};
}

