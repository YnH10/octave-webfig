"""설치 도우미.

    python -m octave_webfig install          %webfig 매직 등록 (셀에서 %webfig on 으로 켬)
    python -m octave_webfig install --auto   커널이 뜰 때부터 자동으로 켜짐
    python -m octave_webfig uninstall        매직 등록 해제
    python -m octave_webfig where            매직 파일 위치 출력
"""

from __future__ import annotations

import os
import sys

STUB_NAME = "webfig_magic.py"

STUB = '''\
# octave-webfig 이 만든 파일. 지우려면: python -m octave_webfig uninstall
try:
    from octave_webfig.magic import register_magics as _register
except ImportError as _e:  # 패키지가 이 커널의 파이썬에 없으면 조용히 건너뜀
    _register = None


def register_magics(kernel):
    if _register is not None:
        _register(kernel, auto_enable={auto})
'''


def magics_dir() -> str:
    try:
        from metakernel.config import get_local_magics_dir

        return get_local_magics_dir()
    except Exception:
        from IPython.paths import get_ipython_dir

        d = os.path.join(get_ipython_dir(), "metakernel", "magics")
        os.makedirs(d, exist_ok=True)
        return d


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else "help"
    path = os.path.join(magics_dir(), STUB_NAME)
    if cmd == "install":
        auto = "--auto" in argv[1:]
        with open(path, "w", encoding="utf-8") as f:
            f.write(STUB.format(auto="True" if auto else "False"))
        print(f"설치됨: {path}")
        print("자동 켜기: " + ("on (커널 시작부터 webfig)" if auto else "off (셀에서 %webfig on)"))
        print("열려 있는 노트북은 커널을 재시작해야 적용돼.")
        return 0
    if cmd == "uninstall":
        if os.path.exists(path):
            os.remove(path)
            print(f"삭제됨: {path}")
        else:
            print("설치된 매직 파일이 없어.")
        return 0
    if cmd == "where":
        print(path, "(있음)" if os.path.exists(path) else "(없음)")
        return 0
    print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
