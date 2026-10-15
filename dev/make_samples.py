"""렌더러 테스트용 샘플 figure JSON 생성 (Octave jsonencode 출력 형태를 흉내).

jsonencode 특성: 원소 1개 배열 → 스칼라, NaN → null, 빈 배열 → [].
"""

import json
import math
import struct
from pathlib import Path

import numpy as np

OUT = Path(__file__).parent / "samples"
OUT.mkdir(exist_ok=True)
_counter = [0]


def hid(v=None):
    if v is None:
        _counter[0] += 1
        v = -1.0 - _counter[0] * 0.0137
    return struct.pack(">d", float(v)).hex()


def row(v):
    v = np.asarray(v, dtype=float).ravel(order="F")
    lst = [None if not np.isfinite(x) else float(x) for x in v]
    if len(lst) == 1:
        return lst[0]
    return lst


def M(X):
    X = np.asarray(X, dtype=float)
    if X.ndim == 1:
        X = X[None, :]
    return {"s": row(list(X.shape)) if X.ndim > 1 else [1, X.size], "d": row(X.ravel(order="F")) if X.size else []}


def text(s, **kw):
    t = {
        "type": "text", "id": hid(), "visible": True, "string": [s] if s else [], "pos": [0, 0, 0],
        "units": "data", "color": [0.15, 0.15, 0.15], "fontsize": 11, "fontweight": "normal",
        "fontangle": "normal", "halign": "center", "valign": "middle", "rotation": 0,
        "interpreter": "tex", "bg": "none", "edgecolor": "none",
    }
    t.update(kw)
    return t


def axes(pos, children, **kw):
    a = {
        "type": "axes", "id": hid(), "tag": "", "pos": pos, "visible": True, "color": [1, 1, 1],
        "fontsize": 10, "linewidth": 0.5, "box": True, "layer": "bottom", "tickdir": "in",
        "view": [0, 90], "dar": [1, 1, 1], "darmode": "auto", "pbar": [1, 1, 1], "pbarmode": "auto",
        "clim": [0, 1], "gridcolor": [0.15, 0.15, 0.15], "gridalpha": 0.15,
        "xaxislocation": "bottom", "yaxislocation": "left", "colormap": M(viridis(64)),
        "title": text(""), "children": children,
    }
    for n in "xyz":
        a.update({
            n + "lim": [0, 1], n + "limmode": "auto", n + "scale": "linear", n + "dir": "normal",
            n + "tick": [], n + "tickmode": "auto", n + "ticklabel": [], n + "ticklabelmode": "auto",
            n + "color": [0.15, 0.15, 0.15], n + "grid": False, n + "minorgrid": False,
            n + "label": text(""),
        })
    a.update(kw)
    return a


def line(x, y, z=(), **kw):
    o = {
        "type": "line", "id": hid(), "visible": True, "x": row(x), "y": row(y), "z": row(z) if len(z) else [],
        "color": [0, 0.447, 0.741], "ls": "-", "lw": 0.5, "marker": "none", "ms": 6, "mec": "auto",
        "mfc": "none", "name": "",
    }
    o.update(kw)
    return o


def ui(style, pos, string="", **kw):
    o = {
        "type": "uicontrol", "id": hid(), "style": style, "visible": True, "enable": "on", "pos": pos,
        "string": (string if isinstance(string, list) else [string]) if string else [], "value": 0, "min": 0, "max": 1, "sliderstep": [0.01, 0.1],
        "bg": [0.94, 0.94, 0.94], "fg": [0, 0, 0], "fontsize": 10, "fontweight": "normal",
        "halign": "center", "tooltip": "", "tag": "", "hascb": True,
    }
    o.update(kw)
    return o


def figure(num, size, children, name="", **kw):
    f = {
        "type": "figure", "id": hid(num), "number": num, "name": name, "numbertitle": False if name else True,
        "size": size, "color": [0.94, 0.94, 0.94], "colormap": M(viridis(64)), "children": children,
    }
    f.update(kw)
    return f


