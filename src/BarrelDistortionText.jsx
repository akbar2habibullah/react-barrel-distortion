import React, { useState, useEffect, useRef, useCallback } from 'react';
import './BarrelDistortionText.css';

/* global GIF */

// --- Shaders ---
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
  uniform float uBlurAmount;
  uniform float uGlitchIntensity;
  
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
    
    // --- 2. Glitch Effect (applied before sampling) ---
    if (uGlitchIntensity > 0.0) {
      // Check if this line should glitch based on time and y-coord
      float glitchRandom = random(vec2(floor(uTime * 15.0), floor(distortedCoord.y * 20.0)));
      if (glitchRandom < uGlitchIntensity * 0.2) {
        // How much to displace the line horizontally
        float displacement = (random(vec2(uTime * 30.0, distortedCoord.y * 10.0)) - 0.5) * 0.1;
        distortedCoord.x += displacement;
      }
    }
    
    // --- 3. Sample the texture (with optional blur) ---
    vec4 color;
    if (uBlurAmount > 0.0) {
      vec4 sum = vec4(0.0);
      vec2 texelSize = vec2(1.0 / 512.0, 1.0 / 512.0); 
      float blurStep = uBlurAmount * texelSize.x;
      
      for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
          sum += texture2D(uSampler, distortedCoord + vec2(x, y) * blurStep);
        }
      }
      color = sum / 9.0;
    } else {
      color = texture2D(uSampler, distortedCoord);
    }
    
    // --- 4. Apply CRT Effects ---
    if (distortedCoord.x < 0.0 || distortedCoord.x > 1.0 || 
        distortedCoord.y < 0.0 || distortedCoord.y > 1.0) {
      // Do nothing for out-of-bounds pixels
    } else {
      // a. Scrolling Scanlines
      float scanlineY = distortedCoord.y + uTime * 0.02; // Add time to make them scroll
      float scanline = sin(scanlineY * uScanlineFrequency) * uScanlineIntensity;
      color.rgb -= scanline;
      
      // b. Fast-moving Noise
      // Multiply time by a large number to make the noise animate quickly
      float noise = (random(vTexCoord + uTime * 25.0) - 0.5) * uNoiseAmount;
      color.rgb += noise;
    }
    
    gl_FragColor = color;
  }
