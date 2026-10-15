# octave-webfig

[English](README.md) | **한국어**

VS Code(또는 Jupyter)의 Octave 노트북에서 figure를 **출력 셀 안에서 바로 조작**할 수 있게 해주는 도구야.

- 2D 그림: 드래그로 이동, 휠로 확대, Shift+드래그로 영역 확대, 더블클릭으로 초기화. 점 위에 마우스를 올리면 좌표가 나와.
- 3D 그림: 드래그로 회전, 휠로 확대, 우클릭 드래그(또는 Ctrl+드래그)로 이동.
- `uicontrol`(slider, pushbutton, checkbox, radiobutton, togglebutton, edit, popupmenu, listbox, text)과 `uipanel`, `uibuttongroup` 지원. 위젯을 조작하면 **Octave 세션에서 실제 콜백이 실행**돼. `guidata`, 함수 핸들 콜백, 문자열 콜백 모두 동작해.
- 루프 안에서 `drawnow`를 부르면 셀이 실행되는 동안 출력 셀의 그림이 **실시간으로** 움직여.
- 콜백에서 출력한 내용이나 에러는 그림 아래 콘솔(`›_` 버튼)에 표시돼.

## 동작 방식

```
셀 실행 ──▶ Octave: figure 객체 트리를 JSON으로 직렬화 (__webfig_export__)
                  └▶ figure는 HandleVisibility off로 숨김 → octave_kernel의 PNG 출력에서 빠짐
        ──▶ 출력 셀 위젯(anywidget)이 canvas로 그림. 줌/팬/회전은 브라우저에서 처리

슬라이더 조작 ──▶ 위젯 → 커널(Python) → Octave: set(h,'Value',v) 후 Callback 실행
              ──▶ 바뀐 figure JSON → 위젯 갱신
              (드래그 중에는 응답이 올 때마다 최신 값만 보내서 Octave가 밀리지 않게 함)

drawnow (webfig가 켜진 셀/콜백 안) ──▶ 현재 figure를 프레임 파일로 기록
              ──▶ 커널의 감시 스레드가 바로 위젯에 전송 (애니메이션)
```

VS Code 확장을 따로 설치할 필요는 없어. VS Code Jupyter 확장이 ipywidgets를 렌더링하는 기능을 그대로 써.

## 요구 사항

- Octave **7 이상** (`jsonencode` 필요)
- `octave_kernel`이 설치된 파이썬 환경 (VS Code에서 Octave 커널을 띄우는 그 파이썬)
- 해당 파이썬 환경에 `anywidget`, `ipywidgets` 8 이상 (설치할 때 자동으로 같이 깔려)

## 설치

1. Octave 커널이 쓰는 파이썬 경로를 확인해. Octave 노트북 셀에서 아래를 실행하면 나와.
   ```
   %python import sys; print(sys.executable)
   ```
2. **그 파이썬으로** 패키지를 설치해.
   ```
   git clone https://github.com/YnH10/octave-webfig
   cd octave-webfig
   <그 파이썬> -m pip install .
   ```
3. 매직을 등록해.
   ```
   <그 파이썬> -m octave_webfig install          # 셀에서 %webfig on 으로 켜기
   <그 파이썬> -m octave_webfig install --auto   # 커널이 시작될 때부터 항상 켜기
   ```
   이 명령은 `~/.ipython/metakernel/magics/webfig_magic.py`를 만들어.
4. 커널을 **재시작**해.
5. VS Code가 위젯 스크립트(anywidget)를 받아도 되는지 물어보면 허용해. 위젯이 안 뜨면 설정의 `Jupyter › Widget Script Sources`에 `jsdelivr.com`, `unpkg.com`을 추가해.

## 사용법

```octave
%webfig on          % 이후 셀부터 모든 figure가 인터랙티브로 표시됨
```

| 명령 | 설명 |
|---|---|
| `%webfig on` / `%webfig off` | 켜기 / 끄기 (끄면 원래의 PNG 출력) |
| `%%webfig` | (셀 맨 위에 쓰면) 이 셀 하나만 webfig로 실행 |
| `%webfig status` | 현재 설정 보기 |
| `%webfig close` | webfig가 관리 중인 figure를 모두 닫기 |
| `%webfig fps 30` | drawnow 애니메이션의 최대 초당 프레임 수 |
| `%webfig live off` | 슬라이더 콜백을 손을 뗄 때만 실행 (기본값은 드래그 중에도 실행) |
| `%webfig max 30` | 동시에 유지할 figure 개수. 넘으면 오래된 것부터 닫음 |
| `%webfig rerun keep` | 같은 셀을 다시 실행해도 이전 figure를 닫지 않음 (기본값은 닫음) |

