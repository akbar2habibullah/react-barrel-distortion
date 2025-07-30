import React, { useState, useEffect, useRef } from 'react';
import './BarrelDistortionText.css';

// --- Shaders (unchanged) ---
const vsSource = `
    attribute vec2 aPosition;
    attribute vec2 aTexCoord;
    varying vec2 vTexCoord;
    void main() {
        gl_Position = vec4(aPosition, 0.0, 1.0);
        vTexCoord = aTexCoord;
    }
`;

const fsSource = `
    precision mediump float;
    uniform sampler2D uSampler;
    uniform float uDistortion;
    uniform float uZoom;
    uniform float uTime;
    uniform float uNoiseAmount;
    uniform float uScanlineIntensity;
    uniform float uScanlineFrequency;
    varying vec2 vTexCoord;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }
    
    void main() {
        vec2 center = vec2(0.5, 0.5);
        vec2 coord = (vTexCoord - center) * uZoom;
        float dist = length(coord);
        float factor = 1.0 + uDistortion * dist * dist;
        vec2 distortedCoord = coord * factor;
        distortedCoord = distortedCoord / uZoom + center;
        
        vec4 color = texture2D(uSampler, distortedCoord);

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

// --- Helper functions (unchanged) ---
const compileShader = (gl, source, type) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
};

const hexToRgb = (hex) => {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
    } : null;
};

const wrapText = (context, text, maxWidth) => {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0] || '';
    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = context.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

// --- The React Component ---
const BarrelDistortionText = () => {
    // State for all controls (unchanged)
    const [distortion, setDistortion] = useState(2);
    const [zoom, setZoom] = useState(1.5);
    const [fontSize, setFontSize] = useState(80);
    const [lineSpacing, setLineSpacing] = useState(1.2);
    const [fontColor, setFontColor] = useState('#FFFFFF');
    const [bgColor, setBgColor] = useState('#000000');
    const [noise, setNoise] = useState(0.05);
    const [scanlineIntensity, setScanlineIntensity] = useState(0.15);
    const [text, setText] = useState("BUT AT\nLEAST\nYOU'LL");
    
    // Refs (unchanged)
    const canvasRef = useRef(null);
    const textCanvasRef = useRef(null);
    const glRef = useRef(null);
    const programInfoRef = useRef(null);
    const buffersRef = useRef(null);
    const textureRef = useRef(null);
    const animationFrameIdRef = useRef(null); // --- CHANGE: Use a ref for the animation frame ID

    // Effect to update body background color (unchanged)
    useEffect(() => {
        document.body.style.backgroundColor = bgColor;
        document.body.style.transition = 'background-color 0.3s';
    }, [bgColor]);

    // --- CHANGE: This useEffect now ONLY handles UPDATES, not the initial render. ---
    // It's still necessary for when the user changes text properties.
    useEffect(() => {
        if (!textCanvasRef.current || !glRef.current || !textureRef.current) return;
        
        const textCtx = textCanvasRef.current.getContext('2d');
        const gl = glRef.current;
        const textCanvas = textCanvasRef.current;

        textCtx.fillStyle = bgColor;
        textCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);
        
        textCtx.fillStyle = fontColor;
        textCtx.font = `bold ${fontSize}px 'Times New Roman'`;
        textCtx.textAlign = 'center';
        textCtx.textBaseline = 'middle';
        textCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        textCtx.shadowBlur = 4;
        textCtx.shadowOffsetX = 2;
        textCtx.shadowOffsetY = 2;
        
        const rawLines = text.split('\n');
        const wrappedLines = [];
        const maxWidth = textCanvas.width * 0.9;
        rawLines.forEach(line => {
            if (textCtx.measureText(line).width > maxWidth && line.includes(' ')) {
                wrappedLines.push(...wrapText(textCtx, line, maxWidth));
            } else {
                wrappedLines.push(line);
            }
        });
        
        const lineHeight = parseFloat(fontSize) * parseFloat(lineSpacing);
        const totalHeight = (wrappedLines.length - 1) * lineHeight;
        const startY = (textCanvas.height - totalHeight) / 2;
        
        wrappedLines.forEach((line, i) => {
            textCtx.fillText(line, textCanvas.width / 2, startY + i * lineHeight);
        });
        
        gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);

    }, [text, fontSize, lineSpacing, fontColor, bgColor]);


    // Effect for ONE-TIME WebGL setup and starting the animation loop
    useEffect(() => {
        const canvas = canvasRef.current;
        const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
        glRef.current = gl;

        if (!gl) {
            alert('WebGL not supported');
            return;
        }

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
            },
        };

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]), gl.STATIC_DRAW);
        buffersRef.current = { position: positionBuffer, texCoord: texCoordBuffer };

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        textureRef.current = texture;

        const textCanvas = document.createElement('canvas');
        textCanvas.width = 512;
        textCanvas.height = 512;
        canvas.width = textCanvas.width;
        canvas.height = textCanvas.height;
        gl.viewport(0, 0, canvas.width, canvas.height);
        textCanvasRef.current = textCanvas;
        
        // --- CHANGE: Perform the initial text draw right here, before starting the animation.
        // This logic is copied from the other useEffect.
        const textCtx = textCanvas.getContext('2d');
        textCtx.fillStyle = bgColor; // Use initial state
        textCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);
        textCtx.fillStyle = fontColor; // Use initial state
        textCtx.font = `bold ${fontSize}px 'Times New Roman'`; // Use initial state
        textCtx.textAlign = 'center';
        textCtx.textBaseline = 'middle';
        const initialLines = text.split('\n'); // Use initial state
        const lineHeight = parseFloat(fontSize) * parseFloat(lineSpacing);
        const totalHeight = (initialLines.length - 1) * lineHeight;
        const startY = (textCanvas.height - totalHeight) / 2;
        initialLines.forEach((line, i) => {
            textCtx.fillText(line, textCanvas.width / 2, startY + i * lineHeight);
        });
        gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
        // --- END CHANGE ---

        const render = (time) => {
            time *= 0.001; 
            
            const currentGl = glRef.current;
            const programInfo = programInfoRef.current;
            const buffers = buffersRef.current;
            
            if (!currentGl || !programInfo || !buffers) return; // Guard against unmount
            
            const currentBgRgb = hexToRgb(bgColor);

            currentGl.clearColor(currentBgRgb.r, currentBgRgb.g, currentBgRgb.b, 1.0);
            currentGl.clear(currentGl.COLOR_BUFFER_BIT);
            currentGl.useProgram(programInfo.program);
            
            currentGl.bindBuffer(currentGl.ARRAY_BUFFER, buffers.position);
            currentGl.vertexAttribPointer(programInfo.attribLocations.position, 2, currentGl.FLOAT, false, 0, 0);
            currentGl.enableVertexAttribArray(programInfo.attribLocations.position);
            
            currentGl.bindBuffer(currentGl.ARRAY_BUFFER, buffers.texCoord);
            currentGl.vertexAttribPointer(programInfo.attribLocations.texCoord, 2, currentGl.FLOAT, false, 0, 0);
            currentGl.enableVertexAttribArray(programInfo.attribLocations.texCoord);
            
            currentGl.activeTexture(currentGl.TEXTURE0);
            currentGl.bindTexture(currentGl.TEXTURE_2D, textureRef.current);
            currentGl.uniform1i(programInfo.uniformLocations.sampler, 0);
            currentGl.uniform1f(programInfo.uniformLocations.distortion, distortion);
            currentGl.uniform1f(programInfo.uniformLocations.zoom, zoom);
            currentGl.uniform1f(programInfo.uniformLocations.time, time);
            currentGl.uniform1f(programInfo.uniformLocations.noiseAmount, noise);
            currentGl.uniform1f(programInfo.uniformLocations.scanlineIntensity, scanlineIntensity);
            currentGl.uniform1f(programInfo.uniformLocations.scanlineFrequency, canvas.height * 1.5);
            
            currentGl.drawArrays(currentGl.TRIANGLES, 0, 6);
            
            animationFrameIdRef.current = requestAnimationFrame(render);
        };
        
        render(0);

        return () => {
            cancelAnimationFrame(animationFrameIdRef.current);
        };
    // --- CHANGE: Make this a true "on mount" effect. We read state inside but it only runs once.
    // The other useEffect handles re-rendering when these state values change.
    }, []); 

    // JSX part remains the same
    const handleReset = () => {
        setDistortion(2);
        setZoom(1.5);
        setText("BUT AT\nLEAST\nYOU'LL");
        setFontSize(80);
        setLineSpacing(1.2);
        setFontColor('#FFFFFF');
        setBgColor('#000000');
        setNoise(0.05);
        setScanlineIntensity(0.15);
    };

    const handleExport = () => {
        const link = document.createElement('a');
        link.href = canvasRef.current.toDataURL('image/png');
        link.download = 'crt-distortion-effect.png';
        link.click();
    };

    return (
        <>
            <canvas ref={canvasRef} />
            <div className="controls">
                <h4>Lens Effect</h4>
                <label>Distortion: <input type="range" min="-5" max="5" step="0.01" value={distortion} onChange={e => setDistortion(e.target.value)} /></label>
                <label>Zoom: <input type="range" min="0.5" max="10" step="0.01" value={zoom} onChange={e => setZoom(e.target.value)}/></label>
                
                <h4>Text & Color</h4>
                <label>Font Size: <input type="range" min="20" max="200" step="1" value={fontSize} onChange={e => setFontSize(e.target.value)}/></label>
                <label>Line Spacing: <input type="range" min="0.8" max="2.0" step="0.05" value={lineSpacing} onChange={e => setLineSpacing(e.target.value)}/></label>
                <label>Font Color: <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)}/></label>
                <label>Background: <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}/></label>

                <h4>CRT Effect</h4>
                <label>Noise: <input type="range" min="0" max="0.2" step="0.005" value={noise} onChange={e => setNoise(e.target.value)}/></label>
                <label>Scanlines: <input type="range" min="0" max="0.5" step="0.01" value={scanlineIntensity} onChange={e => setScanlineIntensity(e.target.value)}/></label>
                
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