def viridis(n):
    anchors = np.array([
        [0.267, 0.005, 0.329], [0.283, 0.141, 0.458], [0.254, 0.265, 0.530], [0.207, 0.372, 0.553],
        [0.164, 0.471, 0.558], [0.128, 0.567, 0.551], [0.135, 0.659, 0.518], [0.267, 0.749, 0.441],
        [0.478, 0.821, 0.318], [0.741, 0.873, 0.150], [0.993, 0.906, 0.144],
    ])
    t = np.linspace(0, 1, n)
    xs = np.linspace(0, 1, len(anchors))
    return np.stack([np.interp(t, xs, anchors[:, k]) for k in range(3)], axis=1)


def jet(n):
    t = np.linspace(0, 1, n)
    r = np.clip(1.5 - abs(4 * t - 3), 0, 1)
    g = np.clip(1.5 - abs(4 * t - 2), 0, 1)
    b = np.clip(1.5 - abs(4 * t - 1), 0, 1)
    return np.stack([r, g, b], axis=1)


# ---------------------------------------------------------------- 1. 로봇팔 GUI
def robot(t1=0.6, t2=-0.9):
    L1, L2 = 1.0, 0.8
    lim = (L1 + L2) * 1.1
    x1, y1 = L1 * math.cos(t1), L1 * math.sin(t1)
    x2, y2 = x1 + L2 * math.cos(t1 + t2), y1 + L2 * math.sin(t1 + t2)
    ax = axes(
        [60, 225, 480, 250],
        [
            line([0, x1, x2], [0, y1, y2], color=[0, 0, 1], lw=3, marker="o", ms=8),
            line([x2], [y2], color=[1, 0, 0], ls="none", marker="o", ms=10, mfc=[1, 0, 0]),
            line([0], [0], color=[0, 0, 0], ls="none", marker="s", ms=12, mfc=[0, 0, 0]),
        ],
        xlim=[-lim, lim], ylim=[-lim, lim], xlimmode="manual", ylimmode="manual",
        darmode="manual", xgrid=True, ygrid=True,
        title=text("Robot Arm Position"), xlabel=text("X position"), ylabel=text("Y position"),
    )
    kids = [
        ax,
        ui("text", [30, 160, 100, 20], "Theta 1: "),
        ui("slider", [140, 160, 320, 20], value=t1, min=-math.pi, max=math.pi, tag="t1"),
        ui("text", [480, 160, 50, 20], f"{math.degrees(t1):5.1f}"),
        ui("text", [30, 120, 100, 20], "Theta 2: "),
        ui("slider", [140, 120, 320, 20], value=t2, min=-math.pi, max=math.pi, tag="t2"),
        ui("text", [480, 120, 50, 20], f"{math.degrees(t2):5.1f}"),
        ui("text", [140, 70, 320, 20], f"End effector: ({x2:.3f}, {y2:.3f})"),
    ]
    return figure(1, [600, 500], kids, name="2-DOF Robot Arm Kinematics")


# ---------------------------------------------------------------- 2. surf + colorbar
def surf_fig():
    x = np.linspace(-3, 3, 33)
    X, Y = np.meshgrid(x, x)
    Z = 3 * (1 - X) ** 2 * np.exp(-X**2 - (Y + 1) ** 2) - 10 * (X / 5 - X**3 - Y**5) * np.exp(-X**2 - Y**2) - 1 / 3 * np.exp(-(X + 1) ** 2 - Y**2)
    zl = [math.floor(Z.min()), math.ceil(Z.max())]
    surf = {
        "type": "surface", "id": hid(), "visible": True, "x": M(X), "y": M(Y), "z": M(Z), "c": M(Z),
        "facecolor": "flat", "edgecolor": [0, 0, 0], "facealpha": 1, "edgealpha": 1, "ls": "-", "lw": 0.5,
        "marker": "none", "ms": 6, "mec": "auto", "mfc": "none", "meshstyle": "both", "cdatamapping": "scaled", "name": "",
    }
    th = np.linspace(0, 6 * math.pi, 200)
    helix = line(2.5 * np.cos(th) * 0 + 3 * np.cos(th) * 0.9, 2.7 * np.sin(th), np.linspace(zl[0], zl[1], 200), color=[0.85, 0.33, 0.1], lw=1.5)
    ax = axes(
        [70, 50, 380, 330], [surf, helix], view=[-37.5, 30], xlim=[-3, 3], ylim=[-3, 3], zlim=zl,
        clim=[float(Z.min()), float(Z.max())], xgrid=True, ygrid=True, zgrid=True, box=False,
        title=text("peaks + helix"), xlabel=text("x"), ylabel=text("y"), zlabel=text("z"), colormap=M(jet(64)),
    )
    cb_img = np.arange(1, 65)[:, None]
    cb = axes(
        [490, 50, 20, 330],
        [{"type": "image", "id": hid(), "visible": True, "src": "", "cols": 1, "rows": 64, "xdata": [1, 1], "ydata": [float(Z.min()), float(Z.max())]}],
        tag="colorbar", xtick=[], xtickmode="manual", yaxislocation="right", xlim=[0.5, 1.5], ylim=[float(Z.min()), float(Z.max())],
    )
    return figure(2, [560, 420], [ax, cb])


