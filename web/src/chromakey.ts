// WebGL port of GreenScreenShader.gdshader.
//
// Original GLSL logic:
//   distance = length(color.rgb - chroma_key_color.rgb)
//   if distance <= pickup_range: discard
//   fade_factor = smoothstep(pickup_range, pickup_range + fade_amount, distance)
//   COLOR = vec4(color.rgb, fade_factor)
// If chroma_key_color.a < 1.0, the shader is effectively disabled (passthrough, alpha=1).
//
// We run this every animation frame, sampling a <video> element as a texture,
// and write to the provided <canvas>.

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec4 u_chroma;   // rgba; if a < 1, disable
uniform float u_pickup;
uniform float u_fade;
out vec4 outColor;
void main() {
  vec4 color = texture(u_tex, v_uv);
  if (u_chroma.a < 0.99) {
    outColor = vec4(color.rgb, 1.0);
    return;
  }
  float d = length(color.rgb - u_chroma.rgb);
  if (d <= u_pickup) discard;
  float fade = smoothstep(u_pickup, u_pickup + u_fade, d);
  outColor = vec4(color.rgb, fade);
}`;

export interface ChromaParams {
  chroma: { r: number; g: number; b: number; a: number };
  pickup: number;
  fade: number;
}

export class ChromaKeyRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private locs: {
    tex: WebGLUniformLocation;
    chroma: WebGLUniformLocation;
    pickup: WebGLUniformLocation;
    fade: WebGLUniformLocation;
  };
  private rafId: number | null = null;
  private running = false;

  constructor(private canvas: HTMLCanvasElement, private video: HTMLVideoElement) {
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: false, alpha: true });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;

    this.program = link(gl, compile(gl, gl.VERTEX_SHADER, VERT), compile(gl, gl.FRAGMENT_SHADER, FRAG));

    // Fullscreen triangle quad
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.locs = {
      tex: gl.getUniformLocation(this.program, "u_tex")!,
      chroma: gl.getUniformLocation(this.program, "u_chroma")!,
      pickup: gl.getUniformLocation(this.program, "u_pickup")!,
      fade: gl.getUniformLocation(this.program, "u_fade")!,
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  start(params: ChromaParams) {
    this.running = true;
    const { gl, video, canvas, program, texture, locs } = this;

    const tick = () => {
      if (!this.running) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.uniform1i(locs.tex, 0);
        gl.uniform4f(locs.chroma, params.chroma.r, params.chroma.g, params.chroma.b, params.chroma.a);
        gl.uniform1f(locs.pickup, params.pickup);
        gl.uniform1f(locs.fade, params.fade);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`Program link failed: ${log}`);
  }
  return p;
}
