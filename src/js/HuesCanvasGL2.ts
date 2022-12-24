// WebGL 2.0 canvas backend for HuesRender

import  { type RenderParams, type HuesCanvas, calculateImageDrawCoords } from "./HuesRender";
import type { SettingsData } from "./HuesSettings";

import backdropVertex from "../glsl/HuesCanvasGL2/backdrop-vertex.glsl";
import backdropFragment from "../glsl/HuesCanvasGL2/backdrop-fragment.glsl";

import vertexSolid from "../glsl/HuesCanvasGL2/vertex-solid.glsl";
import fragmentSolid from "../glsl/HuesCanvasGL2/fragment-solid.glsl";

function colourToGL(colour: number): Array<number> {
    return [
        (colour >> 16) / 255,
        ((colour >> 8) & 0xff) / 255,
        (colour & 0xff) / 255
    ];
}

type BackdropLocBlock = {
    aVertexPosition: number,
    uLastHue: WebGLUniformLocation,
    uHue: WebGLUniformLocation,
    uBackdrop: WebGLUniformLocation,
    uOverlay: WebGLUniformLocation,
    uInvert: WebGLUniformLocation,
}

type ImageLocBlock = {
    aVertexPosition: number,
    aTextureCoord: number,
    uImage: WebGLUniformLocation,
    uLastHue: WebGLUniformLocation,
    uHue: WebGLUniformLocation,
    uBlur: WebGLUniformLocation,
    uBackdrop: WebGLUniformLocation,
    uOverlay: WebGLUniformLocation,
    uInvert: WebGLUniformLocation,
};

type RenderParamsGL2 = {
    lastHue: Array<number>,
    hue: Array<number>,
    backdrop: Array<number>,
    overlay: Array<number>,
    invert: number,
};

export default class HuesCanvasGL2 implements HuesCanvas {
    #root: HTMLElement;

    #canvas: HTMLCanvasElement;
    #gl: WebGL2RenderingContext;
    #extAnisotropic: EXT_texture_filter_anisotropic;

    #needShaderCompile: boolean;

    #backdropShader: WebGLProgram | null;
    #backdropLocBlock: BackdropLocBlock | null;
    #backdropPosBuf: WebGLBuffer;

    #imageShader: WebGLProgram | null;
    #imageLocBlock: ImageLocBlock | null;
    #imagePosBuf: WebGLBuffer;
    #imageTexturePosBuf: WebGLBuffer;

    #imgTextureMap: WeakMap<HTMLImageElement, WebGLTexture>;

