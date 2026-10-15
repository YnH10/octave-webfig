# octave-webfig

[English](README.md) | 한국어

Jupyter 위젯 기반의 Jupyter / VS Code 노트북용 Octave 인터랙티브 figure.

`octave-webfig`는 [octave_kernel](https://github.com/Calysto/octave_kernel)에서 만든 figure를 정적 이미지 대신 출력 셀의 위젯으로 표시합니다. `uicontrol`이 포함된 figure도 표시되며, 콜백은 Octave 세션에서 실행됩니다.

<!-- ![demo](docs/demo.gif) -->

## 기능

- 2D 축 이동·확대, 3D 축 회전·확대
- `uicontrol`(slider, pushbutton, togglebutton, checkbox, radiobutton, edit, popupmenu, listbox, text), `uipanel`, `uibuttongroup`
- 함수 핸들, 셀 배열, 문자열 형식의 콜백
- 셀 실행 중 `drawnow` 실시간 반영
- figure 아래 콘솔에 콜백 출력 및 에러 표시

## 요구 사항

- GNU Octave 7 이상
- [octave_kernel](https://github.com/Calysto/octave_kernel)

## 설치

octave_kernel을 실행하는 파이썬 환경에 설치합니다.

```shell
git clone https://github.com/YnH10/octave-webfig
cd octave-webfig
pip install .
```

`%webfig` 매직을 등록합니다.

```shell
python -m octave_webfig install
```

커널 시작 시 자동으로 켜려면 `python -m octave_webfig install --auto`를 사용합니다.

설치 후 커널을 재시작합니다.

## 사용법

`%webfig` 매직으로 켭니다.

```
%webfig on
```

| 명령 | 설명 |
|---|---|
| `%webfig on` | 인터랙티브 figure 켜기 |
| `%webfig off` | 인터랙티브 figure 끄기 |
| `%%webfig` | 현재 셀에만 적용 |
| `%webfig status` | 현재 설정 표시 |
| `%webfig close` | `octave-webfig`가 관리하는 figure 모두 닫기 |
| `%webfig fps N` | `drawnow` 갱신 최대 프레임 수 설정 (기본값 30) |
| `%webfig live on\|off` | 슬라이더 콜백을 드래그 중에 실행할지, 놓을 때만 실행할지 설정 (기본값 on) |
| `%webfig max N` | 최대 figure 수 설정 (기본값 30) |
| `%webfig rerun close\|keep` | 셀 재실행 시 이전 figure를 닫을지 유지할지 설정 (기본값 close) |

예제 노트북: [examples/webfig_demo.ipynb](examples/webfig_demo.ipynb)

## 참고 사항

- figure는 그래픽 속성을 바탕으로 브라우저에서 렌더링합니다. line, patch, surface, image, scatter, text, legend, colorbar, subplot, 로그 스케일, 3D 보기를 지원합니다. 조명과 LaTeX 텍스트는 지원하지 않습니다.
- `octave-webfig`가 관리하는 figure는 `HandleVisibility`가 `off`로 설정됩니다. `close all`의 대상이 아니며, 이후 셀에서 현재 figure가 되지 않습니다.
- 브라우저에서의 확대·이동·회전은 figure 속성에 반영되지 않습니다.
- `ButtonDownFcn`, `KeyPressFcn`, `WindowButtonMotionFcn`은 지원하지 않습니다.
- VS Code에서는 위젯 스크립트 로드를 허용해야 합니다. `Jupyter › Widget Script Sources` 설정을 참고하세요.

## 지원 환경

Windows + VS Code에서 테스트했습니다. JupyterLab 및 기타 환경은 테스트하지 않았습니다.

## 제거

```shell
python -m octave_webfig uninstall
pip uninstall octave-webfig
```

## 라이선스

MIT
