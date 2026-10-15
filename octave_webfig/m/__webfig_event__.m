## octave-webfig 내부용: 출력 셀 위젯에서 온 이벤트를 처리한다.
##
## KIND
##   "value"  : VALUE 를 'Value' 로 설정하고 Callback 실행 (slider, checkbox, popupmenu ...)
##   "string" : VALUE 를 'String' 으로 설정하고 Callback 실행 (edit)
##   "press"  : Callback 실행 (pushbutton)
##   "select" : buttongroup 안의 라디오 버튼 선택 → SelectedObject 변경, SelectionChangedFcn 실행
##   "close"  : figure 닫기 (CloseRequestFcn)
function __webfig_event__ (fighex, objhex, kind, value)
  fig = hex2num (fighex);
  if (! ishghandle (fig))
    printf ("__WEBFIG_CLOSED__\n");
    return;
  endif
  h = hex2num (objhex);
  if (! strcmp (kind, "close") && ! ishghandle (h))
    printf ("error: octave-webfig: 대상 객체가 없어 (이미 삭제됨)\n");
    return;
  endif

  set (fig, "handlevisibility", "on");
  set (0, "currentfigure", fig);
  unwind_protect
    try
      switch (kind)
        case "value"
          set (h, "value", value);
          __webfig_call__ (get (h, "callback"), h, []);
        case "string"
          set (h, "string", value);
          __webfig_call__ (get (h, "callback"), h, []);
        case "press"
          __webfig_call__ (get (h, "callback"), h, []);
        case "select"
          grp = get (h, "parent");
          old = [];
          try
            old = get (grp, "selectedobject");
          end_try_catch
          set (h, "value", get (h, "max"));
          try
            set (grp, "selectedobject", h);
          end_try_catch
          evt = struct ("EventName", "SelectionChanged", "OldValue", old, ...
                        "NewValue", h, "Source", grp);
          cb = [];
          try
            cb = get (grp, "selectionchangedfcn");
          end_try_catch
          __webfig_call__ (cb, grp, evt);
          __webfig_call__ (get (h, "callback"), h, []);
        case "close"
          close (fig);
        otherwise
          printf ("error: octave-webfig: 알 수 없는 이벤트 '%s'\n", kind);
      endswitch
    catch err
      printf ("error: %s\n", err.message);
      for k = 1:numel (err.stack)
        st = err.stack(k);
        printf ("    %s at line %d\n", st.name, st.line);
      endfor
    end_try_catch
  unwind_protect_cleanup
    if (ishghandle (fig))
      set (fig, "handlevisibility", "off");
    endif
  end_unwind_protect
endfunction
