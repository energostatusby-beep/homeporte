"""Build a static release for Moguta's image file manager; never bundle private files."""
import argparse
import base64
import json
import re
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--release', required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
if not re.fullmatch(r'homeporte-[a-z0-9-]+', args.release):
    raise SystemExit('Invalid release name')
root = Path(__file__).resolve().parent.parent
prefix = '/mg-templates/homeporte/images/' + args.release + '/'
args.output.parent.mkdir(parents=True, exist_ok=True)

def page(name):
    text = (root / name).read_text()
    text = text.replace('https://energostatusby-beep.github.io/homeporte/', 'https://homeporte.by/')
    text = text.replace('https://homeporte.by/assets/', 'https://homeporte.by' + prefix + 'assets/')
    text = re.sub(r'(?<![\w/])(?:assets|css|js)/', lambda m: prefix + m.group(), text)
    icon = base64.b64encode((root / 'favicon.svg').read_bytes()).decode()
    text = text.replace('href="favicon.svg"', 'href="data:image/svg+xml;base64,' + icon + '"')
    text = text.replace('href="index.html', 'href="/').replace('href="guide.html"', 'href="/guide.html"')
    # Moguta protects non-image files inside its image directory. Render CSS/JS
    # inside the page through template.php; keep image protection unchanged.
    css = (root / 'css/style.css').read_text().replace('../assets/', prefix + 'assets/')
    text = re.sub(r'<link rel="stylesheet" href="' + re.escape(prefix) + r'css/style\.css[^\"]*">', lambda m: '<style>\n' + css + '\n</style>', text)
    js = (root / 'js/main.js').read_text()
    js = re.sub(r'(?<![\w/])assets/', prefix + 'assets/', js)
    text = re.sub(r'<script src="' + re.escape(prefix) + r'js/main\.js[^\"]*"[^>]*></script>', lambda m: '<script>\n' + js + '\n</script>', text)
    text = re.sub(r'  <!-- При переезде на собственный домен[^>]+-->\n', '', text)
    if name == 'index.html':
        text = text.replace('</head>', '  <meta name="homeporte-lead-api" content="/ajax">\n  <meta name="yandex-verification" content="de520ce825c8dab5">\n  <meta name="google-site-verification" content="fVHUrhCPY2FuY1tlsND3gfHBhBhgqZ6ey6IWb_69xIk">\n</head>')
    else:
        text = text.replace('</head>', '  <link rel="canonical" href="https://homeporte.by/guide.html">\n</head>')
    return text

with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in ('index.html', 'guide.html'):
        archive.writestr(args.release + '/' + name, page(name))
    for name in ('favicon.svg', 'css/style.css', 'js/main.js'):
        text = (root / name).read_text()
        if name.endswith('.js'):
            text = re.sub(r'(?<![\w/])assets/', prefix + 'assets/', text)
        archive.writestr(args.release + '/' + name, text)
    for file in sorted((root / 'assets').rglob('*')):
        if file.is_file() and file.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp', '.svg', '.woff', '.woff2'}:
            archive.write(file, args.release + '/' + file.relative_to(root).as_posix())
    archive.writestr(args.release + '/release.json', json.dumps({'release': args.release, 'canonical': 'https://homeporte.by/'}))
    print(json.dumps({'archive': str(args.output), 'files': len(archive.namelist()), 'prefix': prefix}))
