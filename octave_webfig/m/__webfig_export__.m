## -*- texinfo -*-
## @deftypefn {} {@var{s} =} __webfig_export__ (@var{fig}, @var{imgdir}, @var{prefix})
## octave-webfig 내부용: figure 객체 트리를 jsonencode 가능한 struct로 만든다.
##
## 행렬 데이터는 @{"s": size, "d": X(:)'@} 형태(열 우선 평탄화)로 보낸다.
## 이미지(image 객체)는 PNG 파일로 IMGDIR에 저장하고 "@img:<파일명>" 으로 가리킨다.
## 그래픽 핸들은 정밀도 손실이 없도록 num2hex 문자열로 보낸다.
## @end deftypefn

function s = __webfig_export__ (fig, imgdir, prefix)
  if (nargin < 2)
    imgdir = tempdir ();
  endif
  if (nargin < 3)
    prefix = "img";
  endif

  ctx.imgdir = imgdir;
  ctx.prefix = prefix;
  ctx.nimg = 0;
  ctx.figcmap = gp (fig, "colormap", jet (64));

  s = struct ();
  s.type = "figure";
  s.id = hid (fig);
  s.number = double (fig);
  s.name = tostr (gp (fig, "name", ""));
  s.numbertitle = onoff (gp (fig, "numbertitle", "on"));
  s.size = pixsize (fig);
  s.color = gp (fig, "color", [1 1 1]);
  s.colormap = M (ctx.figcmap);
  [s.children, ctx] = export_container (fig, ctx);
endfunction


## ------------------------------------------------------------------ 컨테이너
function [list, ctx] = export_container (h, ctx)
  list = {};
  kids = allchild (h);
  ## Octave의 children은 위에 그려지는 것이 앞쪽. 아래부터 그리도록 뒤집는다.
  for k = numel (kids):-1:1
    c = kids(k);
    t = gp (c, "type", "");
    switch (t)
      case "axes"
        [o, ctx] = export_axes (c, ctx);
        list{end+1} = o;
      case "legend"
        list{end+1} = export_legend (c);
      case "uicontrol"
        list{end+1} = export_uicontrol (c);
      case {"uipanel", "uibuttongroup"}
        [o, ctx] = export_panel (c, ctx);
        list{end+1} = o;
      otherwise
        ## uimenu, uitoolbar, uicontextmenu 등은 그리지 않는다
    endswitch
  endfor
endfunction


function [o, ctx] = export_panel (h, ctx)
  o.type = gp (h, "type", "uipanel");
  o.id = hid (h);
  o.pos = pixpos (h);
  o.title = tostr (gp (h, "title", ""));
  o.titleposition = gp (h, "titleposition", "lefttop");
  o.bg = gp (h, "backgroundcolor", [0.94 0.94 0.94]);
  o.fg = gp (h, "foregroundcolor", [0 0 0]);
  o.bordertype = gp (h, "bordertype", "etchedin");
  o.borderwidth = gp (h, "borderwidth", 1);
  o.fontsize = gp (h, "fontsize", 10);
  o.visible = onoff (gp (h, "visible", "on"));
  o.selected = "";
  if (strcmp (o.type, "uibuttongroup"))
    sel = gp (h, "selectedobject", []);
    if (! isempty (sel) && ishghandle (sel))
      o.selected = hid (sel);
    endif
  endif
  [o.children, ctx] = export_container (h, ctx);
endfunction


