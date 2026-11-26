#!/usr/bin/env python3
"""Timelapse لمشروع من صور وايت هيلمت.
الاستخدام: python3 -I timelapse.py <PROJECT_DIR> <out.mp4> "<اسم المشروع>" [--secs 24]
PROJECT_DIR فيه فولدر لكل نقطة تصوير، وجوه كل فولدر صور باسم YYYY-MM-DD.jpg
"""
import sys, os, glob, subprocess, argparse, datetime
import cv2, numpy as np
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "..", "..", "fonts", "ExpoArabic-Medium.ttf")
LOGO = os.path.join(HERE, "logo_white.png")
GREEN, GOLD = (14, 59, 39), (201, 169, 97)  # #0E3B27 , #C9A961
W, H, FPS = 1920, 1080, 30

from PIL import features as _ft
def ar(s): return s if _ft.check("raqm") else get_display(arabic_reshaper.reshape(s))

def load_point(d):
    files = sorted(glob.glob(os.path.join(d, "*.jp*g")))
    out, prev_hash = [], None
    for f in files:
        img = cv2.imread(f)
        if img is None or img.shape[0] < 200: continue            # بايظة
        g = cv2.cvtColor(cv2.resize(img, (64, 36)), cv2.COLOR_BGR2GRAY)
        if prev_hash is not None and np.abs(g.astype(int) - prev_hash).mean() < 1.5: continue  # مكررة
        if cv2.Laplacian(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var() < 15: continue  # مهزوزة جداً
        prev_hash = g.astype(int)
        out.append((os.path.basename(f).split(".")[0], img))
    return out

def fit(img, w, h):
    ih, iw = img.shape[:2]; s = max(w / iw, h / ih)
    r = cv2.resize(img, (int(iw * s + .5), int(ih * s + .5)), interpolation=cv2.INTER_AREA)
    y, x = (r.shape[0] - h) // 2, (r.shape[1] - w) // 2
    return r[y:y + h, x:x + w]

def align(frames, w, h):
    """محاذاة كل صورة على مرجعية (صورة في النص) بـ SIFT + homography RANSAC، ثم CLAHE + histogram matching."""
    frames = [(d, fit(i, w, h)) for d, i in frames]
    ref = frames[len(frames) // 2][1]
    sift = cv2.SIFT_create(4000)
    rg = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY); kr, dr = sift.detectAndCompute(rg, None)
    bf = cv2.BFMatcher(); clahe = cv2.createCLAHE(2.0, (8, 8))
    ref_lab = cv2.cvtColor(ref, cv2.COLOR_BGR2LAB)
    out, dropped = [], 0
    for d, img in frames:
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY); k, ds = sift.detectAndCompute(g, None)
        warped = img
        if ds is not None and len(k) > 20:
            m = [p[0] for p in bf.knnMatch(ds, dr, k=2) if len(p) == 2 and p[0].distance < 0.75 * p[1].distance]
            if len(m) >= 25:
                Hm, mask = cv2.findHomography(np.float32([k[a.queryIdx].pt for a in m]),
                                              np.float32([kr[a.trainIdx].pt for a in m]), cv2.RANSAC, 4.0)
                # رفض الهوموجرافي الشاذة (الكاميرا اتحركت جامد)
                if Hm is not None and mask.sum() >= 20 and abs(np.linalg.det(Hm[:2, :2]) - 1) < 0.35:
                    warped = cv2.warpPerspective(img, Hm, (w, h), borderMode=cv2.BORDER_REFLECT)
                else: dropped += 1; continue
        lab = cv2.cvtColor(warped, cv2.COLOR_BGR2LAB)
        L = clahe.apply(lab[..., 0])
        # مطابقة متوسط/انحراف الإضاءة مع المرجعية
        L = np.clip((L - L.mean()) / (L.std() + 1e-6) * ref_lab[..., 0].std() + ref_lab[..., 0].mean(), 0, 255)
        lab[..., 0] = L.astype(np.uint8)
        out.append((d, cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)))
    print(f"  {len(out)} صورة بعد المحاذاة، اتشال {dropped}", file=sys.stderr)
    return out

