"""octave_kernel 과 출력 셀 위젯을 잇는 부분.

흐름
----
셀 실행:
    __webfig_begin__  →  (사용자 코드, drawnow 마다 프레임 파일)  →  __webfig_capture__
    capture 는 octave_kernel 이 PNG를 만들기(make_figures) 직전에 끼어들어서
    figure를 JSON으로 내보내고 숨긴다. 그래서 octave_kernel 은 그릴 figure가 없다.

위젯 이벤트 (슬라이더 등):
    위젯 → comm 메시지 → __webfig_event__ (Octave 세션에서 진짜 콜백 실행) → capture → 위젯 갱신

애니메이션:
    셀/콜백이 도는 동안 백그라운드 스레드가 프레임 디렉터리를 감시해서
    새 프레임이 생기면 바로 위젯에 보낸다.
"""

from __future__ import annotations

import base64
import contextlib
import contextvars
import json
import os
import re
import shutil
import tempfile
import threading
import traceback
from collections import OrderedDict
from pathlib import Path
from typing import Any

M_DIR = Path(__file__).parent / "m"

_FRAME_RE = re.compile(r"^([0-9a-fA-F]{16})_(\d+)\.json$")
_IMG_RE = re.compile(r'"@img:([^"\\]+)"')


def _posix(p: Path | str) -> str:
    return str(p).replace(os.sep, "/")


def oct_str(s: str) -> str:
    """파이썬 문자열 → Octave 문자열 리터럴 (한 줄)."""
    parts = str(s).replace("\r\n", "\n").replace("\r", "\n").split("\n")
    quoted = ["'" + p.replace("'", "''") + "'" for p in parts]
    if len(quoted) == 1:
        return quoted[0]
    return "[" + " char(10) ".join(quoted) + "]"


def oct_value(v: Any) -> str:
    """JSON 값 → Octave 리터럴."""
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        if v != v:  # NaN
            return "NaN"
        return repr(float(v))
    if isinstance(v, (list, tuple)):
        if all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in v):
            return "[" + " ".join(repr(float(x)) for x in v) + "]"
        return "{" + ", ".join(oct_value(x) for x in v) + "}"
    if v is None:
        return "[]"
    return oct_str(str(v))


def _embed_images(txt: str, folder: Path) -> str:
    def repl(m: re.Match) -> str:
        p = folder / m.group(1)
        try:
            data = base64.b64encode(p.read_bytes()).decode("ascii")
        except OSError:
            return '""'
        return '"data:image/png;base64,' + data + '"'

    if "@img:" not in txt:
        return txt
    return _IMG_RE.sub(repl, txt)


# webfig는 Octave 그래픽 툴킷으로 그리지 않으므로, 툴킷 관련 안내 경고는 숨긴다
_TOOLKIT_NOISE = re.compile(
    r"^\s*(warning: using the \w+ graphics toolkit is discouraged"
    r"|The FLTK graphics toolkit is not actively maintained and has a number"
    r"|of limitations that are unlikely to be fixed\."
    r"|The qt toolkit is recommended instead\.)\s*$",
    re.MULTILINE,
)


def _errors_in(text: str) -> list[str]:
    return [ln for ln in (text or "").splitlines() if "error:" in ln]


