## octave-webfig 내부용: figure를 DIR/BASE.json 으로 쓴다 (임시 파일 → rename).
function fname = __webfig_write__ (fig, dir, base)
  s = __webfig_export__ (fig, dir, base);
  txt = jsonencode (s);
  fname = [dir "/" base ".json"];
  tmp = [fname ".tmp"];
  fid = fopen (tmp, "w");
  if (fid < 0)
    error ("octave-webfig: 파일을 열 수 없음: %s", tmp);
  endif
  fputs (fid, txt);
  fclose (fid);
  [err, msg] = rename (tmp, fname);
  if (err != 0)
    error ("octave-webfig: rename 실패: %s", msg);
  endif
endfunction