`;

// --- Helper Functions ---
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
};

// --- The React Component ---
const BarrelDistortionText = () => {
  // --- State ---
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
  const [glitchIntensity, setGlitchIntensity] = useState(0.5);
  const [isRenderingGif, setIsRenderingGif] = useState(false);

  // --- NEW: State for typing animation ---
  const [enableTypingAnimation, setEnableTypingAnimation] = useState(false);
  const [typingFrameDuration, setTypingFrameDuration] = useState(500); // ms per word/line
  const [typingEndPause, setTypingEndPause] = useState(1500); // ms pause on full text

  // --- Refs ---
  const canvasRef = useRef(null);
  const textCanvasRef = useRef(null);
  const glRef = useRef(null);
  const programInfoRef = useRef(null);
  const buffersRef = useRef(null);
  const textureRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const latestState = useRef({});
  // --- Effects ---
  
  // Effect to sync state to ref
  useEffect(() => {
    latestState.current = {
      ...latestState.current, // Preserve existing properties
      distortion,
      zoom,
      noise,
      scanlineIntensity,
      bgColor,
      transparencyMode,
      blurAmount,
      glitchIntensity
    };
  }, [distortion, zoom, noise, scanlineIntensity, bgColor, transparencyMode, blurAmount, glitchIntensity]);
  
  // Effect to update body background color
  useEffect(() => {
    document.body.style.backgroundColor = transparencyMode === 'background' ? 'transparent' : bgColor;
    document.body.style.transition = 'background-color 0.3s';
  }, [bgColor, transparencyMode]);

  // This function can now be called on-demand to update the text texture.
  const updateTextTexture = useCallback((textToRender) => {
    if (!textCanvasRef.current || !glRef.current || !textureRef.current) return;
    
    const textCtx = textCanvasRef.current.getContext('2d');
    const gl = glRef.current;
    const textCanvas = textCanvasRef.current;

    if (transparencyMode === 'background') {
      textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
    } else {
      textCtx.fillStyle = bgColor;
      textCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);
    }

    textCtx.fillStyle = fontColor;
    textCtx.font = `bold ${fontSize}px 'Times New Roman'`;
    textCtx.textAlign = 'center';
    textCtx.textBaseline = 'middle';
    textCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    textCtx.shadowBlur = 4;
    textCtx.shadowOffsetX = 2;
    textCtx.shadowOffsetY = 2;
    
    if (transparencyMode === 'text') {
      textCtx.globalCompositeOperation = 'destination-out';
    }
    
    const rawLines = textToRender.split('\n');
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

    textCtx.globalCompositeOperation = 'source-over';
    gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);

  }, [fontSize, lineSpacing, fontColor, bgColor, transparencyMode]); // Dependencies

  // Effect to render text to texture for the live preview
  useEffect(() => {
    // This now just calls our refactored function
    updateTextTexture(text);
  }, [text, updateTextTexture]); // Depends on the text state and the function itself
  
  // Main WebGL setup effect (No changes inside, but it's long, so keeping it collapsed)
  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl', { 
      preserveDrawingBuffer: true, 
      alpha: true 
    });
    
    glRef.current = gl;
    
    if (!gl) {
      alert('WebGL not supported');
      return;
    }
    
    // Compile shaders
    const vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
    
    // Create shader program
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    
    // Store program and attribute/uniform locations
    programInfoRef.current = {
      program: shaderProgram,
      attribLocations: {
        position: gl.getAttribLocation(shaderProgram, 'aPosition'),
        texCoord: gl.getAttribLocation(shaderProgram, 'aTexCoord')
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
        glitchIntensity: gl.getUniformLocation(shaderProgram, 'uGlitchIntensity'),
      },
    };
    
    // Create buffers
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);
    
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0
    ]), gl.STATIC_DRAW);
    
    buffersRef.current = {
      position: positionBuffer,
      texCoord: texCoordBuffer
    };
    
    // Create texture
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    textureRef.current = texture;
    
    // Create text canvas
    const textCanvas = document.createElement('canvas');
    textCanvas.width = 512;
    textCanvas.height = 512;
    canvas.width = textCanvas.width;
    canvas.height = textCanvas.height;
    gl.viewport(0, 0, canvas.width, canvas.height);
    textCanvasRef.current = textCanvas;
    
    // Initial text rendering (now uses the dedicated function)
    updateTextTexture(text);
    
    // Draw scene function
    const drawScene = (time) => {
      const currentGl = glRef.current;
      const programInfo = programInfoRef.current;
      const { 
        distortion, 
        zoom, 
        noise, 
        scanlineIntensity, 
        bgColor, 
        transparencyMode, 
        blurAmount, 
        glitchIntensity 
      } = latestState.current;
      
      // Set clear color based on transparency mode
      if (transparencyMode === 'background') {
        currentGl.clearColor(0, 0, 0, 0);
      } else {
        const rgb = hexToRgb(bgColor);
        currentGl.clearColor(rgb.r, rgb.g, rgb.b, 1.0);
      }
      
      currentGl.clear(currentGl.COLOR_BUFFER_BIT);
      currentGl.useProgram(programInfo.program);
      
      // Bind position buffer
      currentGl.bindBuffer(currentGl.ARRAY_BUFFER, buffersRef.current.position);
      currentGl.vertexAttribPointer(programInfo.attribLocations.position, 2, currentGl.FLOAT, false, 0, 0);
      currentGl.enableVertexAttribArray(programInfo.attribLocations.position);
      
      // Bind texture coordinate buffer
      currentGl.bindBuffer(currentGl.ARRAY_BUFFER, buffersRef.current.texCoord);
      currentGl.vertexAttribPointer(programInfo.attribLocations.texCoord, 2, currentGl.FLOAT, false, 0, 0);
      currentGl.enableVertexAttribArray(programInfo.attribLocations.texCoord);
      
      // Bind texture
      currentGl.activeTexture(currentGl.TEXTURE0);
      currentGl.bindTexture(currentGl.TEXTURE_2D, textureRef.current);
      currentGl.uniform1i(programInfo.uniformLocations.sampler, 0);
      
      // Set uniforms
      currentGl.uniform1f(programInfo.uniformLocations.distortion, distortion);
      currentGl.uniform1f(programInfo.uniformLocations.zoom, zoom);
      currentGl.uniform1f(programInfo.uniformLocations.time, time);
      currentGl.uniform1f(programInfo.uniformLocations.noiseAmount, noise);
      currentGl.uniform1f(programInfo.uniformLocations.scanlineIntensity, scanlineIntensity);
      currentGl.uniform1f(programInfo.uniformLocations.scanlineFrequency, canvas.height * 1.5);
      currentGl.uniform1f(programInfo.uniformLocations.blurAmount, blurAmount);
      currentGl.uniform1f(programInfo.uniformLocations.glitchIntensity, glitchIntensity);
      
      // Draw
      currentGl.drawArrays(currentGl.TRIANGLES, 0, 6);
    };
    
    latestState.current.drawScene = drawScene;
    
    // Animation loop
    let renderLoopActive = true;
    const render = (time) => {
      if (!renderLoopActive) return;
      drawScene(time * 0.001);
      animationFrameIdRef.current = requestAnimationFrame(render);
    };
    
    requestAnimationFrame(render);
    
    // Cleanup
    return () => {
      renderLoopActive = false;
      cancelAnimationFrame(animationFrameIdRef.current);
    };
  }, [updateTextTexture, text]);
  
  // --- Event Handlers ---
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
    setTransparencyMode('normal');
    setBlurAmount(0.5);
    setGlitchIntensity(0.5);
    setEnableTypingAnimation(false);
    setTypingFrameDuration(500);
    setTypingEndPause(1500);
  };

  // --- NEW: Helper to generate the text sequence for animation ---
  const generateTextSequence = (fullText) => {
    const words = fullText.split(/(\s+)/).filter(w => w.trim().length > 0);
    const sequence = [];
    let currentText = '';
    for (let i = 0; i < words.length; i++) {
        currentText = currentText ? `${currentText} ${words[i]}` : words[i];
        sequence.push(currentText);
    }
    return sequence.length > 0 ? sequence : [fullText];
  };
  
  // --- MODIFIED: PNG export now supports typing animation ---
  const handleExportPng = () => {
    const drawScene = latestState.current.drawScene;
    if (!drawScene) {
      console.error("Drawing function not ready.");
      return;
    }

    if (!enableTypingAnimation) {
      // Original behavior
      const link = document.createElement('a');
      link.href = canvasRef.current.toDataURL('image/png');
      link.download = 'crt-distortion-effect.png';
      link.click();
    } else {
      // --- NEW: Animation behavior ---
      const sequence = generateTextSequence(text);
      sequence.forEach((subText, index) => {
        // Update the texture with the current part of the text
        updateTextTexture(subText);
        // Draw the scene (at a static time, since the animation is the text itself)
        drawScene(0); 

        // Create and trigger download for this frame
        const link = document.createElement('a');
        link.href = canvasRef.current.toDataURL('image/png');
        link.download = `crt-animation-frame-${index + 1}.png`;
        link.click();
      });
      // Restore the original full text in the preview
      updateTextTexture(text);
    }
  };
  
  // --- MODIFIED: GIF export now supports typing animation ---
  const handleExportGif = async () => {
    if (isRenderingGif) return;
    setIsRenderingGif(true);
    
    const drawScene = latestState.current.drawScene;
    if (!drawScene) {
      console.error("Drawing function not ready.");
      setIsRenderingGif(false);
      return;
    }
    
    const gif = new GIF({ 
      workers: 2, 
      quality: 10, 
      workerScript: '/gif.worker.js' 
    });

    const fps = 24;
    const frameDelay = 1000 / fps;
    
    if (!enableTypingAnimation) {
      // Original behavior: animate CRT effects over 2 seconds
      const duration = 2;
      const numFrames = duration * fps; 
      for (let i = 0; i < numFrames; i++) {
        const time = i / fps;
        drawScene(time);
        gif.addFrame(canvasRef.current, { copy: true, delay: frameDelay });
      }
    } else {
      // --- NEW: Typing animation behavior ---
      const sequence = generateTextSequence(text);
      let totalTime = 0;

      for (let i = 0; i < sequence.length; i++) {
        const subText = sequence[i];
        const isLastFrame = i === sequence.length - 1;
        
        // Determine duration for this frame (longer pause for the last one)
        const duration = isLastFrame ? typingEndPause : typingFrameDuration;
        const numFramesForWord = Math.round((duration / 1000) * fps);

        // Update the texture with the current text
        updateTextTexture(subText);

        // Render this text for its specified duration
        for (let j = 0; j < numFramesForWord; j++) {
          drawScene(totalTime);
          gif.addFrame(canvasRef.current, { copy: true, delay: frameDelay });
          totalTime += 1 / fps;
        }
      }
    }
    
    gif.on('finished', (blob) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'crt-distortion-effect.gif';
      link.click();
      URL.revokeObjectURL(link.href);
      setIsRenderingGif(false);
      updateTextTexture(text);
    });
    
    gif.render();
  };
  
  const allControlsDisabled = isRenderingGif;
  
  // --- Render ---
  return (
    <>
      <canvas ref={canvasRef} />
      <div className="controls">
        <h4>Lens Effect</h4>
        <label>
          Distortion: 
          <input 
            type="range" 
            disabled={allControlsDisabled} 
            min="0" 
            max="5" 
            step="0.01" 
            value={distortion} 
            onChange={e => setDistortion(parseFloat(e.target.value))} 
          />
        </label>
        <label>
          Zoom: 
          <input 
            type="range" 
            disabled={allControlsDisabled} 
            min="0.5" 
            max="10" 
            step="0.01" 
            value={zoom} 
            onChange={e => setZoom(parseFloat(e.target.value))}
          />
        </label>
        
        <h4>Text & Color</h4>
        <label>
          Transparency: 
          <select 
            disabled={allControlsDisabled} 
            value={transparencyMode} 
            onChange={e => setTransparencyMode(e.target.value)}
          >
            <option value="normal">Normal</option>
            <option value="text">Transparent Text</option>
            <option value="background">Transparent Background</option>
          </select>
        </label>
        <label>
          Font Size: 
          <input 
            type="range" 
            disabled={allControlsDisabled} 
            min="20" 
            max="200" 
            step="1" 
            value={fontSize} 
            onChange={e => setFontSize(parseInt(e.target.value, 10))}
          />
        </label>
        <label>
          Line Spacing: 
          <input 
            type="range" 
            disabled={allControlsDisabled} 
            min="0.8" 
            max="2.0" 
            step="0.05" 
            value={lineSpacing} 
            onChange={e => setLineSpacing(parseFloat(e.target.value))}
          />
        </label>
        <label>
          Font Color: 
          <input 
            type="color" 
            disabled={allControlsDisabled || transparencyMode === 'text'} 
            value={fontColor} 
            onChange={e => setFontColor(e.target.value)} 
          />
        </label>
        <label>
          Background: 
          <input 
            type="color" 
            disabled={allControlsDisabled || transparencyMode === 'background'} 
            value={bgColor} 
            onChange={e => setBgColor(e.target.value)} 
          />
        </label>
        
        <h4>CRT & Filter Effects</h4>
        <label>
          Blur: 
          <input 
            type="range" 
            disabled={allControlsDisabled} 
            min="0" 
            max="5" 
            step="0.1" 
            value={blurAmount} 
            onChange={e => setBlurAmount(parseFloat(e.target.value))} 
          />
        </label>
        <label>
          Glitch: 
          <input 
            type="range" 
            disabled={allControlsDisabled} 
            min="0" 
            max="1" 
            step="0.05" 
            value={glitchIntensity} 
            onChange={e => setGlitchIntensity(parseFloat(e.target.value))} 
          />
        </label>
        <label>
          Noise: 
          <input 
            type="range" 
            disabled={allControlsDisabled} 
            min="0" 
            max="0.2" 
            step="0.005" 
            value={noise} 
            onChange={e => setNoise(parseFloat(e.target.value))}
          />
        </label>
        <label>
          Scanlines: 
          <input 
            type="range" 
            disabled={allControlsDisabled} 
            min="0" 
            max="0.5" 
            step="0.01" 
            value={scanlineIntensity} 
            onChange={e => setScanlineIntensity(parseFloat(e.target.value))}
          />
        </label>

        {/* --- NEW: Typing Animation Controls --- */}
        <h4>Typing Animation (Export)</h4>
        <label>
          Enable:
          <input
            type="checkbox"
            disabled={allControlsDisabled}
            checked={enableTypingAnimation}
            onChange={e => setEnableTypingAnimation(e.target.checked)}
          />
        </label>
        <label>
          Word Duration (ms):
          <input
            type="range"
            disabled={allControlsDisabled || !enableTypingAnimation}
            min="100"
            max="2000"
            step="50"
            value={typingFrameDuration}
            onChange={e => setTypingFrameDuration(parseInt(e.target.value, 10))}
          />
        </label>
        <label>
          End Pause (ms):
          <input
            type="range"
            disabled={allControlsDisabled || !enableTypingAnimation}
            min="0"
            max="5000"
            step="100"
            value={typingEndPause}
            onChange={e => setTypingEndPause(parseInt(e.target.value, 10))}
          />
        </label>
        
        <div className="text-input">
          <textarea 
            disabled={allControlsDisabled} 
            value={text} 
            onChange={e => setText(e.target.value)} 
            placeholder="Enter multi-line text"
          ></textarea>
          <div className="button-row">
            <button 
              disabled={allControlsDisabled} 
              onClick={() => setText(text.toUpperCase())}
            >
              UPPERCASE
            </button>
            <button 
              disabled={allControlsDisabled} 
              onClick={() => setText(text.toLowerCase())}
            >
              lowercase
            </button>
            <button 
              disabled={allControlsDisabled} 
              onClick={handleReset}
            >
              Reset
            </button>
            <button 
              disabled={allControlsDisabled} 
              onClick={handleExportPng}
            >
              {enableTypingAnimation ? 'Export PNGs' : 'Export PNG'}
            </button>
            <button 
              disabled={allControlsDisabled} 
              onClick={handleExportGif}
            >
              {isRenderingGif ? 'Rendering GIF...' : 'Export GIF'}
            </button>
          </div>
          <div className='footer'>
            Copyright © 2025 <a href="https://github.com/akbar2habibullah/react-barrel-distortion" target="_blank" rel="noopener noreferrer">Habibullah Akbar</a>. <br/>
            All rights reserved.
          </div>
        </div>
      </div>
    </>
  );
};

export default BarrelDistortionText;