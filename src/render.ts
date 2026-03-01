export type Uniforms = {
  u_time: number;
  u_resolution: [number, number];
  u_bands: [number, number, number];
  u_centroid: number;
  u_onset: number;
  u_mouse: [number, number, number];
  u_eventPos: Array<number>;
  u_eventMeta: Array<number>;
  u_eventCount: number;
};

function createShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error('Shader compile error: ' + err);
  }
  return s;
}

export function createRenderer(canvas: HTMLCanvasElement, vertSrc: string, fragSrc: string) {
  const gl = canvas.getContext('webgl2', { antialias: true })!;
  if (!gl) throw new Error('WebGL2 not supported');

  // compile
  const vs = createShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(program));
  }

  // fullscreen quad
  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // uniform locations
  const uni: Record<string, WebGLUniformLocation | null> = {};
  const names = ['u_time','u_resolution','u_bands','u_centroid','u_onset','u_mouse','u_ripplePos','u_rippleAge'];
  gl.useProgram(program);
  for (const n of names) uni[n] = gl.getUniformLocation(program, n);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(gl.canvas.clientWidth * dpr);
    const h = Math.floor(gl.canvas.clientHeight * dpr);
    if (gl.canvas.width !== w || gl.canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function setUniforms(u: Uniforms) {
    gl.useProgram(program);
    gl.uniform1f(uni.u_time, u.u_time);
    gl.uniform2f(uni.u_resolution, u.u_resolution[0], u.u_resolution[1]);
    gl.uniform3f(uni.u_bands, u.u_bands[0], u.u_bands[1], u.u_bands[2]);
    gl.uniform1f(uni.u_centroid, u.u_centroid);
    gl.uniform1f(uni.u_onset, u.u_onset);
    gl.uniform3f(uni.u_mouse, u.u_mouse[0], u.u_mouse[1], u.u_mouse[2]);
    
    if (uni.u_eventPos) gl.uniform3fv(uni.u_eventPos, new Float32Array(u.u_eventPos));
    if (uni.u_eventMeta) gl.uniform2fv(uni.u_eventMeta, new Float32Array(u.u_eventMeta));
    if (uni.u_eventCount) gl.uniform1i(uni.u_eventCount, u.u_eventCount || 0);
  }

  function draw() {
    resize();
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  return { gl, setUniforms, draw, canvas };
}
