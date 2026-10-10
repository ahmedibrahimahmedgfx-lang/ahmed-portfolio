#!/usr/bin/env python3
"""
Builds every web-ready media file for the site from the original sources.

Sources (defaults assume this repo sits inside the 2027 portfolio folder):
  --artboards  ../288ppi                       (7680x4320 page renders of the portfolio, "Artboard N.jpg")
  --motion     ../AHMED_PORTFOLIO_WEB/05_MOTION (original films)

Outputs:
  public/media/img/<id>-<width>.avif|webp
  public/media/motion/*.mp4|webm|webp
  src/data/media.json   (dimensions, widths, placeholder colour + tiny blur for every image)

Usage:
  python3 scripts/media/build_media.py               # everything
  python3 scripts/media/build_media.py --only images # or: --only video
  python3 scripts/media/build_media.py --ids shafaq-cover,shafaq-01

Requires: Python 3.9+, Pillow >= 11.2 (with AVIF), ffmpeg (libx264, libvpx-vp9).
"""
import argparse, base64, io, json, os, subprocess, sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
WIDTHS = [720, 1280, 2048]
SCALE = 4  # artboards are 4x the 1920x1080 page grid used in images.json


def page_to_artboard(p: int) -> int:
    # The 288 ppi export skips a few artboard numbers; this maps PDF page -> artboard file.
    if p <= 82: return p + 1
    if p <= 85: return p + 2
    if p == 86: return 88
    if p <= 88: return p + 3
    if p == 89: return 93
    if p <= 93: return p + 5
    return p + 6


def build_image(args):
    mid, spec, artboards, out_dir, force = args
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    src = Path(artboards) / f"Artboard {page_to_artboard(spec['page'])}.jpg"
    x0, y0, x1, y1 = [v * SCALE for v in spec['box']]
    im = Image.open(src).convert('RGB').crop((x0, y0, x1, y1))
    w, h = im.size
    widths = [x for x in WIDTHS if x < w] + [min(w, WIDTHS[-1])]
    widths = sorted(set(widths))
    for tw in widths:
        th = round(h * tw / w)
        a = Path(out_dir) / f"{mid}-{tw}.avif"
        b = Path(out_dir) / f"{mid}-{tw}.webp"
        if a.exists() and b.exists() and not force:
            continue
        r = im.resize((tw, th), Image.LANCZOS)
        r.save(b, 'WEBP', quality=80, method=5)
        r.save(a, 'AVIF', quality=58, speed=6)
    # placeholder: average colour + 20px blur preview
    tiny = im.resize((20, max(1, round(20 * h / w))), Image.LANCZOS)
    buf = io.BytesIO(); tiny.save(buf, 'WEBP', quality=40)
    avg = im.resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    return mid, {
        'w': round(w / 2), 'h': round(h / 2),  # intrinsic size of the largest useful render
        'ratio': round(w / h, 4), 'widths': widths,
        'color': '#%02x%02x%02x' % avg,
        'blur': 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode(),
    }


# ---------------------------------------------------------------- video
Q_PIC = 'crop=2560:967:0:193'          # The Question: letterbox and burned subtitles removed (previews only)
Q_FILM = 'crop=2560:1054:0:193'        # The Question: letterbox removed, subtitles kept (full film)

VIDEO = [
    # id, source, kind, segments [(start, dur)], vf, width, extras
    ('the-question-loop', '01_THE_QUESTION.mov', 'loop',
     [(0.5, 2.4), (10.3, 2.4), (20.6, 1.6), (34.2, 2.2), (49.3, 2.0)], Q_PIC, [1600, 960]),
    ('the-question-film', '01_THE_QUESTION.mov', 'film', None, Q_FILM, [1920]),
    ('mini-showreel-loop', '02_MINI_SHOWREEL.mp4', 'loop', None, None, [1280, 720]),
    ('mini-showreel-film', '02_MINI_SHOWREEL.mp4', 'film', None, None, [1920]),
    ('mac-app-film-loop', '03_MACC_FILM.mp4', 'loop', None, None, [540, 360]),
    ('mac-app-film-film', '03_MACC_FILM.mp4', 'film', None, None, [720]),
]
POSTERS = [  # id, source, time, vf, width
    ('the-question-poster', '01_THE_QUESTION.mov', 10.9, Q_PIC, 1600),
    ('the-question-poster-eyes', '01_THE_QUESTION.mov', 1.2, Q_PIC, 1600),
    ('the-question-poster-stairs', '01_THE_QUESTION.mov', 35.0, Q_PIC, 1600),
    ('the-question-poster-mirror', '01_THE_QUESTION.mov', 50.2, Q_PIC, 1600),
    ('mini-showreel-poster', '02_MINI_SHOWREEL.mp4', 2.5, None, 1280),
    ('mini-showreel-poster-cards', '02_MINI_SHOWREEL.mp4', 9.8, None, 1280),
    ('mac-app-film-poster', '03_MACC_FILM.mp4', 0.6, None, 720),
    ('mac-app-film-poster-tech', '03_MACC_FILM.mp4', 5.2, None, 720),
    ('mac-app-film-poster-cta', '03_MACC_FILM.mp4', 14.2, None, 720),
]


