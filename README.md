# pi-waves

Calm mode for [Pi](https://pi.dev) with an ocean working row.

While Pi works, a slow full-width wave animation replaces the stock "Working..." row, and the
transcript stays quiet: collapsed thinking, short mid-turn working notes, and tool rows are hidden
so you see your prompt and the final answer. The waves fade out when Pi is done.

Hidden content is presentation-only: the model still sees it, and it stays in session storage
and in `/export` / `/share` output.

## Install

```sh
pi install git:github.com/matthewkope/pi-waves
```

## Use

| Command | Effect |
|---|---|
| `/waves` | Toggle on/off |
| `/waves on` / `/waves off` | Set explicitly |

The choice is saved in `~/.pi/agent/waves.json`.

## What gets hidden

- Collapsed thinking labels
- Mid-turn assistant notes that are a single line under 240 characters
- Rows for Pi's built-in tools (`bash`, `read`, `edit`, `write`, `grep`, `find`, `ls`)
- Rows for tools from other extensions and MCP servers

Expanded thinking, images, user `!` bash rows and other extension rows that are not tool calls stay visible.

## Credits

This extension is inspired by, and its hiding behaviour is adapted from, **Calm** in
[**Firstmate**](https://github.com/kunchenguid/firstmate) by **Kun Chen
([@kunchenguid](https://github.com/kunchenguid))**, released under the MIT License.
See Firstmate's [`docs/calm.md`](https://github.com/kunchenguid/firstmate/blob/main/docs/calm.md)
for the original design. The thinking/working-note layout patch, the substantive-text rule, the
built-in tool wrapping and the working-row placement come from Calm; the wave animation, fade-out
and the hiding of other extensions' tools are new here.

## License

MIT. See [LICENSE](LICENSE), which also carries Firstmate's copyright notice for the adapted code.
