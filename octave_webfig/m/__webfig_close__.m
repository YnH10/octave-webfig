## octave-webfig 내부용: hex 핸들 목록의 figure를 닫는다. IDS 가 "all" 이면 관리 중인 전부.
function __webfig_close__ (ids)
  global __webfig__
  if (! isstruct (__webfig__))
    return;
  endif
  if (ischar (ids) && strcmp (ids, "all"))
    figs = __webfig__.figs;
  else
    figs = [];
    for k = 1:numel (ids)
      figs(end+1) = hex2num (ids{k});
    endfor
  endif
  for k = 1:numel (figs)
    if (ishghandle (figs(k)))
      try
        delete (figs(k));
      end_try_catch
    endif
  endfor
endfunction