# ---------------------------------------------------------------- 3. subplot + legend + log + bar
def subplot_fig():
    t = np.linspace(0, 2 * math.pi, 120)
    s1 = line(t, np.sin(t), lw=1.5, name="sin")
    s2 = line(t, np.cos(t), lw=1.5, ls="--", color=[0.85, 0.325, 0.098], name="cos")
    a1 = axes([60, 250, 460, 140], [s1, s2, text("\\theta = \\pi", pos=[math.pi, 0.2, 0], halign="left", fontsize=10)],
              xlim=[0, 2 * math.pi], ylim=[-1, 1], xgrid=True, ygrid=True, title=text("sin / cos"), xlabel=text("\\theta [rad]"))
    lg = {"type": "legend", "id": hid(), "visible": True, "pos": [0, 0, 0, 0], "location": "northeast", "orientation": "vertical",
          "strings": ["sin(\\theta)", "cos(\\theta)"], "textcolor": [0, 0, 0], "color": [1, 1, 1], "edgecolor": [0.15, 0.15, 0.15],
          "box": True, "fontsize": 9, "numcolumns": 1, "axes": a1["id"],
          "items": [{"kind": "line", "color": s1["color"], "ls": "-", "lw": 1.5, "marker": "none", "ms": 6, "mec": "auto", "mfc": "none", "facecolor": "none", "edgecolor": "none"},
                    {"kind": "line", "color": s2["color"], "ls": "--", "lw": 1.5, "marker": "none", "ms": 6, "mec": "auto", "mfc": "none", "facecolor": "none", "edgecolor": "none"}]}
    xs = np.logspace(0, 4, 9)
    a2 = axes([60, 50, 200, 140], [line(xs, xs**1.5, marker="o", mfc=[0.3, 0.6, 1], color=[0, 0.3, 0.8])],
              xscale="log", yscale="log", xlim=[1, 1e4], ylim=[1, 1e6], xgrid=True, ygrid=True, title=text("log-log"))
    # bar (patch)
    verts, faces, vals = [], [], [3, 5, 2, 6, 4]
    for i, v in enumerate(vals):
        b = len(verts)
        x0 = i + 1 - 0.4
        verts += [[x0, 0], [x0 + 0.8, 0], [x0 + 0.8, v], [x0, v]]
        faces.append([b + 1, b + 2, b + 3, b + 4])
    patch = {"type": "patch", "id": hid(), "visible": True, "faces": M(np.array(faces)), "vertices": M(np.array(verts)), "fvcdata": M(np.zeros((0, 0))),
             "facecolor": [0.466, 0.674, 0.188], "edgecolor": [0, 0, 0], "facealpha": 1, "edgealpha": 1, "ls": "-", "lw": 0.5,
             "marker": "none", "ms": 6, "mec": "auto", "mfc": "none", "cdatamapping": "scaled", "name": ""}
    a3 = axes([320, 50, 200, 140], [patch], xlim=[0, 6], ylim=[0, 7], title=text("bar"), ygrid=True,
              xtick=[1, 2, 3, 4, 5], xtickmode="manual", xticklabel=["A", "B", "C", "D", "E"], xticklabelmode="manual")
    return figure(3, [560, 440], [a1, a2, a3, lg], color=[1, 1, 1])