class WebFigManager:
    """커널 하나에 하나. kernel._webfig_manager 로 붙는다."""

    def __init__(self, kernel: Any) -> None:
        self.kernel = kernel
        self.enabled = False
        self.once = False
        self.fps = 30
        self.max_figures = 30
        self.close_on_rerun = True
        self.live_slider = True

        self.widgets: OrderedDict[str, Any] = OrderedDict()  # fig hex → WebFigure
        self.cell_figs: dict[str, list[str]] = {}
        self._lock = threading.RLock()
        self._engine = None
        self._root = Path(tempfile.mkdtemp(prefix="octave_webfig_"))
        self._counter = 0
        self._watch_thread: threading.Thread | None = None
        self._watch_stop: threading.Event | None = None
        self._current_cell: str | None = None

        self._orig_execute = kernel.do_execute_direct
        kernel.do_execute_direct = self._do_execute_direct

    # ------------------------------------------------------------------ 엔진
    def _new_dir(self, kind: str) -> Path:
        self._counter += 1
        d = self._root / f"{kind}{self._counter:06d}"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _ensure_engine(self) -> Any:
        eng = self.kernel.octave_engine
        if not eng._has_startup:
            eng._startup()
        if self._engine is not eng:
            # 엔진이 새로 떴으면 이전 figure 위젯은 모두 죽은 것
            with self._lock:
                for w in self.widgets.values():
                    w.closed = True
                self.widgets.clear()
                self.cell_figs.clear()
            mdir = _posix(M_DIR)
            out = eng.eval(
                "warning('off', 'Octave:shadowed-function'); "
                f"addpath({oct_str(mdir)}); "
                "disp(exist('jsonencode'))",
                silent=True,
            )
            nums = re.findall(r"\d+", out or "")
            if not nums or nums[-1] == "0":
                raise RuntimeError(
                    "octave-webfig 에는 jsonencode 가 필요해 (Octave 7 이상). "
                    "현재 Octave 버전을 확인해줘."
                )
            self._wrap_stream(eng)
            self._engine = eng
        return eng

    def _wrap_stream(self, eng: Any) -> None:
        orig = getattr(eng, "stream_handler", None)
        if orig is None or getattr(orig, "_webfig_wrapped", False):
            return
        mgr = self

        def handler(text: str, *args: Any, **kwargs: Any) -> Any:
            if mgr.enabled or mgr.once:
                if isinstance(text, str) and _TOOLKIT_NOISE.search(text):
                    text = _TOOLKIT_NOISE.sub("", text)
                    if not text.strip():
                        return None
            return orig(text, *args, **kwargs)

        handler._webfig_wrapped = True  # type: ignore[attr-defined]
        eng.stream_handler = handler

    def _eval(self, code: str) -> str:
        eng = self._ensure_engine()
        return eng.eval(code, silent=True) or ""

    # ------------------------------------------------------------------ 셀 실행 후킹
    def _cell_id(self) -> str | None:
        parent: Any = {}
        try:
            parent = self.kernel.get_parent()
        except TypeError:
            with contextlib.suppress(Exception):
                parent = self.kernel.get_parent("shell")
        except Exception:
            parent = getattr(self.kernel, "_parent_header", {}) or {}
        md = (parent or {}).get("metadata") or {}
        cid = md.get("cellId") or md.get("cell_id")
        return str(cid) if cid else None

    def _do_execute_direct(self, code: str, silent: bool = False) -> Any:
        active = (self.enabled or self.once) and not silent
        if not active or code.strip() in ("quit", "quit()", "exit", "exit()"):
            return self._orig_execute(code, silent=silent)

        try:
            eng = self._ensure_engine()
        except Exception as e:
            self.kernel.Error(f"[webfig] {e}")
            return self._orig_execute(code, silent=silent)

        cell = self._cell_id()
        self._current_cell = cell
        if cell and self.close_on_rerun and self.cell_figs.get(cell):
            self.close(self.cell_figs.pop(cell))

        frame_dir = self._new_dir("frames")
        eng.eval(f"__webfig_begin__({oct_str(_posix(frame_dir))}, {int(self.fps)})", silent=True)
        self._start_watcher(frame_dir)

        orig_make = eng.make_figures
        captured = {"done": False}

        def make_figures(plot_dir: str | None = None) -> Any:
            self._stop_watcher()
            captured["done"] = True
            try:
                self.capture("all")
            except Exception as e:
                self.kernel.Error(f"[webfig] figure 내보내기 실패: {e}")
                self.kernel.log.error(traceback.format_exc())
            return orig_make(plot_dir)

        eng.make_figures = make_figures
        try:
            return self._orig_execute(code, silent=silent)
        finally:
            eng.__dict__.pop("make_figures", None)
            self._stop_watcher()
            if not captured["done"]:
                with contextlib.suppress(Exception):
                    self.capture("all")
            shutil.rmtree(frame_dir, ignore_errors=True)
            self._current_cell = None

    # ------------------------------------------------------------------ 내보내기
    def capture(self, mode: str = "all", ids: list[str] | None = None) -> str:
        """관리 중인 figure를 Octave에서 내보내고 위젯을 갱신한다. Octave 출력 텍스트를 반환."""
        out_dir = self._new_dir("cap")
        idlist = "{" + ", ".join(oct_str(i) for i in (ids or [])) + "}"
        out = self._eval(f"__webfig_capture__({oct_str(_posix(out_dir))}, {oct_str(mode)}, {idlist})")
        try:
            index_file = out_dir / "index.json"
            if not index_file.exists():
                errs = _errors_in(out)
                if errs:
                    raise RuntimeError("\n".join(errs))
                return out
            index = json.loads(index_file.read_text(encoding="utf-8", errors="replace"))
            for fid in _as_list(index.get("closed")):
                self._mark_closed(fid)
            for ent in _as_list(index.get("figs")):
                fid = ent["id"]
                txt = (out_dir / ent["file"]).read_text(encoding="utf-8", errors="replace")
                txt = _embed_images(txt, out_dir)
                self._update(fid, txt)
            for line in _errors_in(out):
                self.kernel.Error(line)
        finally:
            shutil.rmtree(out_dir, ignore_errors=True)
        self._enforce_max()
        return out

    def _update(self, fid: str, txt: str) -> None:
        from .widget import WebFigure

        with self._lock:
            w = self.widgets.get(fid)
            if w is None:
                w = WebFigure(fig_id=fid, fig_json=txt, live_slider=self.live_slider)
                w.on_msg(self._on_msg)
                self.widgets[fid] = w
                if self._current_cell:
                    self.cell_figs.setdefault(self._current_cell, []).append(fid)
                self.kernel.Display(w)
            elif w.fig_json != txt:
                w.fig_json = txt

    def _mark_closed(self, fid: str) -> None:
        with self._lock:
            w = self.widgets.pop(fid, None)
            if w is not None:
                w.closed = True
            for lst in self.cell_figs.values():
                if fid in lst:
                    lst.remove(fid)

    def _enforce_max(self) -> None:
        with self._lock:
            excess = len(self.widgets) - int(self.max_figures)
            if excess <= 0:
                return
            old = list(self.widgets)[:excess]
        self.close(old)

    def close(self, ids: list[str] | str) -> None:
        """figure를 닫는다. ids 는 hex 목록 또는 "all"."""
        if ids == "all":
            arg = "'all'"
            with self._lock:
                targets = list(self.widgets)
        else:
            targets = list(ids)
            if not targets:
                return
            arg = "{" + ", ".join(oct_str(i) for i in targets) + "}"
        self._eval(f"__webfig_close__({arg})")
        for fid in targets:
            self._mark_closed(fid)

    # ------------------------------------------------------------------ 프레임 감시 (애니메이션)
    def _start_watcher(self, frame_dir: Path) -> None:
        self._stop_watcher()
        stop = threading.Event()
        ctx = contextvars.copy_context()  # 셀 출력에 붙도록 부모 메시지 컨텍스트를 복사
        t = threading.Thread(
            target=ctx.run, args=(self._watch, frame_dir, stop), daemon=True, name="webfig-frames"
        )
        self._watch_stop, self._watch_thread = stop, t
        t.start()

    def _stop_watcher(self) -> None:
        if self._watch_thread is not None:
            assert self._watch_stop is not None
            self._watch_stop.set()
            self._watch_thread.join(timeout=5)
        self._watch_thread = None
        self._watch_stop = None

    def _watch(self, frame_dir: Path, stop: threading.Event) -> None:
        while not stop.is_set():
            try:
                self._poll_frames(frame_dir)
            except Exception:
                self.kernel.log.error(traceback.format_exc())
            stop.wait(0.03)

    def _poll_frames(self, frame_dir: Path) -> None:
        try:
            names = os.listdir(frame_dir)
        except OSError:
            return
        latest: dict[str, tuple[int, str]] = {}
        stale: list[str] = []
        for n in names:
            m = _FRAME_RE.match(n)
            if not m:
                continue
            fid, seq = m.group(1).lower(), int(m.group(2))
            prev = latest.get(fid)
            if prev is None or seq > prev[0]:
                if prev is not None:
                    stale.append(prev[1])
                latest[fid] = (seq, n)
            else:
                stale.append(n)
        for fid, (_seq, n) in latest.items():
            p = frame_dir / n
            try:
                txt = p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            txt = _embed_images(txt, frame_dir)
            self._update(fid, txt)
            stale.append(n)
        for n in stale:
            base = n[: -len(".json")]
            with contextlib.suppress(OSError):
                (frame_dir / n).unlink()
            for img in frame_dir.glob(base + "_img*.png"):
                with contextlib.suppress(OSError):
                    img.unlink()

    # ------------------------------------------------------------------ 위젯 이벤트
    def _on_msg(self, widget: Any, content: dict, buffers: Any = None) -> None:
        if not isinstance(content, dict):
            return
        seq = content.get("seq")
        kind = content.get("type")
        fid = widget.fig_id
        out = ""
        try:
            if kind == "event":
                out = self._handle_event(fid, content)
            elif kind == "close":
                out = self._handle_event(fid, {"obj": fid, "kind": "close"})
            elif kind == "refresh":
                out = self.capture("some", [fid])
            else:
                return
            err = bool(_errors_in(out))
        except Exception as e:
            out, err = f"error: {e}", True
            self.kernel.log.error(traceback.format_exc())
        clean = "\n".join(
            ln for ln in (out or "").splitlines() if "__WEBFIG_CLOSED__" not in ln
        ).strip()
        with contextlib.suppress(Exception):
            widget.send({"type": "ack", "seq": seq, "out": clean, "error": err})

    def _handle_event(self, fid: str, content: dict) -> str:
        eng = self._ensure_engine()
        obj = str(content.get("obj", ""))
        ev_kind = str(content.get("kind", "press"))
        if not re.fullmatch(r"[0-9a-fA-F]{16}", fid) or not re.fullmatch(r"[0-9a-fA-F]{16}", obj):
            raise ValueError("잘못된 객체 id")
        value = oct_value(content.get("value"))

        frame_dir = self._new_dir("frames")
        eng.eval(f"__webfig_begin__({oct_str(_posix(frame_dir))}, {int(self.fps)})", silent=True)
        self._start_watcher(frame_dir)
        try:
            out = eng.eval(
                f"__webfig_event__({oct_str(fid)}, {oct_str(obj)}, {oct_str(ev_kind)}, {value})",
                silent=True,
            ) or ""
        finally:
            self._stop_watcher()
            shutil.rmtree(frame_dir, ignore_errors=True)

        if "__WEBFIG_CLOSED__" in out:
            self._mark_closed(fid)
            cap = self.capture("some", [])
        else:
            cap = self.capture("some", [fid])
        return (out + "\n" + cap).strip()

    # ------------------------------------------------------------------ 상태
    def status(self) -> str:
        with self._lock:
            n = len(self.widgets)
        return (
            f"webfig: {'on' if self.enabled else 'off'} | 관리 중인 figure {n}개 | "
            f"fps {self.fps} | max {self.max_figures} | "
            f"슬라이더 실시간 {'on' if self.live_slider else 'off'} | "
            f"재실행 시 이전 figure 닫기 {'on' if self.close_on_rerun else 'off'}"
        )


def _as_list(v: Any) -> list:
    if v is None:
        return []
    if isinstance(v, list):
        return v
    return [v]


def get_manager(kernel: Any) -> WebFigManager:
    mgr = getattr(kernel, "_webfig_manager", None)
    if mgr is None:
        mgr = WebFigManager(kernel)
        kernel._webfig_manager = mgr
    return mgr
