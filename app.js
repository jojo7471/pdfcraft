// ===== PDFCraft — Client-side PDF Toolkit =====
const { PDFDocument } = PDFLib;

// ===== State =====
const state = {
    merge: [],
    split: null,
    splitPages: [],
    compress: null,
    compressOriginalSize: 0,
    img2pdf: [],
    pdf2img: null,
};

// ===== Utility =====
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function showOverlay() {
    document.getElementById('processing-overlay').classList.add('visible');
}

function hideOverlay() {
    document.getElementById('processing-overlay').classList.remove('visible');
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showToast(message, type = 'error') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span><button class="toast-close">×</button>`;
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// ===== Tab Navigation =====
document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tool-${tab.dataset.tool}`).classList.add('active');
    });
});

// ===== Upload Zone Helpers =====
function setupDropZone(zoneId, inputId, callback) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);

    zone.addEventListener('click', () => input.click());
    zone.querySelector('.browse-link')?.addEventListener('click', (e) => {
        e.stopPropagation();
        input.click();
    });

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        callback(e.dataTransfer.files);
    });

    input.addEventListener('change', () => {
        callback(input.files);
        input.value = '';
    });
}

// ===== File Item Builder =====
function createFileItem(file, index, onRemove) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
        <svg class="file-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="file-name">${file.name}</span>
        <span class="file-size">${formatBytes(file.size)}</span>
        <button class="file-remove" title="Remove">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    `;
    item.querySelector('.file-remove').addEventListener('click', () => onRemove(index));
    return item;
}

// ====================================================
// MERGE
// ====================================================
function renderMergeFiles() {
    const list = document.getElementById('merge-files');
    list.innerHTML = '';
    state.merge.forEach((f, i) => {
        list.appendChild(createFileItem(f, i, (idx) => {
            state.merge.splice(idx, 1);
            renderMergeFiles();
            document.getElementById('merge-btn').disabled = state.merge.length < 2;
        }));
    });
    document.getElementById('merge-btn').disabled = state.merge.length < 2;
}

setupDropZone('merge-dropzone', 'merge-input', (files) => {
    for (const file of files) {
        if (file.type === 'application/pdf') {
            state.merge.push(file);
        }
    }
    renderMergeFiles();
});

document.getElementById('merge-btn').addEventListener('click', async () => {
    if (state.merge.length < 2) return;
    showOverlay();
    try {
        const merged = await PDFDocument.create();
        for (const file of state.merge) {
            const bytes = await file.arrayBuffer();
            const pdf = await PDFDocument.load(bytes);
            const pages = await merged.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(p => merged.addPage(p));
        }
        const result = await merged.save();
        downloadBlob(new Blob([result], { type: 'application/pdf' }), 'merged.pdf');
    } catch (err) {
        showToast('Error merging PDFs: ' + err.message);
    }
    hideOverlay();
});

// ====================================================
// SPLIT
// ====================================================
function renderSplitPageThumbnails(totalPages) {
    const grid = document.getElementById('split-pages');
    grid.innerHTML = '';
    for (let i = 0; i < totalPages; i++) {
        const thumb = document.createElement('div');
        thumb.className = 'page-thumb';
        thumb.dataset.page = i + 1;
        thumb.innerHTML = `<span class="page-num">${i + 1}</span>`;
        thumb.addEventListener('click', () => {
            thumb.classList.toggle('selected');
            // Sync selected pages to the text input
            const selected = Array.from(grid.querySelectorAll('.selected')).map(t => parseInt(t.dataset.page));
            document.getElementById('split-ranges').value = selected.join(', ');
        });
        grid.appendChild(thumb);
    }
}

function setupSplitModeToggle() {
    document.querySelectorAll('input[name="split-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const isRanges = radio.value === 'ranges';
            document.getElementById('range-input-group').style.display = isRanges ? 'flex' : 'none';
        });
    });
}
setupSplitModeToggle();

function parsePageRanges(input, maxPages) {
    const ranges = input.split(',').map(s => s.trim()).filter(Boolean);
    const pages = [];
    for (const range of ranges) {
        const match = range.match(/^(\d+)(?:-(\d+))?$/);
        if (!match) continue;
        const start = parseInt(match[1]);
        const end = match[2] ? parseInt(match[2]) : start;
        for (let i = start; i <= Math.min(end, maxPages); i++) {
            if (!pages.includes(i)) pages.push(i);
        }
    }
    return pages.sort((a, b) => a - b);
}

setupDropZone('split-dropzone', 'split-input', async (files) => {
    const file = Array.from(files).find(f => f.type === 'application/pdf');
    if (!file) return;
    state.split = file;
    const bytes = await file.arrayBuffer();
    const pdf = await PDFDocument.load(bytes);
    const totalPages = pdf.getPageCount();

    const info = document.getElementById('split-file-info');
    info.className = 'file-info visible';
    info.innerHTML = `
        <svg class="file-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="file-name">${file.name}</span>
        <span class="file-meta">${totalPages} pages · ${formatBytes(file.size)}</span>
    `;

    document.getElementById('split-controls').style.display = 'block';
    renderSplitPageThumbnails(totalPages);
    state.splitPages = [];
    document.getElementById('split-btn').disabled = false;
});

document.getElementById('split-btn').addEventListener('click', async () => {
    if (!state.split) return;
    showOverlay();
    try {
        const bytes = await state.split.arrayBuffer();
        const srcPdf = await PDFDocument.load(bytes);
        const totalPages = srcPdf.getPageCount();
        const mode = document.querySelector('input[name="split-mode"]:checked').value;

        if (mode === 'individual') {
            // Download each page as a separate PDF
            for (let i = 0; i < totalPages; i++) {
                const newPdf = await PDFDocument.create();
                const [page] = await newPdf.copyPages(srcPdf, [i]);
                newPdf.addPage(page);
                const result = await newPdf.save();
                downloadBlob(new Blob([result], { type: 'application/pdf' }), `page_${i + 1}.pdf`);
                // Small delay to avoid browser blocking downloads
                await new Promise(r => setTimeout(r, 200));
            }
        } else {
            const rangesInput = document.getElementById('split-ranges').value;
            const pages = parsePageRanges(rangesInput, totalPages);
            if (pages.length === 0) {
                showToast('Please enter valid page numbers or ranges.');
                hideOverlay();
                return;
            }
            const newPdf = await PDFDocument.create();
            const copiedPages = await newPdf.copyPages(srcPdf, pages.map(p => p - 1));
            copiedPages.forEach(p => newPdf.addPage(p));
            const result = await newPdf.save();
            downloadBlob(new Blob([result], { type: 'application/pdf' }), 'split.pdf');
        }
    } catch (err) {
        showToast('Error splitting PDF: ' + err.message);
    }
    hideOverlay();
});

// ====================================================
// COMPRESS
// ====================================================
function updateCompressPreview() {
    if (!state.compress) return;
    const level = document.querySelector('input[name="compress-level"]:checked').value;
    const removeMeta = document.getElementById('compress-metadata').checked;

    let reduction = 0;
    if (level === 'low') reduction = 0.05;
    else if (level === 'medium') reduction = 0.20;
    else reduction = 0.40;

    if (removeMeta) reduction += 0.02;

    const estimated = Math.max(100, Math.floor(state.compressOriginalSize * (1 - reduction)));
    const savings = state.compressOriginalSize - estimated;

    document.getElementById('compress-original-size').textContent = formatBytes(state.compressOriginalSize);
    document.getElementById('compress-estimated-size').textContent = formatBytes(estimated);
    document.getElementById('compress-savings').textContent = `${Math.round((savings / state.compressOriginalSize) * 100)}% smaller`;
}

setupDropZone('compress-dropzone', 'compress-input', async (files) => {
    const file = Array.from(files).find(f => f.type === 'application/pdf');
    if (!file) return;
    state.compress = file;
    state.compressOriginalSize = file.size;

    const info = document.getElementById('compress-file-info');
    info.className = 'file-info visible';
    info.innerHTML = `
        <svg class="file-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="file-name">${file.name}</span>
        <span class="file-meta">${formatBytes(file.size)}</span>
    `;

    document.getElementById('compress-controls').style.display = 'block';
    updateCompressPreview();
    document.getElementById('compress-btn').disabled = false;
});

document.querySelectorAll('input[name="compress-level"], #compress-metadata').forEach(el => {
    el.addEventListener('change', updateCompressPreview);
});

document.getElementById('compress-btn').addEventListener('click', async () => {
    if (!state.compress) return;
    showOverlay();
    try {
        const bytes = await state.compress.arrayBuffer();
        const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const removeMeta = document.getElementById('compress-metadata').checked;

        if (removeMeta) {
            pdf.setTitle(undefined);
            pdf.setAuthor(undefined);
            pdf.setSubject(undefined);
            pdf.setCreator(undefined);
            pdf.setProducer(undefined);
            pdf.setKeywords(undefined);
        }

        const level = document.querySelector('input[name="compress-level"]:checked').value;
        const saveOptions = {};

        if (level === 'low') {
            // Minimal changes - just re-save with metadata removal
            saveOptions.useObjectStreams = false;
        } else if (level === 'medium') {
            saveOptions.useObjectStreams = true;
        } else {
            // High compression - use object streams and don't add display info
            saveOptions.useObjectStreams = true;
            saveOptions.addDefaultPage = false;
        }

        const result = await pdf.save(saveOptions);
        downloadBlob(new Blob([result], { type: 'application/pdf' }), 'compressed.pdf');
    } catch (err) {
        showToast('Error compressing PDF: ' + err.message);
    }
    hideOverlay();
});

// ====================================================
// CONVERT
// ====================================================

// Convert mode toggle
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.convert-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`convert-${btn.dataset.mode}`).classList.add('active');
    });
});

// ---- Images to PDF ----
function renderImg2pdfFiles() {
    const list = document.getElementById('img2pdf-files');
    list.innerHTML = '';
    state.img2pdf.forEach((f, i) => {
        const item = createFileItem(f, i, (idx) => {
            state.img2pdf.splice(idx, 1);
            renderImg2pdfFiles();
            document.getElementById('img2pdf-btn').disabled = state.img2pdf.length === 0;
        });
        list.appendChild(item);
    });
    document.getElementById('img2pdf-btn').disabled = state.img2pdf.length === 0;
}

setupDropZone('img2pdf-dropzone', 'img2pdf-input', (files) => {
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
    for (const file of files) {
        if (imageTypes.includes(file.type)) {
            state.img2pdf.push(file);
        }
    }
    renderImg2pdfFiles();
});

document.getElementById('img2pdf-btn').addEventListener('click', async () => {
    if (state.img2pdf.length === 0) return;
    showOverlay();
    try {
        const pdf = await PDFDocument.create();
        for (const file of state.img2pdf) {
            const bytes = await file.arrayBuffer();
            let image;
            if (file.type === 'image/png') {
                image = await pdf.embedPng(bytes);
            } else {
                // For JPEG and others, try as JPEG
                try {
                    image = await pdf.embedJpg(bytes);
                } catch {
                    // If not JPEG, try converting via canvas
                    image = await embedImageViaCanvas(pdf, bytes, file.type);
                }
            }
            const page = pdf.addPage([image.width, image.height]);
            page.drawImage(image, {
                x: 0,
                y: 0,
                width: image.width,
                height: image.height,
            });
        }
        const result = await pdf.save();
        downloadBlob(new Blob([result], { type: 'application/pdf' }), 'images.pdf');
    } catch (err) {
        showToast('Error creating PDF: ' + err.message);
    }
    hideOverlay();
});

async function embedImageViaCanvas(pdfDoc, bytes, mimeType) {
    return new Promise((resolve, reject) => {
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(async (jpegBlob) => {
                try {
                    const jpegBytes = await jpegBlob.arrayBuffer();
                    const image = await pdfDoc.embedJpg(jpegBytes);
                    URL.revokeObjectURL(url);
                    resolve(image);
                } catch (e) {
                    reject(e);
                }
            }, 'image/jpeg', 0.92);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };
        img.src = url;
    });
}

// ---- PDF to Images (via PDF.js) ----
function renderPdf2imgThumbnails(totalPages) {
    const grid = document.getElementById('pdf2img-pages');
    grid.innerHTML = '';
    for (let i = 0; i < totalPages; i++) {
        const thumb = document.createElement('div');
        thumb.className = 'page-thumb selected';
        thumb.dataset.page = i + 1;
        thumb.innerHTML = `<span class="page-num">${i + 1}</span>`;
        thumb.addEventListener('click', () => {
            thumb.classList.toggle('selected');
        });
        grid.appendChild(thumb);
    }
}

document.getElementById('pdf2img-select-all').addEventListener('click', () => {
    document.querySelectorAll('#pdf2img-pages .page-thumb').forEach(t => t.classList.add('selected'));
});

document.getElementById('pdf2img-deselect-all').addEventListener('click', () => {
    document.querySelectorAll('#pdf2img-pages .page-thumb').forEach(t => t.classList.remove('selected'));
});

setupDropZone('pdf2img-dropzone', 'pdf2img-input', async (files) => {
    const file = Array.from(files).find(f => f.type === 'application/pdf');
    if (!file) return;
    state.pdf2img = file;

    const info = document.getElementById('pdf2img-file-info');
    const bytes = await file.arrayBuffer();
    // Use pdf-lib for page count
    const pdf = await PDFDocument.load(bytes);
    const totalPages = pdf.getPageCount();

    info.className = 'file-info visible';
    info.innerHTML = `
        <svg class="file-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="file-name">${file.name}</span>
        <span class="file-meta">${totalPages} pages · ${formatBytes(file.size)}</span>
    `;

    document.getElementById('pdf2img-controls').style.display = 'flex';
    document.getElementById('pdf2img-controls').style.flexDirection = 'column';
    document.getElementById('pdf2img-controls').style.gap = '20px';
    renderPdf2imgThumbnails(totalPages);
    document.getElementById('pdf2img-btn').disabled = false;
});

document.getElementById('pdf2img-btn').addEventListener('click', async () => {
    if (!state.pdf2img) return;
    showOverlay();
    try {
        const bytes = await state.pdf2img.arrayBuffer();
        const format = document.querySelector('input[name="img-format"]:checked').value;
        const scale = parseFloat(document.querySelector('input[name="img-scale"]:checked').value);
        const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
        const quality = format === 'jpeg' ? 0.92 : undefined;

        // Get selected pages
        const selectedThumbs = document.querySelectorAll('#pdf2img-pages .page-thumb.selected');
        const selectedPages = Array.from(selectedThumbs).map(t => parseInt(t.dataset.page));

        if (selectedPages.length === 0) {
            showToast('Please select at least one page to extract.');
            hideOverlay();
            return;
        }

        // Load PDF with pdf.js for rendering
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
        const pdf = await loadingTask.promise;

        const useZip = document.getElementById('pdf2img-zip').checked && selectedPages.length > 1;
        const ext = format === 'png' ? 'png' : 'jpg';
        const zip = useZip ? new JSZip() : null;

        // Show progress bar
        const progressEl = document.getElementById('pdf2img-progress');
        const progressFill = document.getElementById('pdf2img-progress-fill');
        const progressText = document.getElementById('pdf2img-progress-text');
        if (selectedPages.length > 1) {
            progressEl.style.display = 'flex';
            progressFill.style.width = '0%';
        }

        // Render each selected page
        for (let idx = 0; idx < selectedPages.length; idx++) {
            const pageNum = selectedPages[idx];

            // Update progress
            if (selectedPages.length > 1) {
                progressText.textContent = `Rendering page ${idx + 1} of ${selectedPages.length}...`;
                progressFill.style.width = `${((idx) / selectedPages.length) * 100}%`;
            }

            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;

            if (useZip) {
                const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, quality));
                zip.file(`page_${pageNum}.${ext}`, blob);
            } else {
                const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, quality));
                downloadBlob(blob, `page_${pageNum}.${ext}`);
                if (selectedPages.length > 1) {
                    await new Promise(r => setTimeout(r, 200));
                }
            }
        }

        // Final progress update
        if (selectedPages.length > 1) {
            progressFill.style.width = '100%';
            progressText.textContent = 'Done!';
        }

        if (useZip) {
            progressText.textContent = 'Packaging ZIP...';
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            downloadBlob(zipBlob, `pages_${selectedPages[0]}-${selectedPages[selectedPages.length - 1]}.zip`);
        }

        // Hide progress after a moment
        setTimeout(() => { progressEl.style.display = 'none'; }, 1500);

        showToast(`Extracted ${selectedPages.length} page(s) as ${format.toUpperCase()}${useZip ? ' (ZIP)' : ''}`, 'success');
    } catch (err) {
        document.getElementById('pdf2img-progress').style.display = 'none';
        showToast('Error extracting images: ' + err.message);
    }
    hideOverlay();
});

// ====================================================
// READ ALOUD (TTS)
// ====================================================
let ttsUtterance = null;
let ttsSpeaking = false;
let ttsPaused = false;
let ttsText = '';
let ttsChunks = [];
let ttsChunkIndex = 0;
let ttsStopped = false;
let ttsFileName = '';
const CHUNK_SIZE = 4000;

function populateVoices() {
    const voiceSelect = document.getElementById('tts-voice');
    const voices = speechSynthesis.getVoices();
    voiceSelect.innerHTML = '';
    if (voices.length === 0) return;
    // Prioritize English voices
    const sorted = [...voices].sort((a, b) => {
        const aEn = a.lang.startsWith('en') ? 0 : 1;
        const bEn = b.lang.startsWith('en') ? 0 : 1;
        return aEn - bEn || a.name.localeCompare(b.name);
    });
    sorted.forEach((voice) => {
        const opt = document.createElement('option');
        opt.value = voices.indexOf(voice);
        opt.textContent = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(opt);
    });
}

// Load voices (they may not be available immediately)
speechSynthesis.onvoiceschanged = populateVoices;
populateVoices();

// Chrome bug workaround: keep speechSynthesis alive
// But don't interfere if the user has paused playback or we're recording
setInterval(() => {
    if (speechSynthesis.speaking && !ttsPaused && !isRecording) {
        speechSynthesis.pause();
        speechSynthesis.resume();
    }
}, 14000);

// Rate / Pitch live update
document.getElementById('tts-rate').addEventListener('input', (e) => {
    document.getElementById('tts-rate-value').textContent = parseFloat(e.target.value).toFixed(1) + 'x';
    if (ttsUtterance) ttsUtterance.rate = parseFloat(e.target.value);
});

document.getElementById('tts-pitch').addEventListener('input', (e) => {
    document.getElementById('tts-pitch-value').textContent = parseFloat(e.target.value).toFixed(1);
    if (ttsUtterance) ttsUtterance.pitch = parseFloat(e.target.value);
});

setupDropZone('read-dropzone', 'read-input', async (files) => {
    const file = Array.from(files).find(f => f.type === 'application/pdf');
    if (!file) return;

    // Stop any ongoing speech
    speechSynthesis.cancel();
    ttsSpeaking = false;
    ttsPaused = false;
    ttsFileName = file.name;
    updatePlaybackUI();

    const info = document.getElementById('read-file-info');
    info.className = 'file-info visible';
    info.innerHTML = `
        <svg class="file-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="file-name">${file.name}</span>
        <span class="file-meta">${formatBytes(file.size)}</span>
    `;

    showOverlay();
    try {
        const bytes = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
        const pdf = await loadingTask.promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += (i > 1 ? '\n\n' : '') + `[Page ${i}]\n${pageText}`;
        }

        ttsText = fullText.trim();
        const display = document.getElementById('tts-text-display');
        display.innerHTML = ttsText
            ? `<pre style="margin:0;white-space:pre-wrap;font-family:inherit;">${escapeHtml(ttsText)}</pre>`
            : '<p class="text-placeholder">No text found in this PDF. It may be a scanned/image-based document.</p>';

        document.getElementById('tts-controls').style.display = 'flex';
        document.getElementById('tts-download-bar').style.display = 'flex';
        document.getElementById('tts-play').disabled = !ttsText;
        document.getElementById('tts-pause').disabled = true;
        document.getElementById('tts-stop').disabled = true;
        document.getElementById('tts-download').disabled = !ttsText;
        document.getElementById('tts-progress-text').textContent = ttsText ? 'Ready to play' : 'No text found';
    } catch (err) {
        showToast('Error extracting text: ' + err.message);
    }
    hideOverlay();
});

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function chunkText(text, maxLen) {
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }
        // Try to break at sentence boundaries
        let breakAt = -1;
        const patterns = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
        for (const pat of patterns) {
            const idx = remaining.lastIndexOf(pat, maxLen);
            if (idx > breakAt && idx > maxLen * 0.3) breakAt = idx + pat.length;
        }
        if (breakAt < 0) breakAt = remaining.lastIndexOf(' ', maxLen);
        if (breakAt < 0 || breakAt < maxLen * 0.3) breakAt = maxLen;
        chunks.push(remaining.substring(0, breakAt).trim());
        remaining = remaining.substring(breakAt).trimStart();
    }
    return chunks;
}

// Check for file:// protocol
if (window.location.protocol === 'file:') {
    console.warn('TTS may not work on file:// protocol. Use a local server (e.g., python -m http.server) for full functionality.');
}

function updatePlaybackUI() {
    const playBtn = document.getElementById('tts-play');
    const pauseBtn = document.getElementById('tts-pause');
    const stopBtn = document.getElementById('tts-stop');
    if (ttsSpeaking || ttsPaused) {
        playBtn.classList.add('playing');
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        // Update pause button icon to show play/pause state
        if (ttsPaused) {
            pauseBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        } else {
            pauseBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        }
    } else {
        playBtn.classList.remove('playing');
        pauseBtn.disabled = !ttsText;
        stopBtn.disabled = true;
        // Reset pause button icon
        pauseBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    }
}

// Play / Resume
document.getElementById('tts-play').addEventListener('click', () => {
    if (!ttsText) return;

    // Check SpeechSynthesis support
    if (!window.speechSynthesis) {
        showToast('Text-to-speech is not supported in this browser. Try Chrome or Edge.');
        return;
    }

    // Block TTS on file:// protocol
    if (window.location.protocol === 'file:') {
        showToast('TTS requires HTTP. Run: npx serve pdf-toolkit', 'error');
        return;
    }

    // Resume if paused — we track pause ourselves because Chrome's
    // speechSynthesis.pause() is unreliable.
    if (ttsPaused) {
        ttsPaused = false;
        ttsStopped = false;
        // Resume from the chunk we were on (delay needed after cancel)
        setTimeout(() => speakChunk(), 150);
        return;
    }

    // Stop any current speech before starting fresh
    if (speechSynthesis.speaking || speechSynthesis.paused) {
        ttsStopped = true;
        speechSynthesis.cancel();
    }

    // Chunk the text to avoid Chrome's ~15k char limit
    ttsChunks = chunkText(ttsText, CHUNK_SIZE);
    ttsChunkIndex = 0;
    ttsStopped = false;
    ttsPaused = false;

    // Chrome bug workaround: delay speak() after cancel()
    setTimeout(speakChunk, 150);
});

function speakChunk() {
    if (ttsStopped || ttsPaused) return;

    if (ttsChunkIndex >= ttsChunks.length) {
        ttsSpeaking = false;
        ttsPaused = false;
        updatePlaybackUI();
        document.getElementById('tts-progress-fill').style.width = '100%';
        document.getElementById('tts-progress-text').textContent = 'Finished';
        return;
    }

    const chunk = ttsChunks[ttsChunkIndex];
    ttsUtterance = new SpeechSynthesisUtterance(chunk);
    const voices = speechSynthesis.getVoices();
    const voiceIdx = parseInt(document.getElementById('tts-voice').value);
    if (voices[voiceIdx]) ttsUtterance.voice = voices[voiceIdx];
    ttsUtterance.rate = parseFloat(document.getElementById('tts-rate').value);
    ttsUtterance.pitch = parseFloat(document.getElementById('tts-pitch').value);

    ttsUtterance.onstart = () => {
        ttsSpeaking = true;
        ttsPaused = false;
        updatePlaybackUI();
    };
    ttsUtterance.onend = () => {
        // If we cancelled due to pause, don't advance — the pause handler
        // already saved ttsChunkIndex.
        if (ttsPaused) return;
        if (ttsStopped) return;
        ttsChunkIndex++;
        // Update progress on chunk completion
        const pct = Math.min(99, Math.round((ttsChunkIndex / ttsChunks.length) * 100));
        document.getElementById('tts-progress-fill').style.width = pct + '%';
        document.getElementById('tts-progress-text').textContent = `${pct}%`;
        speakChunk();
    };
    ttsUtterance.onerror = (e) => {
        // 'canceled' is expected when we cancel() for pause or stop
        if (e.error === 'canceled') return;
        console.error('TTS error:', e.error);
        ttsSpeaking = false;
        ttsPaused = false;
        updatePlaybackUI();
        showToast('TTS error: ' + e.error);
    };
    ttsUtterance.onboundary = () => {
        const pct = Math.min(99, Math.round(((ttsChunkIndex + 0.5) / ttsChunks.length) * 100));
        document.getElementById('tts-progress-fill').style.width = pct + '%';
        document.getElementById('tts-progress-text').textContent = `${pct}%`;
    };

    const totalChunks = ttsChunks.length;
    document.getElementById('tts-progress-text').textContent = totalChunks > 1
        ? `Speaking chunk ${ttsChunkIndex + 1} of ${totalChunks}...`
        : 'Speaking...';

    speechSynthesis.speak(ttsUtterance);
}

// Pause — Chrome's speechSynthesis.pause() is unreliable, so we
// cancel the current utterance and remember which chunk we were on,
// then resume from there when Play is pressed again.
document.getElementById('tts-pause').addEventListener('click', () => {
    if (ttsPaused) {
        // Already paused — treat as resume
        ttsPaused = false;
        ttsStopped = false;
        // Delay needed after cancel for Chrome
        setTimeout(() => speakChunk(), 150);
        return;
    }
    if (speechSynthesis.speaking) {
        ttsPaused = true;
        ttsSpeaking = false;
        // Cancel the current speech; onend will see ttsPaused and skip advancing
        speechSynthesis.cancel();
        updatePlaybackUI();
        document.getElementById('tts-progress-text').textContent = 'Paused';
    }
});

// Stop
document.getElementById('tts-stop').addEventListener('click', () => {
    ttsStopped = true;
    ttsPaused = false;
    ttsChunkIndex = 0;
    speechSynthesis.cancel();
    ttsSpeaking = false;
    updatePlaybackUI();
    document.getElementById('tts-progress-fill').style.width = '0%';
    document.getElementById('tts-progress-text').textContent = 'Ready';
});

// ====================================================
// DOWNLOAD AS AUDIO (PDF → Audio file via TTS recording)
// ====================================================
let isRecording = false;

document.getElementById('tts-download').addEventListener('click', downloadAsAudio);

async function downloadAsAudio() {
    if (!ttsText || isRecording) return;

    // Check support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        showToast('Audio recording is not supported in this browser. Try Chrome or Edge.');
        return;
    }

    // Stop any current speech
    if (speechSynthesis.speaking || speechSynthesis.paused) {
        ttsStopped = true;
        ttsPaused = false;
        speechSynthesis.cancel();
        await new Promise(r => setTimeout(r, 200));
    }

    try {
        showToast('Select this tab in the popup and check "Share tab audio", then click Share.', 'info');
        await new Promise(r => setTimeout(r, 800));

        // Request tab audio capture
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: 'browser' },
            audio: { suppressLocalAudioPlayback: false },
            preferCurrentTab: true,
        });

        // Stop video track immediately (we only need audio)
        stream.getVideoTracks().forEach(t => t.stop());

        // Check for audio track
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            stream.getTracks().forEach(t => t.stop());
            showToast('No audio track. Please check "Share tab audio" when sharing.');
            return;
        }

        // Create MediaRecorder
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        const audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());

            if (audioChunks.length === 0) {
                showToast('No audio was recorded.');
                isRecording = false;
                updateDownloadUI();
                return;
            }

            const blob = new Blob(audioChunks, { type: mimeType });
            const baseName = ttsFileName ? ttsFileName.replace(/\.pdf$/i, '') : 'pdfcraft-audio';
            downloadBlob(blob, baseName + '.webm');
            showToast(`Audio file downloaded! (${formatBytes(blob.size)})`, 'success');

            isRecording = false;
            updateDownloadUI();
        };

        mediaRecorder.onerror = (e) => {
            console.error('MediaRecorder error:', e.error);
            stream.getTracks().forEach(t => t.stop());
            isRecording = false;
            updateDownloadUI();
            showToast('Recording error: ' + e.error);
        };

        // Start recording
        mediaRecorder.start(100);
        isRecording = true;
        updateDownloadUI();

        // Speak all chunks and wait for completion
        await speakAllChunksForRecording();

        // Small delay to capture trailing audio
        await new Promise(r => setTimeout(r, 500));

        // Stop recording
        if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }

    } catch (err) {
        isRecording = false;
        updateDownloadUI();

        if (err.name === 'NotAllowedError') {
            showToast('Audio sharing was denied. Please allow tab audio sharing to record.');
        } else if (err.name === 'NotSupportedError') {
            showToast('Audio recording is not supported in this browser.');
        } else {
            showToast('Error: ' + err.message);
        }
    }
}

// Speak all TTS chunks sequentially, returning a Promise that resolves when done
function speakAllChunksForRecording() {
    return new Promise((resolve) => {
        const chunks = chunkText(ttsText, CHUNK_SIZE);
        let idx = 0;

        function speakNext() {
            if (!isRecording || idx >= chunks.length) {
                ttsSpeaking = false;
                updateDownloadUI();
                document.getElementById('tts-progress-fill').style.width = '100%';
                document.getElementById('tts-progress-text').textContent = 'Recording complete!';
                resolve();
                return;
            }

            const chunk = chunks[idx];
            const utt = new SpeechSynthesisUtterance(chunk);
            const voices = speechSynthesis.getVoices();
            const voiceIdx = parseInt(document.getElementById('tts-voice').value);
            if (voices[voiceIdx]) utt.voice = voices[voiceIdx];
            utt.rate = parseFloat(document.getElementById('tts-rate').value);
            utt.pitch = parseFloat(document.getElementById('tts-pitch').value);

            utt.onstart = () => {
                ttsSpeaking = true;
                updateDownloadUI();
            };

            utt.onend = () => {
                idx++;
                const pct = Math.min(99, Math.round((idx / chunks.length) * 100));
                document.getElementById('tts-progress-fill').style.width = pct + '%';
                const totalChunks = chunks.length;
                document.getElementById('tts-progress-text').textContent = totalChunks > 1
                    ? `Recording ${idx} of ${totalChunks}...`
                    : 'Recording...';
                speakNext();
            };

            utt.onerror = (e) => {
                if (e.error === 'canceled') { resolve(); return; }
                console.error('TTS recording error:', e.error);
                // On unexpected error, still resolve so MediaRecorder can stop cleanly
                idx = chunks.length; // stop further chunks
                resolve();
            };

            const totalChunks = chunks.length;
            document.getElementById('tts-progress-text').textContent = totalChunks > 1
                ? `Recording 1 of ${totalChunks}...`
                : 'Recording...';

            speechSynthesis.speak(utt);
        }

        speakNext();
    });
}

function updateDownloadUI() {
    const downloadBtn = document.getElementById('tts-download');
    const downloadBar = document.getElementById('tts-download-bar');

    if (isRecording) {
        downloadBtn.disabled = true;
        downloadBtn.classList.add('recording');
        downloadBtn.querySelector('span').textContent = 'Recording...';
        // Disable playback controls during recording
        document.getElementById('tts-play').disabled = true;
        document.getElementById('tts-pause').disabled = true;
        document.getElementById('tts-stop').disabled = true;
    } else {
        downloadBtn.disabled = !ttsText;
        downloadBtn.classList.remove('recording');
        downloadBtn.querySelector('span').textContent = 'Download as Audio';
        // Re-enable playback controls
        updatePlaybackUI();
    }
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    renderMergeFiles();
});