툴바 버튼은 왼쪽부터 순서대로 이동 모드, 회전 모드, 보기 초기화, PNG 저장, 콘솔, figure 닫기야.

예제는 `examples/webfig_demo.ipynb`에 있어. 로봇팔 GUI, drawnow 애니메이션, 3D surf, subplot과 legend를 다뤄.

## 알아둘 점 / 한계

- **셀 안에서는 그림이 숨겨진 상태로 관리돼.** webfig가 맡은 figure는 `HandleVisibility`가 `off`이기 때문에, 다음 셀에서 `plot(...)`을 실행하면 새 figure가 생겨. 이전 figure를 다시 건드리려면 `h.fig`, `h.ax`처럼 핸들을 직접 써야 해. 핸들로 바꾼 내용은 셀이 끝날 때 출력 셀에 반영돼. `close all`로는 이 figure들이 닫히지 않으니 `%webfig close`를 써.
- **그리는 쪽은 Octave 렌더러가 아니라 웹에서 다시 구현한 렌더러야.** line, patch(fill/bar/contour), surface(surf/mesh/pcolor), image(imagesc/imshow), scatter, text, legend, colorbar, subplot, 로그 축, `axis equal`, 3D 투영을 지원해. 조명(`light`), 투명도 맵, 날짜 눈금, LaTeX 수식 같은 고급 기능은 대략적으로만 그리거나 무시해. TeX는 그리스 문자, 위/아래 첨자, 일부 기호 정도만 처리해.
- 브라우저에서 확대하거나 회전한 보기는 Octave의 `XLim`/`View` 속성에 반영되지 않아. 화면에서만 바뀌는 거야. 콜백이 축 범위나 `View`를 직접 바꾸면 그 값이 우선해.
- 축 클릭(`ButtonDownFcn`), 키 입력(`KeyPressFcn`), 마우스 이동 콜백(`WindowButtonMotionFcn`)은 아직 전달하지 않아.
- 콜백 안에서 `input()`처럼 키보드 입력을 기다리는 코드는 쓸 수 없어.
- Windows에서는 octave_kernel 자체가 실행 중인 셀을 중단(interrupt)하지 못해. 무한 루프 애니메이션은 커널을 재시작해야 멈춰.
- PNG 저장에는 canvas만 담겨. uicontrol은 포함되지 않아.

## 문제 해결

- **`jsonencode 가 필요해`**: Octave 버전이 7 미만이야. `version`으로 확인해 봐.
- **위젯 자리에 아무것도 안 뜨거나 `Error rendering widget`이 표시됨**: 위의 설치 5번 항목(위젯 스크립트 소스)을 확인해. 그리고 `pip show anywidget ipywidgets`로 커널 파이썬 환경에 두 패키지가 깔려 있는지도 확인해.
- **`%webfig`를 실행해도 아무 출력이 없음**: 매직이 로드되지 않아서 Octave가 그 줄을 주석으로 처리한 거야. 커널을 재시작하고, `<그 파이썬> -m octave_webfig where`로 매직 파일이 있는지 확인해.
- **콜백 에러**: 그림 아래 콘솔에 빨간색으로 표시돼. 콘솔은 `›_` 버튼으로 열고 닫을 수 있어.
- 제거: `python -m octave_webfig uninstall` 후 `pip uninstall octave-webfig`.

## 폴더 구조

```
octave_webfig/
  m/                  Octave 쪽 코드 (직렬화·콜백 실행·drawnow 훅). 커널이 addpath 함
  static/webfig.js    출력 셀 렌더러 (canvas 2D/3D, uicontrol, 마우스 조작)
  static/webfig.css
  widget.py           anywidget 위젯 정의
  manager.py          octave_kernel 실행 후킹, 이벤트 처리, 프레임 감시 스레드
  magic.py            %webfig / %%webfig 매직
  __main__.py         install / uninstall
examples/webfig_demo.ipynb
dev/                  렌더러 테스트 하네스. 로컬 웹 서버로 dev/harness.html을 열면 Octave 없이 브라우저에서
                      렌더러를 확인할 수 있음 (샘플은 dev/make_samples.py로 생성)
```

## 라이선스

[MIT](LICENSE)
