"""%webfig / %%webfig 매직 (metakernel)."""

from __future__ import annotations

from typing import Any

from metakernel import Magic

from .manager import get_manager

_HELP = """
%webfig on            이후 모든 셀의 figure를 출력 셀 안의 인터랙티브 figure로 표시
%webfig off           원래대로 (octave_kernel 기본 PNG)
%webfig status        현재 설정 보기
%webfig close         webfig가 관리 중인 figure 모두 닫기
%webfig fps 30        drawnow 애니메이션 최대 프레임 수 (초당)
%webfig max 30        동시에 유지할 figure 최대 개수 (넘으면 오래된 것부터 닫음)
%webfig live on|off   슬라이더를 끄는 동안에도 콜백 실행(on) / 놓을 때만(off)
%webfig rerun close|keep
                      같은 셀을 다시 실행하면 이전 figure를 닫을지(close) 둘지(keep)

%%webfig              이 셀 하나만 webfig로 실행
"""


class WebFigMagic(Magic):
    def _mgr(self) -> Any:
        return get_manager(self.kernel)

    def line_webfig(self, *args: Any) -> None:
        """
        %webfig on|off|status|close|fps N|max N|live on|off|rerun close|keep

        Octave figure를 출력 셀 안에서 직접 조작할 수 있게 그린다.
        (줌/팬/3D 회전, uicontrol 슬라이더·버튼 콜백, drawnow 애니메이션)
        """
        words = " ".join(str(a) for a in args).split()
        mgr = self._mgr()
        if not words:
            self.kernel.Print(mgr.status())
            self.kernel.Print(_HELP)
            return
        cmd, rest = words[0].lower(), words[1:]
        if cmd == "on":
            mgr.enabled = True
            try:
                mgr._ensure_engine()
            except Exception as e:
                mgr.enabled = False
                self.kernel.Error(f"[webfig] {e}")
                return
            self.kernel.Print("webfig 켜짐: 이제 figure가 출력 셀 안에 인터랙티브하게 표시돼.")
        elif cmd == "off":
            mgr.enabled = False
            self.kernel.Print("webfig 꺼짐: 다음 셀부터 기본 PNG 출력.")
        elif cmd == "status":
            self.kernel.Print(mgr.status())
        elif cmd == "close":
            mgr.close("all")
            self.kernel.Print("webfig figure를 모두 닫았어.")
        elif cmd == "fps" and rest:
            mgr.fps = max(1, int(float(rest[0])))
            self.kernel.Print(f"fps = {mgr.fps}")
        elif cmd == "max" and rest:
            mgr.max_figures = max(1, int(float(rest[0])))
            self.kernel.Print(f"max = {mgr.max_figures}")
        elif cmd == "live" and rest:
            mgr.live_slider = rest[0].lower() in ("on", "1", "true", "yes")
            for w in list(mgr.widgets.values()):
                w.live_slider = mgr.live_slider
            self.kernel.Print(f"슬라이더 실시간 콜백 = {'on' if mgr.live_slider else 'off'}")
        elif cmd == "rerun" and rest:
            mgr.close_on_rerun = rest[0].lower() in ("close", "on", "1", "true")
            self.kernel.Print(
                f"재실행 시 이전 figure {'닫기' if mgr.close_on_rerun else '유지'}"
            )
        else:
            self.kernel.Error(f"[webfig] 알 수 없는 명령: {' '.join(words)}")
            self.kernel.Print(_HELP)

    def cell_webfig(self) -> None:
        """
        %%webfig

        이 셀 하나만 webfig 모드로 실행한다.
        """
        self._mgr().once = True
        self.evaluate = True

    def post_process(self, retval: Any) -> Any:
        mgr = getattr(self.kernel, "_webfig_manager", None)
        if mgr is not None:
            mgr.once = False
        return retval


def register_magics(kernel: Any, auto_enable: bool = False) -> None:
    # metakernel 의 magics 폴더는 다른 metakernel 커널과 공유되므로 Octave 커널에서만 등록
    # (인스턴스에 hasattr 하면 octave_engine 프로퍼티가 Octave를 띄우므로 클래스로 확인)
    if not hasattr(type(kernel), "octave_engine"):
        return
    kernel.register_magics(WebFigMagic)
    if auto_enable:
        get_manager(kernel).enabled = True