def overlay(canvas, title, date, labels):
    im = Image.fromarray(cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)).convert("RGBA")
    lay = Image.new("RGBA", im.size, (0, 0, 0, 0)); dr = ImageDraw.Draw(lay)
    dr.rectangle([0, H - 120, W, H], fill=GREEN + (225,)); dr.rectangle([0, H - 124, W, H - 120], fill=GOLD + (255,))
    f1, f2, f3 = (ImageFont.truetype(FONT, s) for s in (44, 54, 30))
    t = ar(title); dr.text((W - 40 - dr.textlength(t, font=f1), H - 92), t, font=f1, fill=(255, 255, 255))
    dr.text((40, H - 98), date, font=f2, fill=GOLD)
    for (x, y), lab in labels:
        s = ar(lab); tw = dr.textlength(s, font=f3)
        dr.rounded_rectangle([x + 20, y + 20, x + 44 + tw, y + 70], 10, fill=GREEN + (200,))
        dr.text((x + 32, y + 26), s, font=f3, fill=GOLD)
    logo = Image.open(LOGO).convert("RGBA"); logo.thumbnail((220, 104))
    dr.rounded_rectangle([W - logo.width - 56, 24, W - 24, 48 + logo.height], 14, fill=GREEN + (200,))
    lay.alpha_composite(logo, (W - logo.width - 40, 36))
    return cv2.cvtColor(np.array(Image.alpha_composite(im, lay).convert("RGB")), cv2.COLOR_RGB2BGR)

def main():
    p = argparse.ArgumentParser(); p.add_argument("proj"); p.add_argument("out"); p.add_argument("title")
    p.add_argument("--secs", type=float, default=24); a = p.parse_args()
    pts = sorted(d for d in glob.glob(os.path.join(a.proj, "*")) if os.path.isdir(d))
    n = len(pts); cols = 1 if n == 1 else 2; rows = (n + cols - 1) // cols
    cw, ch = W // cols, (H - 120) // rows if n > 1 else H
    data = {}
    for d in pts:
        print(os.path.basename(d), file=sys.stderr)
        fr = load_point(d)
        if len(fr) >= 2: data[os.path.basename(d)] = align(fr, cw, ch)
    dates = sorted({dt for v in data.values() for dt, _ in v})
    nframes = int(a.secs * FPS); hold = int(1.5 * FPS)
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}",
                           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
                           "-movflags", "+faststart", a.out], stdin=subprocess.PIPE)
    span = nframes - hold
    for i in range(nframes):
        t = min(i, span - 1) / max(span - 1, 1) * (len(dates) - 1)
        canvas = np.zeros((H, W, 3), np.uint8); canvas[:] = GREEN[::-1]; labels = []
        for j, (name, fr) in enumerate(data.items()):
            # لكل نقطة: آخر صورة قبل التاريخ الحالي + crossfade للي بعدها
            ds = [dt for dt, _ in fr]; cur = dates[int(t)]; nxt = dates[min(int(t) + 1, len(dates) - 1)]
            k0 = max([q for q, dt in enumerate(ds) if dt <= cur] or [0]); k1 = max([q for q, dt in enumerate(ds) if dt <= nxt] or [0])
            f = t - int(t); img = fr[k0][1] if k0 == k1 else cv2.addWeighted(fr[k0][1], 1 - f, fr[k1][1], f, 0)
            x, y = (j % cols) * cw, (j // cols) * ch; canvas[y:y + ch, x:x + cw] = img
            if n > 1: labels.append(((x, y), name))
        ff.stdin.write(overlay(canvas, a.title, dates[int(round(t))], labels).tobytes())
    ff.stdin.close(); ff.wait()
    print(f"من {dates[0]} لـ {dates[-1]}  ({(datetime.date.fromisoformat(dates[-1]) - datetime.date.fromisoformat(dates[0])).days} يوم)")

if __name__ == "__main__": main()