## ------------------------------------------------------------------ axes
function [a, ctx] = export_axes (ax, ctx)
  a.type = "axes";
  a.id = hid (ax);
  a.tag = tostr (gp (ax, "tag", ""));
  a.pos = pixpos (ax);
  a.visible = onoff (gp (ax, "visible", "on"));
  a.color = gp (ax, "color", [1 1 1]);
  a.fontsize = gp (ax, "fontsize", 10);
  a.linewidth = gp (ax, "linewidth", 0.5);
  a.box = onoff (gp (ax, "box", "off"));
  a.layer = gp (ax, "layer", "bottom");
  a.tickdir = gp (ax, "tickdir", "in");
  a.view = gp (ax, "view", [0 90]);
  a.dar = gp (ax, "dataaspectratio", [1 1 1]);
  a.darmode = gp (ax, "dataaspectratiomode", "auto");
  a.pbar = gp (ax, "plotboxaspectratio", [1 1 1]);
  a.pbarmode = gp (ax, "plotboxaspectratiomode", "auto");
  a.clim = gp (ax, "clim", [0 1]);
  a.gridcolor = gp (ax, "gridcolor", [0.15 0.15 0.15]);
  a.gridalpha = gp (ax, "gridalpha", 0.15);
  a.xaxislocation = gp (ax, "xaxislocation", "bottom");
  a.yaxislocation = gp (ax, "yaxislocation", "left");
  cm = gp (ax, "colormap", []);
  if (isempty (cm))
    cm = ctx.figcmap;
  endif
  a.colormap = M (cm);
  ctx.axcmap = cm;
  ctx.clim = a.clim;

  axn = "xyz";
  for i = 1:3
    n = axn(i);
    a.([n "lim"]) = gp (ax, [n "lim"], [0 1]);
    a.([n "limmode"]) = gp (ax, [n "limmode"], "auto");
    a.([n "scale"]) = gp (ax, [n "scale"], "linear");
    a.([n "dir"]) = gp (ax, [n "dir"], "normal");
    a.([n "tick"]) = row (gp (ax, [n "tick"], []));
    a.([n "tickmode"]) = gp (ax, [n "tickmode"], "auto");
    a.([n "ticklabel"]) = tocell (gp (ax, [n "ticklabel"], {}));
    a.([n "ticklabelmode"]) = gp (ax, [n "ticklabelmode"], "auto");
    a.([n "color"]) = gp (ax, [n "color"], [0.15 0.15 0.15]);
    a.([n "grid"]) = onoff (gp (ax, [n "grid"], "off"));
    a.([n "minorgrid"]) = onoff (gp (ax, [n "minorgrid"], "off"));
    lh = gp (ax, [n "label"], []);
    if (! isempty (lh) && ishghandle (lh))
      a.([n "label"]) = export_text (lh);
    else
      a.([n "label"]) = [];
    endif
  endfor
  th = gp (ax, "title", []);
  if (! isempty (th) && ishghandle (th))
    a.title = export_text (th);
  else
    a.title = [];
  endif

  [a.children, ctx] = export_data (ax, ctx);
endfunction


## axes 안의 데이터 객체 (hggroup은 펼친다)
function [list, ctx] = export_data (h, ctx)
  list = {};
  kids = get (h, "children");
  for k = numel (kids):-1:1
    c = kids(k);
    t = gp (c, "type", "");
    switch (t)
      case "line"
        list{end+1} = export_line (c);
      case "text"
        list{end+1} = export_text (c);
      case "patch"
        list{end+1} = export_patch (c);
      case "surface"
        list{end+1} = export_surface (c);
      case "image"
        [o, ctx] = export_image (c, ctx);
        if (! isempty (o))
          list{end+1} = o;
        endif
      case "scatter"
        list{end+1} = export_scatter (c);
      case "hggroup"
        if (onoff (gp (c, "visible", "on")))
          [sub, ctx] = export_data (c, ctx);
          list = [list, sub];
        endif
      otherwise
        ## light 등은 무시
    endswitch
  endfor
endfunction


function o = export_line (h)
  o.type = "line";
  o.id = hid (h);
  o.visible = onoff (gp (h, "visible", "on"));
  o.x = row (gp (h, "xdata", []));
  o.y = row (gp (h, "ydata", []));
  o.z = row (gp (h, "zdata", []));
  o.color = gp (h, "color", [0 0 0]);
  o.ls = gp (h, "linestyle", "-");
  o.lw = gp (h, "linewidth", 0.5);
  o.marker = gp (h, "marker", "none");
  o.ms = gp (h, "markersize", 6);
  o.mec = gp (h, "markeredgecolor", "auto");
  o.mfc = gp (h, "markerfacecolor", "none");
  o.name = tostr (gp (h, "displayname", ""));
endfunction