def ff(cmd):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y'] + cmd, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-1500:], file=sys.stderr)
        raise SystemExit('ffmpeg failed')


def build_video(motion, out, force=False, only=None, meta=None, posters=True):
    out.mkdir(parents=True, exist_ok=True)
    meta = meta or {}
    for vid, src, kind, segs, vf, widths in VIDEO:
        s = str(Path(motion) / src)
        for w in widths:
            if only and f'{vid}-{w}' not in only:
                continue
            scale = f'scale={w}:-2:flags=lanczos'
            chain = ','.join([x for x in (vf, scale) if x])
            base = out / (f'{vid}-{w}')
            if kind == 'loop':
                if segs:
                    parts = []
                    for i, (a, d) in enumerate(segs):
                        parts.append(f'[0:v]trim=start={a}:duration={d},setpts=PTS-STARTPTS,{chain},format=yuv420p[v{i}]')
                    fc = ';'.join(parts) + ';' + ''.join(f'[v{i}]' for i in range(len(segs))) + f'concat=n={len(segs)}:v=1:a=0[out]'
                    vin = ['-i', s, '-filter_complex', fc, '-map', '[out]']
                else:
                    vin = ['-i', s, '-vf', chain + ',format=yuv420p']
                if force or not Path(f'{base}.mp4').exists():
                    ff(vin + ['-an', '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-profile:v', 'high',
                              '-movflags', '+faststart', f'{base}.mp4'])
                if force or not Path(f'{base}.webm').exists():
                    ff(vin + ['-an', '-r', '30', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '33', '-row-mt', '1',
                              '-deadline', 'good', '-cpu-used', '4', f'{base}.webm'])
            else:
                if force or not Path(f'{base}.mp4').exists():
                    ff(['-i', s, '-vf', chain + ',format=yuv420p', '-r', '30', '-c:v', 'libx264', '-preset', 'medium',
                        '-crf', '24', '-maxrate', '3M', '-bufsize', '6M', '-c:a', 'aac', '-b:a', '128k',
                        '-movflags', '+faststart', f'{base}.mp4'])
            p = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                                'stream=width,height:format=duration', '-of', 'json', f'{base}.mp4'],
                               capture_output=True, text=True)
            j = json.loads(p.stdout)
            meta.setdefault(vid, {})[str(w)] = {'w': j['streams'][0]['width'], 'h': j['streams'][0]['height'],
                                               'duration': round(float(j['format']['duration']), 2),
                                               'webm': kind == 'loop'}
    from PIL import Image
    for pid, src, t, vf, w in (POSTERS if posters else []):
        tmp = out / f'{pid}.png'
        chain = ','.join([x for x in (vf, f'scale={w}:-2:flags=lanczos') if x])
        ff(['-ss', str(t), '-i', str(Path(motion) / src), '-frames:v', '1', '-vf', chain, str(tmp)])
        im = Image.open(tmp).convert('RGB')
        im.save(out / f'{pid}.webp', 'WEBP', quality=82)
        im.save(out / f'{pid}.avif', 'AVIF', quality=60)
        meta[pid] = {'w': im.size[0], 'h': im.size[1]}
        tmp.unlink()
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--artboards', default=str(ROOT.parent / '288ppi'))
    ap.add_argument('--motion', default=str(ROOT.parent / 'AHMED_PORTFOLIO_WEB' / '05_MOTION'))
    ap.add_argument('--only', choices=['images', 'video'])
    ap.add_argument('--ids')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--jobs', type=int, default=max(1, (os.cpu_count() or 2) - 0))
    a = ap.parse_args()

    manifest_path = ROOT / 'src' / 'data' / 'media.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'images': {}, 'video': {}}

    if a.only in (None, 'images') and not (a.ids and a.only is None):
        spec = json.loads((HERE / 'images.json').read_text())
        if a.ids:
            keep = set(a.ids.split(','))
            spec = {k: v for k, v in spec.items() if k in keep}
        out = ROOT / 'public' / 'media' / 'img'
        out.mkdir(parents=True, exist_ok=True)
        jobs = [(k, v, a.artboards, str(out), a.force) for k, v in spec.items()]
        with ProcessPoolExecutor(a.jobs) as ex:
            for mid, meta in ex.map(build_image, jobs):
                manifest['images'][mid] = meta
                print('img', mid, flush=True)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=1, sort_keys=True))

    if a.only in (None, 'video'):
        only = set(a.ids.split(',')) if a.ids else None
        manifest['video'] = build_video(a.motion, ROOT / 'public' / 'media' / 'motion', a.force, only,
                                        manifest.get('video', {}), posters=(only is None or 'posters' in only))
        manifest_path.write_text(json.dumps(manifest, indent=1, sort_keys=True))
        print('video done')


if __name__ == '__main__':
    main()
