## octave-webfig 내부용: 셀/콜백이 끝난 뒤 호출된다.
##
## - 아직 webfig가 관리하지 않는 (보이는 핸들의) figure를 새로 맡는다.
##   맡은 figure는 HandleVisibility off 로 숨겨서 octave_kernel 의 PNG 출력(_make_figures)
##   과 이후 셀의 gcf/plot 대상에서 빠지게 한다.
## - MODE "all"  : 관리 중인 모든 figure를 내보낸다
##   MODE "some" : IDS(hex 문자열 셀)에 있는 figure와 새 figure만 내보낸다
## - OUTDIR/index.json 에 목록을 쓴다.
function __webfig_capture__ (outdir, mode, ids)
  global __webfig__
  if (! isstruct (__webfig__))
    __webfig_begin__ (outdir, 30);
  endif
  __webfig__.active = false;
  if (nargin < 3)
    ids = {};
  endif

  tracked = __webfig__.figs(:)';
  alive_mask = false (size (tracked));
  for k = 1:numel (tracked)
    alive_mask(k) = ishghandle (tracked(k)) && strcmp (get (tracked(k), "type"), "figure");
  endfor
  closed = tracked(! alive_mask);
  alive = tracked(alive_mask);

  ## 보이는 핸들 figure = 이번에 새로 생긴 figure
  vis = get (0, "children");
  vis = vis(:)';
  newf = [];
  for k = 1:numel (vis)
    if (! any (alive == vis(k)))
      newf(end+1) = vis(k);
    endif
  endfor
  newf = sort (newf);
  for k = 1:numel (newf)
    set (newf(k), "handlevisibility", "off");
  endfor
  ## 혹시 사용자가 다시 보이게 만든 관리 figure도 숨긴다
  for k = 1:numel (alive)
    if (! strcmp (get (alive(k), "handlevisibility"), "off"))
      set (alive(k), "handlevisibility", "off");
    endif
  endfor
  __webfig__.figs = [alive, newf];

  entries = {};
  for k = 1:numel (__webfig__.figs)
    f = __webfig__.figs(k);
    id = lower (num2hex (double (f)));
    isnew = any (newf == f);
    if (! (strcmp (mode, "all") || isnew || any (strcmp (ids, id))))
      continue;
    endif
    base = sprintf ("fig_%s", id);
    try
      __webfig_write__ (f, outdir, base);
      entries{end+1} = struct ("id", id, "file", [base ".json"], "new", isnew, ...
                               "number", double (f));
    catch err
      printf ("error: octave-webfig: figure %g 내보내기 실패: %s\n", double (f), err.message);
    end_try_catch
  endfor

  idx.figs = entries;
  idx.closed = arrayfun (@(h) lower (num2hex (double (h))), closed, "uniformoutput", false);
  fid = fopen ([outdir "/index.json"], "w");
  fputs (fid, jsonencode (idx));
  fclose (fid);
endfunction
