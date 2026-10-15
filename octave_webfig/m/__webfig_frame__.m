## octave-webfig 내부용: drawnow 에서 호출. 현재 figure를 프레임 파일로 쓴다.
## 프레임 속도는 __webfig_begin__ 의 fps 로 제한한다.
function __webfig_frame__ ()
  global __webfig__
  try
    t = time ();
    if (t - __webfig__.last < __webfig__.min_dt)
      return;
    endif
    h = get (0, "currentfigure");
    if (isempty (h) || ! ishghandle (h))
      return;
    endif
    __webfig__.seq += 1;
    id = lower (num2hex (double (h)));
    base = sprintf ("%s_%06d", id, __webfig__.seq);
    __webfig_write__ (h, __webfig__.frame_dir, base);
    __webfig__.last = time ();
  catch err
    ## 애니메이션 도중 내보내기 실패로 사용자 코드가 멈추지 않게 한다
    __webfig__.last = time ();
    warning ("octave-webfig: 프레임 내보내기 실패: %s", err.message);
  end_try_catch
endfunction