function o = export_text (h)
  o.type = "text";
  o.id = hid (h);
  o.visible = onoff (gp (h, "visible", "on"));
  o.string = tocell (gp (h, "string", ""));
  o.pos = row (gp (h, "position", [0 0 0]));
  o.units = gp (h, "units", "data");
  o.color = gp (h, "color", [0 0 0]);
  o.fontsize = gp (h, "fontsize", 10);
  o.fontweight = gp (h, "fontweight", "normal");
  o.fontangle = gp (h, "fontangle", "normal");
  o.halign = gp (h, "horizontalalignment", "left");
  o.valign = gp (h, "verticalalignment", "middle");
  o.rotation = gp (h, "rotation", 0);
  o.interpreter = gp (h, "interpreter", "tex");
  o.bg = gp (h, "backgroundcolor", "none");
  o.edgecolor = gp (h, "edgecolor", "none");
endfunction


function o = export_patch (h)
  o.type = "patch";
  o.id = hid (h);
  o.visible = onoff (gp (h, "visible", "on"));
  o.faces = M (gp (h, "faces", []));
  o.vertices = M (gp (h, "vertices", []));
  o.fvcdata = M (gp (h, "facevertexcdata", []));
  o.facecolor = gp (h, "facecolor", [0 0 0]);
  o.edgecolor = gp (h, "edgecolor", [0 0 0]);
  o.facealpha = scal (gp (h, "facealpha", 1), 1);
  o.edgealpha = scal (gp (h, "edgealpha", 1), 1);
  o.ls = gp (h, "linestyle", "-");
  o.lw = gp (h, "linewidth", 0.5);
  o.marker = gp (h, "marker", "none");
  o.ms = gp (h, "markersize", 6);
  o.mec = gp (h, "markeredgecolor", "auto");
  o.mfc = gp (h, "markerfacecolor", "none");
  o.cdatamapping = gp (h, "cdatamapping", "scaled");
  o.name = tostr (gp (h, "displayname", ""));
endfunction


function o = export_surface (h)
  o.type = "surface";
  o.id = hid (h);
  o.visible = onoff (gp (h, "visible", "on"));
  o.x = M (gp (h, "xdata", []));
  o.y = M (gp (h, "ydata", []));
  o.z = M (gp (h, "zdata", []));
  o.c = M (gp (h, "cdata", []));
  o.facecolor = gp (h, "facecolor", "flat");
  o.edgecolor = gp (h, "edgecolor", [0 0 0]);
  o.facealpha = scal (gp (h, "facealpha", 1), 1);
  o.edgealpha = scal (gp (h, "edgealpha", 1), 1);
  o.ls = gp (h, "linestyle", "-");
  o.lw = gp (h, "linewidth", 0.5);
  o.marker = gp (h, "marker", "none");
  o.ms = gp (h, "markersize", 6);
  o.mec = gp (h, "markeredgecolor", "auto");
  o.mfc = gp (h, "markerfacecolor", "none");
  o.meshstyle = gp (h, "meshstyle", "both");
  o.cdatamapping = gp (h, "cdatamapping", "scaled");
  o.name = tostr (gp (h, "displayname", ""));
endfunction


function o = export_scatter (h)
  o.type = "scatter";
  o.id = hid (h);
  o.visible = onoff (gp (h, "visible", "on"));
  o.x = row (gp (h, "xdata", []));
  o.y = row (gp (h, "ydata", []));
  o.z = row (gp (h, "zdata", []));
  o.sizedata = row (gp (h, "sizedata", 36));
  o.c = M (gp (h, "cdata", [0 0 1]));
  o.marker = gp (h, "marker", "o");
  o.mec = gp (h, "markeredgecolor", "flat");
  o.mfc = gp (h, "markerfacecolor", "none");
  o.lw = gp (h, "linewidth", 0.5);
  o.cdatamapping = "scaled";
  o.name = tostr (gp (h, "displayname", ""));
endfunction


