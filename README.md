# octave-webfig

**English** | [한국어](README.ko.md)

Run your existing Octave GUI code — `uicontrol` sliders, buttons, callbacks — **interactively inside Jupyter / VS Code notebook output cells**.

By default, [octave_kernel](https://github.com/Calysto/octave_kernel) renders figures as static PNG images, and figures containing `uicontrol` fail to render at all. With octave-webfig turned on, each figure is replaced by a live widget:

- **2D axes**: drag to pan, scroll to zoom, Shift+drag to box-zoom, double-click to reset. Hover over data points to read their coordinates.
- **3D axes**: drag to rotate, scroll to zoom, right-drag (or Ctrl+drag) to pan.
- **UI controls**: `uicontrol` (slider, pushbutton, togglebutton, checkbox, radiobutton, edit, popupmenu, listbox, text), `uipanel`, `uibuttongroup`. Interacting with a control **runs the real callback in your Octave session**: function handles, cell callbacks, string callbacks and `guidata` all work as usual.
- **Animation**: calling `drawnow` inside a loop updates the output cell **live** while the cell is still running.
- Callback output and errors show up in a small console under the figure (the `›_` button).

<!-- Demo GIF: record one (e.g. with ScreenToGif) and save it as docs/demo.gif -->
<!-- ![demo](docs/demo.gif) -->

```octave
%webfig on

h.fig = figure('Name', 'Demo', 'NumberTitle', 'off');
h.ax  = axes('Units', 'pixels', 'Position', [60 120 440 260]);
h.line = plot(h.ax, 0:0.01:2*pi, sin(0:0.01:2*pi), 'LineWidth', 2);
uicontrol('Style', 'slider', 'Min', 0.5, 'Max', 5, 'Value', 1, ...
          'Position', [60 50 440 20], ...
          'Callback', @(src, ~) set(h.line, 'YData', sin(get(src, 'Value') * (0:0.01:2*pi))));
```

## How it works

```
cell runs ──▶ Octave serializes the figure object tree to JSON  (m/__webfig_export__.m)
          │   and hides the figure (HandleVisibility off), so octave_kernel's PNG step skips it
          └─▶ an anywidget widget redraws it on a <canvas> in the output cell;
              zoom / pan / rotate are handled in the browser

slider moved ──▶ widget → kernel (Python) → Octave: set(h, 'Value', v); run Callback
             ──▶ updated figure JSON → widget redraws
             (while dragging, only the latest value is sent, so Octave never falls behind)

drawnow inside a webfig cell / callback ──▶ the current figure is written as a frame file
             ──▶ a watcher thread in the kernel pushes it to the widget immediately
```

No VS Code extension is needed. It uses the Jupyter widget support (ipywidgets / [anywidget](https://anywidget.dev)) that VS Code and JupyterLab already ship with.

## Requirements

- GNU Octave **7 or newer** (`jsonencode` is required)
- `octave_kernel` installed in some Python environment, i.e. the Python that launches your Octave kernel
- `anywidget` and `ipywidgets >= 8` in that same environment (installed automatically)

## Install

1. Find the Python that runs your Octave kernel. In an Octave notebook cell, run:
   ```
   %python import sys; print(sys.executable)
   ```
2. Install the package with **that** Python:
   ```
   git clone https://github.com/YnH10/octave-webfig
   cd octave-webfig
   <that-python> -m pip install .
   ```
3. Register the `%webfig` magic:
   ```
   <that-python> -m octave_webfig install          # enable per notebook with %webfig on
   <that-python> -m octave_webfig install --auto   # or: always on from kernel start
   ```
   This writes `~/.ipython/metakernel/magics/webfig_magic.py`.
4. **Restart the kernel.**
5. In VS Code, allow the widget script to be loaded when asked. If widgets don't render, add `jsdelivr.com` / `unpkg.com` to the `Jupyter › Widget Script Sources` setting.

## Usage

| Command | Description |
|---|---|
| `%webfig on` / `%webfig off` | Turn interactive figures on / off (off = octave_kernel's normal PNG output) |
| `%%webfig` | At the top of a cell: use webfig for this cell only |
| `%webfig status` | Show current settings |
| `%webfig close` | Close all figures managed by webfig |
| `%webfig fps 30` | Maximum frame rate for `drawnow` animations |
| `%webfig live off` | Run slider callbacks only on release (default: also while dragging) |
| `%webfig max 30` | Maximum number of figures kept alive; the oldest are closed first |
| `%webfig rerun keep` | Keep the previous figures when re-running the same cell (default: close them) |

Toolbar buttons, from left to right: pan mode, rotate mode, reset view, save PNG, console, close figure.

See [`examples/webfig_demo.ipynb`](examples/webfig_demo.ipynb) for a 2-DOF robot arm GUI with slider callbacks, a `drawnow` animation, a 3D `surf`, and subplots with a legend.

## Notes and limitations

- **Figures are hidden from later cells.** webfig sets `HandleVisibility` to `off` on the figures it manages, so a plain `plot(...)` in a later cell creates a new figure. To modify an earlier figure, use its handles (`h.fig`, `h.ax`, ...); the change shows up when the cell finishes. `close all` does not close these figures; use `%webfig close` instead.
- **Rendering is a web re-implementation, not Octave's renderer.** Supported: line, patch (fill / bar / contour), surface (surf / mesh / pcolor), image (imagesc / imshow), scatter, text, legend, colorbar, subplots, log axes, `axis equal`, 3D projection. Lighting, alpha maps, date ticks and LaTeX are approximated or ignored. TeX support covers Greek letters, sub/superscripts and common symbols.
- Zooming or rotating in the browser does not change Octave's `XLim` / `View` properties. If a callback sets them, the callback's values win.
- Axes `ButtonDownFcn`, `KeyPressFcn` and `WindowButtonMotionFcn` are not forwarded yet.
- Callbacks cannot wait for keyboard input (`input()`).
- On Windows, octave_kernel cannot interrupt a running cell, so an endless animation loop requires a kernel restart.
- Saved PNGs contain the canvas only, not the UI controls.
- Kernel-side messages are currently in Korean.

## Troubleshooting

- **`%webfig` produces no output**: the magic isn't loaded, and Octave treats the line as a comment. Restart the kernel; check `<that-python> -m octave_webfig where`.
- **Message saying `jsonencode` is required**: your Octave is older than 7.
- **Empty widget area or "Error rendering widget"**: check step 5 above, and `pip show anywidget ipywidgets` in the kernel's Python.
- **Callback errors**: shown in red in the console under the figure.
- **Uninstall**: `<that-python> -m octave_webfig uninstall`, then `pip uninstall octave-webfig`.

## Project layout

```
octave_webfig/
  m/                  Octave side: serialization, callback dispatch, drawnow hook (added to the path by the kernel)
  static/webfig.js    output-cell renderer: canvas 2D/3D, UI controls, mouse interaction
  static/webfig.css
  widget.py           anywidget widget
  manager.py          octave_kernel hooks, event handling, frame watcher
  magic.py            %webfig / %%webfig magics
  __main__.py         install / uninstall helper
examples/webfig_demo.ipynb
dev/                  renderer test harness: open dev/harness.html via a local web server to test the
                      renderer in a browser without Octave (sample figures from dev/make_samples.py)
```

## License

[MIT](LICENSE)
