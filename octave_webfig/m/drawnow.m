## octave-webfig: drawnow 훅.
## webfig가 켜진 셀/콜백 안에서는 현재 figure를 프레임으로 내보내고
## (출력 셀 위젯이 실시간으로 갱신됨), 그 밖에서는 원래 drawnow를 그대로 호출한다.
function drawnow (varargin)
  global __webfig__
  if (isstruct (__webfig__) && isfield (__webfig__, "active") && __webfig__.active)
    if (nargin == 0 || (ischar (varargin{1})
                        && any (strcmpi (varargin{1}, {"limitrate", "nocallbacks", "update"}))))
      __webfig_frame__ ();
    endif
    return;
  endif
  builtin ("drawnow", varargin{:});
endfunction
