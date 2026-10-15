"""출력 셀에 figure를 그리는 anywidget 위젯."""

from __future__ import annotations

import pathlib
import re

import anywidget
import traitlets

_STATIC = pathlib.Path(__file__).parent / "static"


class WebFigure(anywidget.AnyWidget):
    """Octave figure 한 개를 표시하는 위젯.

    fig_json : Octave __webfig_export__ 가 만든 JSON 문자열 (파이썬에서 파싱하지 않고 그대로 전달)
    closed   : Octave 쪽에서 figure가 닫혔는지
    """

    _esm = _STATIC / "webfig.js"
    _css = _STATIC / "webfig.css"

    fig_id = traitlets.Unicode("").tag(sync=True)
    fig_json = traitlets.Unicode("").tag(sync=True)
    closed = traitlets.Bool(False).tag(sync=True)
    live_slider = traitlets.Bool(True).tag(sync=True)

    def __repr__(self) -> str:
        # 위젯이 렌더링되지 않는 곳(저장된 .ipynb를 GitHub에서 볼 때 등)에 보이는 대체 텍스트
        m = re.search(r'"number":\s*([0-9.]+)', self.fig_json[:400])
        num = "?"
        if m:
            v = float(m.group(1))
            num = str(int(v)) if v == int(v) else m.group(1)
        state = "closed" if self.closed else "interactive"
        return f"[Octave figure {num} ({state}) - open in Jupyter / VS Code with octave-webfig to view]"
