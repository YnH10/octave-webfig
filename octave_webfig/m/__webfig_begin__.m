## octave-webfig 내부용: 셀/콜백 실행 직전에 호출된다.
## FRAME_DIR 에 drawnow 프레임을 쓰도록 훅을 켠다.
function __webfig_begin__ (frame_dir, fps)
  global __webfig__
  if (! isstruct (__webfig__))
    __webfig__ = struct ("figs", [], "active", false, "frame_dir", "", ...
                         "min_dt", 1/30, "last", -Inf, "seq", 0);
  endif
  if (! isfield (__webfig__, "figs"))
    __webfig__.figs = [];
  endif
  __webfig__.active = true;
  __webfig__.frame_dir = frame_dir;
  __webfig__.min_dt = 1 / max (fps, 1);
  __webfig__.last = -Inf;
  __webfig__.seq = 0;
endfunction
