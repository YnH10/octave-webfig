# octave-webfig

English | [한국어](README.ko.md)

Interactive Octave figures for Jupyter and VS Code notebooks, built on the Jupyter widgets framework.

`octave-webfig` displays figures created with [octave_kernel](https://github.com/Calysto/octave_kernel) as widgets in the output cell instead of static images. Figures containing `uicontrol` elements are supported, and their callbacks run in the Octave session.

<!-- ![demo](docs/demo.gif) -->

## Features

- Pan and zoom for 2D axes, rotation and zoom for 3D axes
- `uicontrol` (slider, pushbutton, togglebutton, checkbox, radiobutton, edit, popupmenu, listbox, text), `uipanel`, `uibuttongroup`
- Callbacks given as function handles, cell arrays or strings
- Live updates from `drawnow` while a cell is running
- Callback output and errors shown in a console below the figure

## Prerequisites

- GNU Octave 7 or later
- [octave_kernel](https://github.com/Calysto/octave_kernel)

## Installation

Install the package into the Python environment that runs octave_kernel:

```shell
git clone https://github.com/YnH10/octave-webfig
cd octave-webfig
pip install .
```

Register the `%webfig` magic:

```shell
python -m octave_webfig install
```

To enable `octave-webfig` automatically when the kernel starts, use `python -m octave_webfig install --auto` instead.

Restart the kernel after installation.

## Usage

To enable interactive figures, use the `%webfig` magic:

```
%webfig on
```

| Command | Description |
|---|---|
| `%webfig on` | Enable interactive figures |
| `%webfig off` | Disable interactive figures |
| `%%webfig` | Enable interactive figures for the current cell only |
| `%webfig status` | Show the current settings |
| `%webfig close` | Close all figures managed by `octave-webfig` |
| `%webfig fps N` | Set the maximum frame rate for `drawnow` updates (default: 30) |
| `%webfig live on\|off` | Run slider callbacks while dragging, or only on release (default: on) |
| `%webfig max N` | Set the maximum number of open figures (default: 30) |
| `%webfig rerun close\|keep` | Close or keep figures from the previous run of a cell (default: close) |

An example notebook is available at [examples/webfig_demo.ipynb](examples/webfig_demo.ipynb).

## Notes

- Figures are rendered in the browser from their graphics properties. Lines, patches, surfaces, images, scatter plots, text, legends, colorbars, subplots, log scales and 3D views are supported. Lighting and LaTeX text are not supported.
- Figures managed by `octave-webfig` have `HandleVisibility` set to `off`. They are not affected by `close all` and do not become the current figure in later cells.
- Changes made in the browser (zoom, pan, rotation) are not written back to the figure properties.
- `ButtonDownFcn`, `KeyPressFcn` and `WindowButtonMotionFcn` are not supported.
- In VS Code, widget scripts must be allowed to load. See the `Jupyter › Widget Script Sources` setting.

## Supported platforms

Tested on Windows with VS Code. JupyterLab and other platforms have not been tested.

## Uninstall

```shell
python -m octave_webfig uninstall
pip uninstall octave-webfig
```

## License

MIT
