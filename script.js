document.addEventListener('DOMContentLoaded', async () => {
    // 저장된 분할 비율 가져오기 (없으면 기본값 [50, 50])
    const savedSizes = localStorage.getItem('split-sizes');
    const initialSizes = savedSizes ? JSON.parse(savedSizes) : [50, 50];

    // Split.js 초기화
    Split(['#editor-pane', '#diagram-pane'], {
        sizes: initialSizes,
        minSize: 200,
        gutterSize: 10,
        cursor: 'col-resize',
        onDragEnd: (sizes) => {
            // 드래그가 끝날 때마다 비율 저장
            localStorage.setItem('split-sizes', JSON.stringify(sizes));
            // 패널 크기가 변경되면 panZoom도 리사이즈 필요
            if (panZoomInstance) {
                panZoomInstance.resize();
                panZoomInstance.fit();
                panZoomInstance.center();
            }
        }
    });

    mermaid.initialize({ startOnLoad: false });

    const copyUrlBtn = document.getElementById('copy-url-btn');
    const saveTxtBtn = document.getElementById('save-txt-btn');
    const loadTxtBtn = document.getElementById('load-txt-btn');
    const loadTxtInput = document.getElementById('load-txt-input');
    const downloadPngBtn = document.getElementById('download-png-btn');
    const downloadJpgBtn = document.getElementById('download-jpg-btn');
    const mermaidInput = document.getElementById('mermaid-input');
    const lineNumbers = document.getElementById('line-numbers');
    const mermaidDiagram = document.getElementById('mermaid-diagram');
    const toast = document.getElementById('toast-notification');
    let panZoomInstance = null;

    // 라인 넘버 업데이트 함수
    const updateLineNumbers = () => {
        const numberOfLines = mermaidInput.value.split('\n').length;
        lineNumbers.innerHTML = Array(numberOfLines).fill(0).map((_, i) => i + 1).join('<br>');
    };

    // 스크롤 동기화
    mermaidInput.addEventListener('scroll', () => {
        lineNumbers.scrollTop = mermaidInput.scrollTop;
    });

    // 입력 시 라인 넘버 업데이트
    mermaidInput.addEventListener('input', updateLineNumbers);

    // 디바운스 함수: 지정된 시간 동안 추가 호출이 없으면 함수를 실행합니다.
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    };

    const showToast = (message) => {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    };

    const renderDiagram = async () => {
        try {
            mermaidDiagram.innerHTML = ''; // 기존 다이어그램 초기화
            const mermaidCode = mermaidInput.value;
            const { svg } = await mermaid.render('graphDiv', mermaidCode);
            mermaidDiagram.innerHTML = svg;

            // SVG Pan Zoom 초기화
            const svgElement = mermaidDiagram.querySelector('svg');
            if (svgElement) {
                // 기존 인스턴스가 있다면 제거 (메모리 누수 방지)
                if (panZoomInstance) {
                    try { panZoomInstance.destroy(); } catch(e) {}
                }

                // Mermaid SVG 스타일 조정 (PanZoom과 충돌 방지)
                // Mermaid가 설정한 max-width를 제거하고 100%로 설정하여 컨테이너를 채우게 함
                svgElement.style.maxWidth = 'none';
                svgElement.style.height = '100%';
                svgElement.style.width = '100%';

                panZoomInstance = svgPanZoom(svgElement, {
                    zoomEnabled: true,
                    controlIconsEnabled: true,
                    fit: true,
                    center: true,
                    minZoom: 0.5,
                    maxZoom: 10
                });
            }
        } catch (e) {
            console.error(e);
            mermaidDiagram.innerHTML = '';
            
            const errorDiv = document.createElement('div');
            errorDiv.style.color = '#721c24';
            errorDiv.style.backgroundColor = '#f8d7da';
            errorDiv.style.border = '1px solid #f5c6cb';
            errorDiv.style.padding = '15px';
            errorDiv.style.borderRadius = '4px';
            errorDiv.style.textAlign = 'left';
            errorDiv.style.overflow = 'auto';

            const title = document.createElement('div');
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '10px';
            title.textContent = 'Diagram Syntax Error:';
            errorDiv.appendChild(title);

            const pre = document.createElement('pre');
            pre.style.margin = '0';
            pre.style.whiteSpace = 'pre-wrap';
            pre.style.fontFamily = 'monospace';
            pre.style.fontSize = '14px';
            pre.textContent = e.message || String(e);
            errorDiv.appendChild(pre);

            mermaidDiagram.appendChild(errorDiv);
        }
    };

    const setMermaidCodeFromUrl = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code) {
            try {
                // Base64 디코딩 후 URI 디코딩
                const decodedCode = decodeURIComponent(atob(code));
                mermaidInput.value = decodedCode;
                return true;
            } catch (e) {
                console.error('URL 파라미터 디코딩 오류:', e);
                showToast('Failed to load code from URL.');
            }
        }
        return false;
    };

    copyUrlBtn.addEventListener('click', () => {
        const mermaidCode = mermaidInput.value;
        // URI 인코딩 후 Base64 인코딩
        const encodedCode = btoa(encodeURIComponent(mermaidCode));
        const url = `${window.location.origin}${window.location.pathname}?code=${encodedCode}`;
        
        navigator.clipboard.writeText(url).then(() => {
            showToast('Share URL copied to clipboard!');
        }, (err) => {
            console.error('클립보드 복사 실패:', err);
            showToast('Failed to copy URL.');
        });
    });

    // 텍스트 파일 저장
    saveTxtBtn.addEventListener('click', async () => {
        const text = mermaidInput.value;
        
        // File System Access API 지원 여부 확인
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'mermaid-diagram.txt',
                    types: [{
                        description: 'Text Files',
                        accept: { 'text/plain': ['.txt', '.mmd'] },
                    }],
                });
                
                const writable = await handle.createWritable();
                await writable.write(text);
                await writable.close();
                showToast('File saved successfully!');
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('File save error:', err);
                    showToast('Failed to save file.');
                }
            }
        } else {
            // Fallback: 기존 다운로드 방식
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'mermaid-diagram.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });

    // 텍스트 파일 불러오기 버튼 클릭
    loadTxtBtn.addEventListener('click', () => {
        loadTxtInput.click();
    });

    // 파일 선택 시 처리
    loadTxtInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            mermaidInput.value = content;
            
            // 라인 넘버 업데이트 및 렌더링
            updateLineNumbers();
            renderDiagram();
            
            // 자동 저장 업데이트
            const data = {
                code: content,
                timestamp: Date.now()
            };
            localStorage.setItem('mermaid-code', JSON.stringify(data));
            
            showToast('File loaded successfully!');
        };
        reader.onerror = () => {
            showToast('Failed to read file.');
        };
        reader.readAsText(file);
        
        // 같은 파일을 다시 선택할 수 있도록 초기화
        loadTxtInput.value = '';
    });

    const downloadDiagram = (format) => {
        const svgElement = mermaidDiagram.querySelector('svg');
        if (!svgElement) {
            showToast('No diagram to download.');
            return;
        }

        // 1. 크기 및 위치 계산 (원본 DOM에서 수행)
        let width, height, x, y;
        const originalViewport = svgElement.querySelector('.svg-pan-zoom_viewport');
        
        if (originalViewport) {
            // svg-pan-zoom이 적용된 경우, 내부 뷰포트의 BBox를 사용
            const bbox = originalViewport.getBBox();
            width = bbox.width;
            height = bbox.height;
            x = bbox.x;
            y = bbox.y;
        } else {
            // svg-pan-zoom이 적용되지 않은 경우
            if (svgElement.viewBox && svgElement.viewBox.baseVal && svgElement.viewBox.baseVal.width > 0) {
                width = svgElement.viewBox.baseVal.width;
                height = svgElement.viewBox.baseVal.height;
                x = svgElement.viewBox.baseVal.x;
                y = svgElement.viewBox.baseVal.y;
            } else {
                const bbox = svgElement.getBBox();
                width = bbox.width;
                height = bbox.height;
                x = bbox.x;
                y = bbox.y;
            }
        }

        // 2. SVG 복제
        const clonedSvg = svgElement.cloneNode(true);

        // 3. svg-pan-zoom 변형 제거
        const clonedViewport = clonedSvg.querySelector('.svg-pan-zoom_viewport');
        if (clonedViewport) {
            clonedViewport.removeAttribute('transform');
            clonedViewport.removeAttribute('style');
        }

        // 4. 루트 SVG 속성 재설정
        clonedSvg.style.width = '';
        clonedSvg.style.height = '';
        clonedSvg.style.maxWidth = '';
        
        clonedSvg.setAttribute('width', width);
        clonedSvg.setAttribute('height', height);
        clonedSvg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);

        const svgXML = new XMLSerializer().serializeToString(clonedSvg);
        const svgBlob = new Blob([svgXML], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const padding = 20;

            canvas.width = width + padding * 2;
            canvas.height = height + padding * 2;

            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // 이미지를 원본 크기로 그림
            ctx.drawImage(img, padding, padding, width, height);

            const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
            const dataUrl = canvas.toDataURL(mimeType);

            const link = document.createElement('a');
            link.download = `diagram.${format}`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);
        };
        img.onerror = (e) => {
            console.error('이미지 로드 오류:', e);
            showToast('Error converting image.');
            URL.revokeObjectURL(url);
        };
        img.src = url;
    };

    downloadPngBtn.addEventListener('click', () => downloadDiagram('png'));
    downloadJpgBtn.addEventListener('click', () => downloadDiagram('jpg'));

    // 300ms 디바운스가 적용된 렌더링 함수
    const debouncedRender = debounce(renderDiagram, 300);

    // 텍스트 입력 시 자동 저장 및 디바운스된 렌더링 함수 호출
    mermaidInput.addEventListener('input', () => {
        const data = {
            code: mermaidInput.value,
            timestamp: Date.now()
        };
        localStorage.setItem('mermaid-code', JSON.stringify(data));
        debouncedRender();
    });

    // URL 파라미터 처리 및 초기 렌더링
    const loadedFromUrl = setMermaidCodeFromUrl();
    
    if (!loadedFromUrl) {
        const savedData = localStorage.getItem('mermaid-code');
        if (savedData) {
            try {
                const parsedData = JSON.parse(savedData);
                const oneHour = 60 * 60 * 1000; // 1시간 (밀리초)

                if (parsedData && parsedData.timestamp && parsedData.code) {
                    if (Date.now() - parsedData.timestamp < oneHour) {
                        mermaidInput.value = parsedData.code;
                    } else {
                        console.log('Auto-saved code expired.');
                        localStorage.removeItem('mermaid-code');
                    }
                }
            } catch (e) {
                // 이전 형식(일반 텍스트)이거나 유효하지 않은 JSON인 경우 무시
                console.log('Invalid or legacy auto-save data found.');
            }
        }
    }

    updateLineNumbers(); // 초기 라인 넘버 설정
    await renderDiagram();
});