# ---------------------------------------------------------------- 4. 컨트롤 모음
def controls_fig():
    th = np.linspace(0, 2 * math.pi, 7)
    pts = {"type": "scatter", "id": hid(), "visible": True, "x": row(np.random.default_rng(1).normal(size=60)),
           "y": row(np.random.default_rng(2).normal(size=60)), "z": [], "sizedata": row(np.random.default_rng(3).uniform(20, 120, 60)),
           "c": M(np.random.default_rng(4).uniform(0, 1, 60)[:, None]), "marker": "o", "mec": "flat", "mfc": "flat", "lw": 0.5,
           "cdatamapping": "scaled", "name": ""}
    ax = axes([40, 40, 280, 280], [pts, line(np.cos(th) * 2, np.sin(th) * 2, color=[0.5, 0.5, 0.5], ls=":")],
              xlim=[-3, 3], ylim=[-3, 3], darmode="manual", title=text("scatter"))
    g = {"type": "uibuttongroup", "id": hid(), "pos": [350, 230, 190, 110], "title": "Mode", "titleposition": "lefttop",
         "bg": [0.94, 0.94, 0.94], "fg": [0, 0, 0], "bordertype": "etchedin", "borderwidth": 1, "fontsize": 9, "visible": True,
         "selected": "", "children": []}
    r1 = ui("radiobutton", [10, 60, 160, 22], "Position", value=1)
    r2 = ui("radiobutton", [10, 34, 160, 22], "Velocity")
    r3 = ui("radiobutton", [10, 8, 160, 22], "Torque")
    g["children"] = [r1, r2, r3]
    g["selected"] = r1["id"]
    kids = [
        ax, g,
        ui("checkbox", [350, 195, 190, 22], "Show trail", value=1),
        ui("popupmenu", [350, 160, 190, 24], "PID|LQR|MPC", value=2, bg=[1, 1, 1]),
        ui("edit", [350, 125, 190, 24], "0.25", bg=[1, 1, 1]),
        ui("listbox", [350, 55, 90, 62], string=["J1", "J2", "J3", "J4", "J5"], value=[2, 4], max=2, bg=[1, 1, 1]),
        ui("pushbutton", [450, 85, 90, 32], "Reset"),
        ui("togglebutton", [450, 52, 90, 28], "Run", value=1),
        ui("slider", [555, 40, 20, 300], value=0.3),
    ]
    return figure(4, [600, 360], kids, name="Controls")


def image_fig():
    n = 40
    yy, xx = np.mgrid[0:n, 0:n]
    C = np.sin(xx / 5.0) * np.cos(yy / 7.0)
    ax = axes([60, 40, 300, 300], [{"type": "image", "id": hid(), "visible": True, "src": "IMG", "cols": n, "rows": n, "xdata": [1, n], "ydata": [1, n]}],
              xlim=[0.5, n + 0.5], ylim=[0.5, n + 0.5], ydir="reverse", darmode="manual", title=text("imagesc (axis image)"), box=True)
    return figure(5, [420, 380], [ax]), C


if __name__ == "__main__":
    (OUT / "robot.json").write_text(json.dumps(robot()))
    (OUT / "surf.json").write_text(json.dumps(surf_fig()))
    (OUT / "subplot.json").write_text(json.dumps(subplot_fig()))
    (OUT / "controls.json").write_text(json.dumps(controls_fig()))
    f, C = image_fig()
    # 이미지: PNG data URI
    from PIL import Image
    import base64, io

    cm = viridis(64)
    idx = np.clip(((C - C.min()) / (C.max() - C.min()) * 64).astype(int), 0, 63)
    rgb = (cm[idx] * 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(rgb).save(buf, format="PNG")
    f["children"][0]["children"][0]["src"] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    (OUT / "image.json").write_text(json.dumps(f))
    # colorbar 이미지
    s = json.loads((OUT / "surf.json").read_text())
    cb = jet(64)[::-1][:, None, :]  # 행 1 = 아래(ydir normal → 아래로 뒤집혀 그려짐)
    cb = jet(64)[:, None, :]
    buf = io.BytesIO()
    Image.fromarray((cb * 255).astype(np.uint8)).save(buf, format="PNG")
    s["children"][1]["children"][0]["src"] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    (OUT / "surf.json").write_text(json.dumps(s))
    print("ok", [p.name for p in OUT.iterdir()])
