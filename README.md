# PDFCraft — Free Online PDF Toolkit

A 100% client-side PDF toolkit with merge, split, compress, convert, and text-to-speech features. No server required — all processing happens in the browser.

## Features

- **Merge PDFs** — Combine multiple PDF files into one
- **Split PDF** — Extract pages by range or individually
- **Compress PDF** — Reduce file size with metadata removal
- **Images → PDF** — Convert JPG, PNG, GIF, BMP, WebP to PDF
- **PDF → Images** — Extract pages as PNG/JPEG with resolution control
- **Read Aloud** — Text-to-speech with voice, speed, and pitch control

## Tech Stack

- HTML5, CSS3, vanilla JavaScript
- [pdf-lib](https://pdf-lib.js.org/) — PDF manipulation
- [PDF.js](https://mozilla.github.io/pdf.js/) — PDF rendering & text extraction
- [JSZip](https://stuk.github.io/jszip/) — ZIP file creation
- Web Speech API — Text-to-speech

## Deployment

### GitHub Pages (Recommended)

1. Create a new GitHub repository
2. Push the `pdf-toolkit/` folder contents to it
3. Go to **Settings → Pages → Source → GitHub Actions**
4. The site will deploy automatically

### Manual

```bash
cd pdf-toolkit
npx serve .
# Open http://localhost:3000
```

## Monetization

The `pricing.html` page includes Stripe Payment Links (placeholder URLs). Replace with your actual Stripe Payment Links to start accepting payments.

## License

MIT