function [o, ctx] = export_image (h, ctx)
  o = [];
  if (! onoff (gp (h, "visible", "on")))
    return;
  endif
  c = gp (h, "cdata", []);
  if (isempty (c))
    return;
  endif
  try
    rgb = image_rgb (c, gp (h, "cdatamapping", "direct"), ctx.axcmap, ctx.clim);
    ctx.nimg += 1;
    fname = sprintf ("%s_img%d.png", ctx.prefix, ctx.nimg);
    imwrite (rgb, fullfile (ctx.imgdir, fname));
  catch err
    warning ("octave-webfig: image 변환 실패: %s", err.message);
    return;
  end_try_catch
  o.type = "image";
  o.id = hid (h);
  o.visible = true;
  o.src = ["@img:" fname];
  o.cols = columns (c);
  o.rows = rows (c);
  o.xdata = row (gp (h, "xdata", [1 columns(c)]));
  o.ydata = row (gp (h, "ydata", [1 rows(c)]));
endfunction


function rgb = image_rgb (c, mapping, cmap, clim)
  if (ndims (c) == 3)
    if (isinteger (c))
      rgb = double (c) / double (intmax (class (c)));
    else
      rgb = double (c);
    endif
    rgb(! isfinite (rgb)) = 0;
    rgb = min (max (rgb, 0), 1);
    return;
  endif
  n = rows (cmap);
  if (islogical (c))
    c = double (c);
    mapping = "scaled";
    clim = [0 1];
  endif
  if (strcmp (mapping, "scaled"))
    d = clim(2) - clim(1);
    if (d == 0)
      d = 1;
    endif
    idx = fix ((double (c) - clim(1)) / d * n) + 1;
  else
    if (isinteger (c))
      idx = double (c) + 1;
    else
      idx = floor (double (c));
    endif
  endif
  idx(! isfinite (idx)) = 1;
  idx = min (max (idx, 1), n);
  rgb = reshape (cmap(idx(:), :), [size(c), 3]);
endfunction


## ------------------------------------------------------------------ legend
function o = export_legend (h)
  o.type = "legend";
  o.id = hid (h);
  o.visible = onoff (gp (h, "visible", "on"));
  o.pos = pixpos (h);
  o.location = gp (h, "location", "northeast");
  o.orientation = gp (h, "orientation", "vertical");
  o.strings = tocell (gp (h, "string", {}));
  o.textcolor = gp (h, "textcolor", [0 0 0]);
  o.color = gp (h, "color", [1 1 1]);
  o.edgecolor = gp (h, "edgecolor", [0.15 0.15 0.15]);
  o.box = onoff (gp (h, "box", "on"));
  o.fontsize = gp (h, "fontsize", 9);
  o.numcolumns = gp (h, "numcolumns", 1);
  o.axes = "";
  o.items = {};
  pc = gp (h, "plotchildren", []);
  for k = 1:numel (pc)
    p = pc(k);
    if (! ishghandle (p))
      continue;
    endif
    if (isempty (o.axes))
      ax = ancestor (p, "axes");
      if (! isempty (ax))
        o.axes = hid (ax);
      endif
    endif
    it.kind = gp (p, "type", "line");
    it.color = gp (p, "color", [0 0 0]);
    it.ls = gp (p, "linestyle", "-");
    it.lw = gp (p, "linewidth", 0.5);
    it.marker = gp (p, "marker", "none");
    it.ms = gp (p, "markersize", 6);
    it.mec = gp (p, "markeredgecolor", "auto");
    it.mfc = gp (p, "markerfacecolor", "none");
    it.facecolor = gp (p, "facecolor", "none");
    it.edgecolor = gp (p, "edgecolor", "none");
    if (strcmp (it.kind, "hggroup"))
      ## bar 등: 첫 번째 patch 자식의 색을 쓴다
      sub = get (p, "children");
      for j = 1:numel (sub)
        if (strcmp (gp (sub(j), "type", ""), "patch"))
          it.kind = "patch";
          it.facecolor = gp (sub(j), "facecolor", "none");
          it.edgecolor = gp (sub(j), "edgecolor", "none");
          break;
        elseif (strcmp (gp (sub(j), "type", ""), "line"))
          it.kind = "line";
          it.color = gp (sub(j), "color", [0 0 0]);
          it.ls = gp (sub(j), "linestyle", "-");
          it.marker = gp (sub(j), "marker", "none");
          break;
        endif
      endfor
    endif
    o.items{end+1} = it;
  endfor
