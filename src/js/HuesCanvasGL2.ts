// WebGL 2.0 canvas backend for HuesRender

import type { RenderParams, HuesCanvas } from "./HuesRender";
import type { SettingsData } from "./HuesSettings";

import vertexSolid from "../glsl/HuesCanvasGL2/vertex-solid.glsl";

import fragmentSolid from "../glsl/HuesCanvasGL2/fragment-solid.glsl";


export default class HuesCanvasGL2 implements HuesCanvas {
    #root: HTMLElement;

    #baseWidth: number;
    #baseHeight: number;

    #canvas: HTMLCanvasElement;
    #gl: WebGL2RenderingContext;
    #extAnisotropic: EXT_texture_filter_anisotropic;

    #needShaderCompile: boolean;
    #shaderProgram: WebGLProgram | null;
    #positionBuf: WebGLBuffer;
    #imagePositionBuf: WebGLBuffer;

    #imgTextureMap: WeakMap<HTMLImageElement, WebGLTexture>;

    constructor(root: HTMLElement) {
        this.#root = root;

        const canvas = this.#canvas = document.createElement("canvas");
        canvas.width = this.#baseWidth = 1280;
        canvas.height = this.#baseHeight = 720;
        canvas.className = "hues-canvas";
        root.appendChild(canvas);

        const contextOpts: WebGLContextAttributes = {
            alpha: false,
            depth: false,
            stencil: false,
            antialias: false,
            premultipliedAlpha: true,
        }
        const gl = this.#gl = canvas.getContext("webgl2", contextOpts)!;
        this.#extAnisotropic = gl.getExtension("EXT_texture_filter_anisotropic")!;

        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);

        gl.clearColor(1.0, 1.0, 1.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        this.#needShaderCompile = true;
        this.#shaderProgram = null;
        window.setTimeout(() => { this.#compileShaders(); });

        const positionBuf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, 1, 1, -1, -1, 1, -1]), gl.STATIC_DRAW);
        this.#positionBuf = positionBuf;

        const imagePositionBuf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, imagePositionBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.DYNAMIC_DRAW);
        this.#imagePositionBuf = imagePositionBuf;

        this.#imgTextureMap = new WeakMap();
    }

    #compileShaders() {
        if (!this.#needShaderCompile) { return; }

        const gl = this.#gl;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vertexShader, vertexSolid);
        gl.compileShader(vertexShader);

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fragmentShader, fragmentSolid);
        gl.compileShader(fragmentShader);

        const shaderProgram = gl.createProgram()!;
        gl.attachShader(shaderProgram, vertexShader);
        gl.attachShader(shaderProgram, fragmentShader);
        gl.linkProgram(shaderProgram)

        if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
            console.log(gl.getProgramInfoLog(shaderProgram));
            throw new Error("Failed to compile shader program");
        }

        this.#needShaderCompile = false;
        this.#shaderProgram = shaderProgram;
    }

    #getImgTexture(bitmap: HTMLImageElement): WebGLTexture {
        let lookupTexture: WebGLTexture | undefined;
        if (lookupTexture = this.#imgTextureMap.get(bitmap)) {
            return lookupTexture;
        }

        const gl = this.#gl;
        const extAnisotropic = this.#extAnisotropic;

        const maxAnisotropy = gl.getParameter(extAnisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT);

        const texture: WebGLTexture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 9);
        gl.texParameterf(gl.TEXTURE_2D, extAnisotropic.TEXTURE_MAX_ANISOTROPY_EXT, maxAnisotropy);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, bitmap);
        gl.generateMipmap(gl.TEXTURE_2D);
        this.#imgTextureMap.set(bitmap, texture);

        return texture;
    }

    draw(params: RenderParams): void {
        this.#compileShaders();

        const gl = this.#gl;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        const shader = this.#shaderProgram!;
        gl.useProgram(shader);

        const aVertexPosition = gl.getAttribLocation(shader, "a_vertexPosition");
        gl.bindBuffer(gl.ARRAY_BUFFER, this.#positionBuf);
        gl.enableVertexAttribArray(aVertexPosition);
        gl.vertexAttribPointer(aVertexPosition, 2, gl.FLOAT, false, 0, 0);

        const aTextureCoord = gl.getAttribLocation(shader, "a_textureCoord");
        gl.bindBuffer(gl.ARRAY_BUFFER, this.#imagePositionBuf);
        gl.enableVertexAttribArray(aTextureCoord);
        gl.vertexAttribPointer(aTextureCoord, 2, gl.FLOAT, false, 0, 0);

        if (params.bitmap) {
            const texture = this.#getImgTexture(params.bitmap);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            const uImage = gl.getUniformLocation(shader, "u_image");
            gl.uniform1i(uImage, 0);
        }

        const uHue = gl.getUniformLocation(shader, "u_hue");
        gl.uniform3f(
            uHue,
            (params.colour >> 16) / 255,
            ((params.colour >> 8) & 0xff) / 255,
            (params.colour & 0xff) / 255
        );

        const uBlur = gl.getUniformLocation(shader, "u_blur");
        gl.uniform2f(uBlur, params.xBlur * 1280, params.yBlur * 1280);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    resize(): void {
        let height = this.#root.clientHeight;
        let ratio = this.#root.clientWidth / height;
        this.#canvas.height = Math.min(height * window.devicePixelRatio, this.#baseHeight);
        this.#canvas.width = Math.ceil(this.#canvas.height * ratio);
    }

    setBlurQuality(quality: SettingsData["blurQuality"]): void {
        // TODO: figure out how these settings might be meaningfully used.
        // I'm thinking maybe:
        //   low     => single pass multisample (no combined blur), 8 samples
        //   medium  => single pass multisample (no combined blur), up to 27 samples
        //   high    => single pass anisotrophic blur, max hardware supported
        //   extreme => multidirection multisampling with anisotropic smoothing?
    }
}
