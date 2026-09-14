# Image Processing Lab — Professional Edition

An interactive, fully client-side implementation of **11 digital image processing practicals**
(5th semester · Computer Science & Engineering). All operations run in the browser through
**OpenCV.js 4.13** — no image ever leaves the user's session.

## Experiments

| # | Practical | Operations |
|---|-----------|------------|
| 01 | Prelab / Setup | Python environment overview, quick-start guide |
| 02 | RGB, Grayscale & Operations | Grayscale, RGB, add/subtract, bitwise AND / OR / XOR / NOT |
| 03 | Geometric Transformations | Translation, rotation, scaling, shearing, reflection, cropping |
| 04 | Image Enhancement | Histogram equalization, smoothing, sharpening, thresholding |
| 05 | Spatial Domain Filters | Averaging, Gaussian, median, bilateral (3×3 / 5×5 / 7×7) |
| 06 | Image Inpainting | Brush a mask, Telea & Navier–Stokes methods |
| 07 | Lossless Compression | Run-Length Encoding with size comparison |
| 08 | Morphological Operations | Erosion, dilation, opening, closing on binarized input |
| 09 | Correlation Detection | Normalized template matching (TM_CCOEFF_NORMED) |
| 10 | Colour Spaces | RGB, HSV, YCrCb, Lab |
| 11 | Edge Detection | Canny (adjustable thresholds), Sobel, Prewitt |

## Project structure

```
image-processing-lab/
├── index.html    # UI structure — all 11 experiment panels
├── style.css     # design system (light workspace + dark rail, indigo/violet accent)
├── app.js        # experiment logic (OpenCV.js calls), toasts, results, uploads
├── api.js        # optional Spring Boot bridge (POST /api/runs, GET /api/student)
├── opencv.js     # local copy of OpenCV.js 4.13 (CDN fallback built in)
└── README.md
```

## Run locally

Any static file server works:

```bash
cd image-processing-lab
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

The site is 100 % static — deploy the folder to **Vercel**, Netlify, GitHub Pages, etc.
No build step is required. `opencv.js` is bundled locally, and `index.html` falls back to
the official `docs.opencv.org` build automatically if the local copy is missing.

## Notes

- **Privacy:** uploaded images stay in the browser session; nothing is uploaded to a server.
- **Optional backend:** `api.js` records experiment runs when a Spring Boot backend is
  available at `/api` (set `window.API_BASE` to point elsewhere). Without a backend,
  everything still works — the calls fail silently.
- **Student badge:** edit the name/roll number in `index.html` (`#studentName`,
  `#studentMeta`), or serve it from the optional backend via `GET /api/student`.