endfunction


## ------------------------------------------------------------------ uicontrol
function o = export_uicontrol (h)
  o.type = "uicontrol";
  o.id = hid (h);
  o.style = lower (gp (h, "style", "pushbutton"));
  o.visible = onoff (gp (h, "visible", "on"));
  o.enable = gp (h, "enable", "on");
  o.pos = pixpos (h);
  o.string = tocell (gp (h, "string", ""));
  o.value = row (gp (h, "value", 0));
  o.min = gp (h, "min", 0);
  o.max = gp (h, "max", 1);
  o.sliderstep = row (gp (h, "sliderstep", [0.01 0.1]));
  o.bg = gp (h, "backgroundcolor", [0.94 0.94 0.94]);
  o.fg = gp (h, "foregroundcolor", [0 0 0]);
  o.fontsize = gp (h, "fontsize", 10);
  o.fontweight = gp (h, "fontweight", "normal");
  o.halign = gp (h, "horizontalalignment", "center");
  o.tooltip = tostr (gp (h, "tooltipstring", ""));
  o.tag = tostr (gp (h, "tag", ""));
  o.hascb = ! isempty (gp (h, "callback", []));
endfunction


## ------------------------------------------------------------------ 헬퍼
function v = gp (h, prop, def)
  ## 없는 속성은 기본값으로 (Octave 버전 차이 흡수)
  try
    v = get (h, prop);
  catch
    v = def;
  end_try_catch
endfunction

function s = hid (h)
  s = lower (num2hex (double (h)));
endfunction

function b = onoff (v)
  if (ischar (v))
    b = strcmpi (v, "on");
  else
    b = logical (v);
  endif
endfunction

function v = scal (v, def)
  ## facealpha가 'flat'/'interp' 같은 문자열이면 기본값
  if (! isnumeric (v) || isempty (v))
    v = def;
  else
    v = double (v(1));
  endif
endfunction

function r = row (v)
  if (islogical (v) || isinteger (v))
    v = double (v);
  endif
  if (! isnumeric (v))
    r = [];
    return;
  endif
  r = double (v(:)');
endfunction

function o = M (X)
  ## 행렬을 크기 + 열 우선 평탄화 데이터로
  if (islogical (X) || isinteger (X))
    X = double (X);
  endif
  if (! isnumeric (X))
    X = [];
  endif
  o.s = size (X);
  o.d = double (X(:)');
endfunction

function c = tocell (s)
  if (iscell (s))
    c = cellfun (@tostr, s(:)', "uniformoutput", false);
  elseif (ischar (s))
    if (isempty (s))
      c = {};
    elseif (rows (s) == 1)
      c = {s};
    else
      c = cellstr (s)';
    endif
  elseif (isnumeric (s) || islogical (s))
    if (isempty (s))
      c = {};
    else
      c = arrayfun (@(x) num2str (x), s(:)', "uniformoutput", false);
    endif
  else
    c = {};
  endif
endfunction

function s = tostr (v)
  if (ischar (v))
    if (rows (v) > 1)
      s = strjoin (cellstr (v)', "\n");
    else
      s = v;
    endif
  elseif (iscell (v))
    s = strjoin (cellfun (@tostr, v(:)', "uniformoutput", false), "\n");
  elseif (isnumeric (v) || islogical (v))
    s = num2str (v);
  else
    s = "";
  endif
endfunction

function p = pixpos (h)
  ## 단위가 무엇이든 부모 기준 픽셀 위치 [x y w h] (원점: 왼쪽 아래)
  try
    u = get (h, "units");
    if (strcmpi (u, "pixels"))
      p = get (h, "position");
    else
      set (h, "units", "pixels");
      p = get (h, "position");
      set (h, "units", u);
    endif
    p = double (p(1:4));
  catch
    p = [0 0 0 0];
  end_try_catch
endfunction

function sz = pixsize (fig)
  p = pixpos (fig);
  sz = p(3:4);
  if (any (sz <= 0))
    sz = [560 420];
  endif
endfunction