    constructor(root: HTMLElement) {
        this.#root = root;

        const canvas = this.#canvas = document.createElement("canvas");
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
        this.#backdropShader = null;
        this.#backdropLocBlock = null;
        this.#imageShader = null;
        this.#imageLocBlock = null;
        window.setTimeout(() => { this.#compileShaders(); });

        const backdropPosBuf = this.#backdropPosBuf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, backdropPosBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, 1, 1, -1, -1, 1, -1]), gl.STATIC_DRAW);

        const imagePosBuf = this.#imagePosBuf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, imagePosBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, 1, 1, -1, -1, 1, -1]), gl.DYNAMIC_DRAW);

        const imageTexturePosBuf = this.#imageTexturePosBuf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, imageTexturePosBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.DYNAMIC_DRAW);

        this.#imgTextureMap = new WeakMap();
    }

    #compileBackdropShader(): void {
        const gl = this.#gl;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vertexShader, backdropVertex);
        gl.compileShader(vertexShader);

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fragmentShader, backdropFragment);
        gl.compileShader(fragmentShader);

        const shader = gl.createProgram()!;
        gl.attachShader(shader, vertexShader);
        gl.attachShader(shader, fragmentShader);
        gl.linkProgram(shader);

        if (!gl.getProgramParameter(shader, gl.LINK_STATUS)) {
            console.log(gl.getProgramInfoLog(shader));
            throw new Error("Failed to compile backdrop shader program");
        }
        this.#backdropShader = shader;

        this.#backdropLocBlock = {
            aVertexPosition: gl.getAttribLocation(shader, "a_vertexPosition"),
            uLastHue: gl.getUniformLocation(shader, "u_lastHue")!,
            uHue: gl.getUniformLocation(shader, "u_hue")!,
            uBackdrop: gl.getUniformLocation(shader, "u_backdrop")!,
            uOverlay: gl.getUniformLocation(shader, "u_overlay")!,
            uInvert: gl.getUniformLocation(shader, "u_invert")!,
        }
    }

    #compileImageShader(): void {
        const gl = this.#gl;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vertexShader, vertexSolid);
        gl.compileShader(vertexShader);

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fragmentShader, fragmentSolid);
        gl.compileShader(fragmentShader);

        const shader = gl.createProgram()!;
        gl.attachShader(shader, vertexShader);
        gl.attachShader(shader, fragmentShader);
        gl.linkProgram(shader)

        if (!gl.getProgramParameter(shader, gl.LINK_STATUS)) {
            console.log(gl.getProgramInfoLog(shader));
            throw new Error("Failed to compile image shader program");
        }
        this.#imageShader = shader;

        this.#imageLocBlock = {
            aVertexPosition: gl.getAttribLocation(shader, "a_vertexPosition"),
            aTextureCoord: gl.getAttribLocation(shader, "a_textureCoord"),
            uImage: gl.getUniformLocation(shader, "u_image")!,
            uLastHue: gl.getUniformLocation(shader, "u_lastHue")!,
            uHue: gl.getUniformLocation(shader, "u_hue")!,
            uBlur: gl.getUniformLocation(shader, "u_blur")!,
            uBackdrop: gl.getUniformLocation(shader, "u_backdrop")!,
            uOverlay: gl.getUniformLocation(shader, "u_overlay")!,
            uInvert: gl.getUniformLocation(shader, "u_invert")!,
        };
    }

    #compileShaders(): void {
        if (!this.#needShaderCompile) { return; }

        this.#compileBackdropShader();
        this.#compileImageShader();

        this.#needShaderCompile = false;
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

    #drawBackdrop(params: RenderParams, glParams: RenderParamsGL2): void {
        const gl = this.#gl;

        gl.disable(gl.BLEND);

        const shader = this.#backdropShader!;
        gl.useProgram(shader);

        const loc = this.#backdropLocBlock!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.#backdropPosBuf);
        gl.enableVertexAttribArray(loc.aVertexPosition);
        gl.vertexAttribPointer(loc.aVertexPosition, 2, gl.FLOAT, false, 0, 0);

        gl.uniform3fv(loc.uLastHue, glParams.lastHue);
        gl.uniform4fv(loc.uHue, glParams.hue);
        gl.uniform4fv(loc.uBackdrop, glParams.backdrop);
        gl.uniform4fv(loc.uOverlay, glParams.overlay);
        gl.uniform1f(loc.uInvert, glParams.invert);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    #drawImage(params: RenderParams, glParams: RenderParamsGL2): void {
        if (!params.bitmap) { return; }

        const gl = this.#gl;

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        const shader = this.#imageShader!;
        gl.useProgram(shader);

        const loc = this.#imageLocBlock!;

        const { width, height } = this.#canvas;
        let [x, y, drawWidth, drawHeight] = calculateImageDrawCoords(
            width, height, params.bitmap.naturalWidth, params.bitmap.naturalHeight, params.bitmapAlign, params.bitmapCenter);
        const x1 = x / (width / 2.0) - 1.0;
        const x2 = (x + drawWidth) / (width / 2.0) - 1.0;
        const y1 = y / (height / 2.0) - 1.0;
        const y2 = (y + drawHeight) / (height / 2.0) - 1.0;

        gl.bindBuffer(gl.ARRAY_BUFFER, this.#imagePosBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x1, y2, x2, y2, x1, y1, x2, y1]), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(loc.aVertexPosition);
        gl.vertexAttribPointer(loc.aVertexPosition, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.#imageTexturePosBuf);
        gl.enableVertexAttribArray(loc.aTextureCoord);
        gl.vertexAttribPointer(loc.aTextureCoord, 2, gl.FLOAT, false, 0, 0);

        if (params.bitmap) {
            const texture = this.#getImgTexture(params.bitmap);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(loc.uImage, 0);
        }

        gl.uniform3fv(loc.uLastHue, glParams.lastHue);
        gl.uniform4fv(loc.uHue, glParams.hue);
        gl.uniform2f(loc.uBlur, params.xBlur * 1280, params.yBlur * 1280);
        gl.uniform4fv(loc.uBackdrop, glParams.backdrop);
        gl.uniform4fv(loc.uOverlay, glParams.overlay);
        gl.uniform1f(loc.uInvert, glParams.invert);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    draw(params: RenderParams): void {
        this.#compileShaders();

        const gl = this.#gl;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        const colourFade = (params.colourFade === undefined) ? 1.0 : params.colourFade;
        const glParams: RenderParamsGL2 = {
            lastHue: colourToGL(params.lastColour),
            hue: [...colourToGL(params.colour), colourFade],
            backdrop: (params.bgColour == "transparent") ? [0.0, 0.0, 0.0, 0.0] : [...colourToGL(params.bgColour), 1.0],
            overlay: [...colourToGL(params.overlayColour), Math.min(params.overlayPercent, 1.0)],
            invert: params.invert ? 1.0 : 0.0,
        };

        this.#drawBackdrop(params, glParams);
        this.#drawImage(params, glParams);
    }

    resize(): void {
        this.#canvas.width = Math.round(this.#root.clientWidth * window.devicePixelRatio);
        this.#canvas.height = Math.round(this.#root.clientHeight * window.devicePixelRatio);
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
