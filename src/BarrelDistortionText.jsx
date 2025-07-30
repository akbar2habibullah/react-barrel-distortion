import React, { useState, useEffect, useRef } from 'react';
import './BarrelDistortionText.css';

// --- Shaders and Helper Functions (vsSource, compileShader, etc. are unchanged) ---
const vsSource = `
    attribute vec2 aPosition;
    attribute vec2 aTexCoord;
    varying vec2 vTexCoord;
    void main() {
        gl_Position = vec4(aPosition, 0.0, 1.0);
        vTexCoord = aTexCoord;
    }
`;

// --- CHANGE: Updated Fragment Shader with Blur Logic ---
const fsSource = `
    precision mediump float;
    uniform sampler2D uSampler;
    uniform float uDistortion;
    uniform float uZoom;
    uniform float uTime;
    uniform float uNoiseAmount;
    uniform float uScanlineIntensity;
    uniform float uScanlineFrequency;
    uniform float uBlurAmount; // New uniform for blur

    varying vec2 vTexCoord;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }
    
    void main() {
        // --- 1. Barrel Distortion ---
        vec2 center = vec2(0.5, 0.5);
        vec2 coord = (vTexCoord - center) * uZoom;
        float dist = length(coord);
        float factor = 1.0 + uDistortion * dist * dist;
        vec2 distortedCoord = coord * factor;
        distortedCoord = distortedCoord / uZoom + center;
        
        // --- 2. Sample the texture (with optional blur) ---
        vec4 color;

        if (uBlurAmount > 0.0) {
            // Simple 9-tap box blur
            vec4 sum = vec4(0.0);
            // The size of one pixel on our 512x512 texture
            vec2 texelSize = vec2(1.0 / 512.0, 1.0 / 512.0); 
            float blurStep = uBlurAmount * texelSize.x;

            // Sample in a 3x3 grid
            for (int x = -1; x <= 1; x++) {
                for (int y = -1; y <= 1; y++) {
                    sum += texture2D(uSampler, distortedCoord + vec2(x, y) * blurStep);
                }
            }
            color = sum / 9.0; // Average the samples
        } else {
            // No blur, just sample once
            color = texture2D(uSampler, distortedCoord);
        }

        // --- 3. Apply CRT Effects ---
        if (distortedCoord.x < 0.0 || distortedCoord.x > 1.0 || distortedCoord.y < 0.0 || distortedCoord.y > 1.0) {
           // Let the background color from gl.clearColor show through
        } else {
            float scanline = sin(distortedCoord.y * uScanlineFrequency) * uScanlineIntensity;
            color.rgb -= scanline;
            float noise = (random(vTexCoord + uTime) - 0.5) * uNoiseAmount;
            color.rgb += noise;
        }
        
        gl_FragColor = color;
    }
`;

const compileShader = (gl, source, type) => { const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { console.error('Shader compile error:', gl.getShaderInfoLog(shader)); gl.deleteShader(shader); return null; } return shader; };
const hexToRgb = (hex) => { let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return result ? { r: parseInt(result[1], 16) / 255, g: parseInt(result[2], 16) / 255, b: parseInt(result[3], 16) / 255 } : null; };
const wrapText = (context, text, maxWidth) => { const words = text.split(' '); const lines = []; let currentLine = words[0] || ''; for (let i = 1; i < words.length; i++) { const word = words[i]; const width = context.measureText(currentLine + " " + word).width; if (width < maxWidth) { currentLine += " " + word; } else { lines.push(currentLine); currentLine = word; } } lines.push(currentLine); return lines; };


