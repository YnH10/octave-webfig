## octave-webfig 내부용: MATLAB/Octave 스타일 콜백 실행.
## CB 는 함수 핸들, {핸들, 인자...} 셀, 또는 문자열(base 작업공간에서 eval).
function __webfig_call__ (cb, src, evt)
  if (isempty (cb))
    return;
  endif
  if (is_function_handle (cb))
    call_fh (cb, src, evt, {});
  elseif (iscell (cb))
    if (isempty (cb))
      return;
    endif
    f = cb{1};
    if (ischar (f))
      f = str2func (f);
    endif
    call_fh (f, src, evt, cb(2:end));
  elseif (ischar (cb))
    evalin ("base", cb);
  endif
endfunction

function call_fh (f, src, evt, extra)
  n = -1;
  try
    n = nargin (f);
  catch
    n = -1;
  end_try_catch
  if (n == 0 && isempty (extra))
    feval (f);
  elseif (n == 1 && isempty (extra))
    feval (f, src);
  else
    feval (f, src, evt, extra{:});
  endif
endfunction