// --- The React Component ---
const BarrelDistortionText = () => {
    // State for all controls
    const [distortion, setDistortion] = useState(2);
    const [zoom, setZoom] = useState(1.5);
    const [fontSize, setFontSize] = useState(80);
    const [lineSpacing, setLineSpacing] = useState(1.2);
    const [fontColor, setFontColor] = useState('#FFFFFF');
    const [bgColor, setBgColor] = useState('#000000');
    const [noise, setNoise] = useState(0.05);
    const [scanlineIntensity, setScanlineIntensity] = useState(0.15);
    const [text, setText] = useState("BUT AT\nLEAST\nYOU'LL");
    const [transparencyMode, setTransparencyMode] = useState('normal');
    const [blurAmount, setBlurAmount] = useState(0.5);

    // Refs
    const canvasRef = useRef(null);
    const textCanvasRef = useRef(null);
    const glRef = useRef(null);
    const programInfoRef = useRef(null);
    const buffersRef = useRef(null);
    const textureRef = useRef(null);
    const animationFrameIdRef = useRef(null);
    const latestState = useRef({});

    // Effect to update body background color
    useEffect(() => {
        document.body.style.backgroundColor = transparencyMode === 'background' ? 'transparent' : bgColor;
        document.body.style.transition = 'background-color 0.3s';
    }, [bgColor, transparencyMode]);
    
    // Effect to sync state to our ref object for the animation loop
    useEffect(() => {
        latestState.current = {
            distortion,
            zoom,
            noise,
            scanlineIntensity,
            bgColor,
            transparencyMode,
            blurAmount,
        };
    }, [distortion, zoom, noise, scanlineIntensity, bgColor, transparencyMode, blurAmount]);

    // Effect for re-drawing the text texture when text-related properties change
    useEffect(() => { 
        if (!textCanvasRef.current || !glRef.current || !textureRef.current) return; const textCtx = textCanvasRef.current.getContext('2d'); const gl = glRef.current; const textCanvas = textCanvasRef.current; if (transparencyMode === 'background') { textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height); } else { textCtx.fillStyle = bgColor; textCtx.fillRect(0, 0, textCanvas.width, textCanvas.height); } textCtx.fillStyle = fontColor; textCtx.font = `bold ${fontSize}px 'Times New Roman'`; textCtx.textAlign = 'center'; textCtx.textBaseline = 'middle'; textCtx.shadowColor = 'rgba(0, 0, 0, 0.5)'; textCtx.shadowBlur = 4; textCtx.shadowOffsetX = 2; textCtx.shadowOffsetY = 2; if (transparencyMode === 'text') { textCtx.globalCompositeOperation = 'destination-out'; } const rawLines = text.split('\n'); const wrappedLines = []; const maxWidth = textCanvas.width * 0.9; rawLines.forEach(line => { if (textCtx.measureText(line).width > maxWidth && line.includes(' ')) { wrappedLines.push(...wrapText(textCtx, line, maxWidth)); } else { wrappedLines.push(line); } }); const lineHeight = parseFloat(fontSize) * parseFloat(lineSpacing); const totalHeight = (wrappedLines.length - 1) * lineHeight; const startY = (textCanvas.height - totalHeight) / 2; wrappedLines.forEach((line, i) => { textCtx.fillText(line, textCanvas.width / 2, startY + i * lineHeight); }); textCtx.globalCompositeOperation = 'source-over'; gl.bindTexture(gl.TEXTURE_2D, textureRef.current); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas); }, [text, fontSize, lineSpacing, fontColor, bgColor, transparencyMode]);

    // Main setup hook (runs only once)
    useEffect(() => {
        const canvas = canvasRef.current;
        const gl = canvas.getContext('webgl', { 
            preserveDrawingBuffer: true,
            alpha: true 
        });
        glRef.current = gl;
        if (!gl) { alert('WebGL not supported'); return; }

        const vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
        const fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
        const shaderProgram = gl.createProgram();
        gl.attachShader(shaderProgram, vertexShader);
        gl.attachShader(shaderProgram, fragmentShader);
        gl.linkProgram(shaderProgram);
        programInfoRef.current = {
            program: shaderProgram,
            attribLocations: {
                position: gl.getAttribLocation(shaderProgram, 'aPosition'),
                texCoord: gl.getAttribLocation(shaderProgram, 'aTexCoord'),
            },
            uniformLocations: {
                sampler: gl.getUniformLocation(shaderProgram, 'uSampler'),
                distortion: gl.getUniformLocation(shaderProgram, 'uDistortion'),
                zoom: gl.getUniformLocation(shaderProgram, 'uZoom'),
                time: gl.getUniformLocation(shaderProgram, 'uTime'),
                noiseAmount: gl.getUniformLocation(shaderProgram, 'uNoiseAmount'),
                scanlineIntensity: gl.getUniformLocation(shaderProgram, 'uScanlineIntensity'),
                scanlineFrequency: gl.getUniformLocation(shaderProgram, 'uScanlineFrequency'),
                blurAmount: gl.getUniformLocation(shaderProgram, 'uBlurAmount'),
            },
        };

        const positionBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW); const texCoordBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]), gl.STATIC_DRAW); buffersRef.current = { position: positionBuffer, texCoord: texCoordBuffer };

        const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); textureRef.current = texture;
        const textCanvas = document.createElement('canvas'); textCanvas.width = 512; textCanvas.height = 512; canvas.width = textCanvas.width; canvas.height = textCanvas.height; gl.viewport(0, 0, canvas.width, canvas.height); textCanvasRef.current = textCanvas;
        
        const textCtx = textCanvas.getContext('2d'); if (transparencyMode === 'background') { textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height); } else { textCtx.fillStyle = bgColor; textCtx.fillRect(0, 0, textCanvas.width, textCanvas.height); } textCtx.fillStyle = fontColor; textCtx.font = `bold ${fontSize}px 'Times New Roman'`; textCtx.textAlign = 'center'; textCtx.textBaseline = 'middle'; if (transparencyMode === 'text') { textCtx.globalCompositeOperation = 'destination-out'; } const initialLines = text.split('\n'); const initialLineHeight = parseFloat(fontSize) * parseFloat(lineSpacing); const totalHeight = (initialLines.length - 1) * initialLineHeight; const startY = (textCanvas.height - totalHeight) / 2; initialLines.forEach((line, i) => { textCtx.fillText(line, textCanvas.width / 2, startY + i * initialLineHeight); }); textCtx.globalCompositeOperation = 'source-over'; gl.bindTexture(gl.TEXTURE_2D, textureRef.current); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
        
        // --- Animation Loop ---
        let renderLoopActive = true;
        const render = (time) => {
            if(!renderLoopActive) return;

            time *= 0.001;
            const currentGl = glRef.current;
            const programInfo = programInfoRef.current;
            
            // Read all dynamic values from the ref
            const {
                distortion, zoom, noise, scanlineIntensity,
                bgColor, transparencyMode, blurAmount
            } = latestState.current;
            
            if (transparencyMode === 'background') {
                currentGl.clearColor(0, 0, 0, 0);
            } else {
                const currentBgRgb = hexToRgb(bgColor);
                currentGl.clearColor(currentBgRgb.r, currentBgRgb.g, currentBgRgb.b, 1.0);
            }
            currentGl.clear(currentGl.COLOR_BUFFER_BIT);

            currentGl.useProgram(programInfo.program);
            
            // ... (Attribute setup is unchanged)
            currentGl.bindBuffer(currentGl.ARRAY_BUFFER, buffersRef.current.position); currentGl.vertexAttribPointer(programInfo.attribLocations.position, 2, currentGl.FLOAT, false, 0, 0); currentGl.enableVertexAttribArray(programInfo.attribLocations.position); currentGl.bindBuffer(currentGl.ARRAY_BUFFER, buffersRef.current.texCoord); currentGl.vertexAttribPointer(programInfo.attribLocations.texCoord, 2, currentGl.FLOAT, false, 0, 0); currentGl.enableVertexAttribArray(programInfo.attribLocations.texCoord);
            
            currentGl.activeTexture(currentGl.TEXTURE0);
            currentGl.bindTexture(currentGl.TEXTURE_2D, textureRef.current);
            currentGl.uniform1i(programInfo.uniformLocations.sampler, 0);

            // Pass the latest values to the shaders
            currentGl.uniform1f(programInfo.uniformLocations.distortion, distortion);
            currentGl.uniform1f(programInfo.uniformLocations.zoom, zoom);
            currentGl.uniform1f(programInfo.uniformLocations.time, time);
            currentGl.uniform1f(programInfo.uniformLocations.noiseAmount, noise);
            currentGl.uniform1f(programInfo.uniformLocations.scanlineIntensity, scanlineIntensity);
            currentGl.uniform1f(programInfo.uniformLocations.scanlineFrequency, canvas.height * 1.5);
            currentGl.uniform1f(programInfo.uniformLocations.blurAmount, blurAmount);
            
            currentGl.drawArrays(currentGl.TRIANGLES, 0, 6);
            
            animationFrameIdRef.current = requestAnimationFrame(render);
        };
        
        requestAnimationFrame(render);

        return () => {
            renderLoopActive = false;
            cancelAnimationFrame(animationFrameIdRef.current);
        };
    }, []);

    const handleReset = () => {
        setDistortion(2); setZoom(1.5); setText("BUT AT\nLEAST\nYOU'LL"); setFontSize(80); setLineSpacing(1.2); setFontColor('#FFFFFF'); setBgColor('#000000'); setNoise(0.05); setScanlineIntensity(0.15); setTransparencyMode('normal');
        setBlurAmount(0.5);
    };
    const handleExport = () => { const link = document.createElement('a'); link.href = canvasRef.current.toDataURL('image/png'); link.download = 'crt-distortion-effect.png'; link.click(); };

    return (
        <>
            <canvas ref={canvasRef} />
            <div className="controls">
                <h4>Lens Effect</h4>
                <label>Distortion: <input type="range" min="0" max="5" step="0.01" value={distortion} onChange={e => setDistortion(parseFloat(e.target.value))} /></label>
                <label>Zoom: <input type="range" min="0.5" max="10" step="0.01" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))}/></label>
                
                <h4>Text & Color</h4>
                <label>
                    Transparency:
                    <select value={transparencyMode} onChange={e => setTransparencyMode(e.target.value)}>
                        <option value="normal">Normal</option>
                        <option value="text">Transparent Text</option>
                        <option value="background">Transparent Background</option>
                    </select>
                </label>
                <label>Font Size: <input type="range" min="20" max="200" step="1" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value, 10))}/></label>
                <label>Line Spacing: <input type="range" min="0.8" max="2.0" step="0.05" value={lineSpacing} onChange={e => setLineSpacing(parseFloat(e.target.value))}/></label>
                <label>Font Color: <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)} disabled={transparencyMode === 'text'} /></label>
                <label>Background: <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} disabled={transparencyMode === 'background'} /></label>

                <h4>CRT & Filter Effects</h4>
                <label>Blur: <input type="range" min="0" max="5" step="0.1" value={blurAmount} onChange={e => setBlurAmount(parseFloat(e.target.value))} /></label>
                <label>Noise: <input type="range" min="0" max="0.2" step="0.005" value={noise} onChange={e => setNoise(parseFloat(e.target.value))}/></label>
                <label>Scanlines: <input type="range" min="0" max="0.5" step="0.01" value={scanlineIntensity} onChange={e => setScanlineIntensity(parseFloat(e.target.value))}/></label>
                
                <div className="text-input">
                    <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Enter multi-line text"></textarea>
                    <div className="button-row">
                        <button onClick={() => setText(text.toUpperCase())}>UPPERCASE</button>
                        <button onClick={() => setText(text.toLowerCase())}>lowercase</button>
                        <button onClick={handleReset}>Reset</button>
                        <button onClick={handleExport}>Export to PNG</button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default BarrelDistortionText;