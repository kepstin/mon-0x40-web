// WebGL 2.0 canvas backend for HuesRender

import  { type RenderParams, type HuesCanvas, calculateImageDrawCoords } from "./HuesRender";
import type { SettingsData } from "./HuesSettings";

import gammaFunctionsSource from "../glsl/HuesCanvasGL2/GammaFunctions.glsl";
import alphaFunctionsSource from "../glsl/HuesCanvasGL2/AlphaFunctions.glsl";
import blendFunctionsSource from "../glsl/HuesCanvasGL2/BlendFunctions.glsl";
import fragmentDefaultPrecisionSource from "../glsl/HuesCanvasGL2/FragmentDefaultPrecision.glsl";
import renderParamsSource from "../glsl/HuesCanvasGL2/RenderParams.glsl";
import huesBlendModesSource from "../glsl/HuesCanvasGL2/HuesBlendModes.glsl";
import backdropVertexSource from "../glsl/HuesCanvasGL2/BackdropVertex.glsl";
import backdropFragmentSource from "../glsl/HuesCanvasGL2/BackdropFragment.glsl";
import imageVertexSource from "../glsl/HuesCanvasGL2/ImageVertex.glsl";
import imageFragmentSource from "../glsl/HuesCanvasGL2/ImageFragment.glsl";

enum ColourBufferIndex {
    LastColour = 0,
    Colour = 1,
    Background = 2,
    Overlay = 3,
}

function colourBufferWrite(colourTextureBuf: Uint8Array, index: ColourBufferIndex, colour: number, alpha: number) {
    const i = index * 4;
    colourTextureBuf[i] = (colour >> 16) & 0xff;
    colourTextureBuf[i + 1] = (colour >> 8) & 0xff;
    colourTextureBuf[i + 2] = colour & 0xff;
    colourTextureBuf[i + 3] = Math.round(alpha * 255);
}

function shaderConcatSourcesGLES3(...sources: string[]): string {
    let concatSources = ["#version 300 es\n"];
    for (let i = 0; i < sources.length; i++) {
        concatSources.push(`#line 1 ${i + 1}\n`, sources[i]);
    }
    const concatSource = concatSources.join('');
    //console.log(concatSource);
    return concatSource;
}

type BackdropLocBlock = {
    aVertexPosition: number,
}

type ImageLocBlock = {
    aVertexPosition: number,
    aTextureCoord: number,
    uImage: WebGLUniformLocation,
    uBlur: WebGLUniformLocation,
};

type RenderParamsBlock = {
    colour: WebGLUniformLocation | null,
    invert: WebGLUniformLocation | null,
}

export default class HuesCanvasGL2 implements HuesCanvas {
    #root: HTMLElement;

    #canvas: HTMLCanvasElement;
    #gl: WebGL2RenderingContext;
    #extAnisotropic: EXT_texture_filter_anisotropic;

    #needShaderCompile: boolean;

    #backdropShader: WebGLProgram | null;
    #backdropLocBlock: BackdropLocBlock | null;
    #backdropRenderParams: RenderParamsBlock;
    #backdropPosBuf: WebGLBuffer;

    #imageShader: WebGLProgram | null;
    #imageLocBlock: ImageLocBlock | null;
    #imageRenderParams: RenderParamsBlock;
    #imagePosBuf: WebGLBuffer;
    #imageTexturePosBuf: WebGLBuffer;

    // A 1×4 texture containing the following colours, in order:
    //   lastColour, colour, background, overlay
    // Texture format is SRGB8_ALPHA8 with straight alpha.
    #colourTextureBuf: Uint8Array;
    #colourTexture: WebGLTexture;

    #imgTextureMap: WeakMap<HTMLImageElement, WebGLTexture>;

    shutterWidth: number;

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
        const extAnisotropic = this.#extAnisotropic = gl.getExtension("EXT_texture_filter_anisotropic")!;

        const vendor = gl.getParameter(gl.VENDOR);
        const renderer = gl.getParameter(gl.RENDERER);
        const version = gl.getParameter(gl.VERSION);
        console.log("OpenGL:", vendor, '--', renderer, '--', version);

        let maxAnisotropy = gl.getParameter(extAnisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
        console.log("Max Anisotropy supported by GPU:", maxAnisotropy);

        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        this.#needShaderCompile = true;
        this.#backdropShader = null;
        this.#backdropLocBlock = null;
        this.#backdropRenderParams = { colour: null, invert: null };
        this.#imageShader = null;
        this.#imageLocBlock = null;
        this.#imageRenderParams = { colour: null, invert: null };
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

        const colourTextureBuf = this.#colourTextureBuf = new Uint8Array(16);
        const colourTexture = this.#colourTexture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, colourTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, 4, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, colourTextureBuf);

        this.shutterWidth = 1;
    }

    #compileBackdropShader(): void {
        const gl = this.#gl;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
        const vertexShaderSource = shaderConcatSourcesGLES3(
            alphaFunctionsSource,
            gammaFunctionsSource,
            renderParamsSource,
            blendFunctionsSource,
            huesBlendModesSource,
            backdropVertexSource
        );
        gl.shaderSource(vertexShader, vertexShaderSource);
        gl.compileShader(vertexShader);

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        const fragmentShaderSource = shaderConcatSourcesGLES3(
            fragmentDefaultPrecisionSource,
            gammaFunctionsSource,
            backdropFragmentSource
        );
        gl.shaderSource(fragmentShader, fragmentShaderSource);
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
        };

        this.#backdropRenderParams = {
            colour: gl.getUniformLocation(shader, "u_colour"),
            invert: gl.getUniformLocation(shader, "u_invert"),
        };
    }

    #compileImageShader(): void {
        const gl = this.#gl;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
        const vertexShaderSource = shaderConcatSourcesGLES3(
            alphaFunctionsSource,
            gammaFunctionsSource,
            renderParamsSource,
            imageVertexSource
        )
        gl.shaderSource(vertexShader, vertexShaderSource);
        gl.compileShader(vertexShader);

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        const fragmentShaderSource = shaderConcatSourcesGLES3(
            fragmentDefaultPrecisionSource,
            alphaFunctionsSource,
            gammaFunctionsSource,
            blendFunctionsSource,
            renderParamsSource,
            huesBlendModesSource,
            imageFragmentSource
        )
        gl.shaderSource(fragmentShader, fragmentShaderSource);
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
            uBlur: gl.getUniformLocation(shader, "u_blur")!,
        };
        this.#imageRenderParams = {
            colour: gl.getUniformLocation(shader, "u_colour"),
            invert: gl.getUniformLocation(shader, "u_invert"),
        }
    }

    #compileShaders(): void {
        if (!this.#needShaderCompile) { return; }

        this.#compileBackdropShader();
        this.#compileImageShader();

        this.#needShaderCompile = false;
    }

    #setImgTexture(bitmap: HTMLImageElement): void {
        const gl = this.#gl;

        let lookupTexture: WebGLTexture | undefined;
        if (lookupTexture = this.#imgTextureMap.get(bitmap)) {
            gl.bindTexture(gl.TEXTURE_2D, lookupTexture);
            return;
        }

        const extAnisotropic = this.#extAnisotropic;
        let maxAnisotropy = gl.getParameter(extAnisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT);

        const texture: WebGLTexture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 9);
        gl.texParameterf(gl.TEXTURE_2D, extAnisotropic.TEXTURE_MAX_ANISOTROPY_EXT, maxAnisotropy);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, bitmap);
        gl.generateMipmap(gl.TEXTURE_2D);
        this.#imgTextureMap.set(bitmap, texture);
    }

    #setColourTexture(params: RenderParams, last: boolean): void {
        const gl = this.#gl;

        const colourTexture = this.#colourTexture;
        gl.bindTexture(gl.TEXTURE_2D, colourTexture);

        const colourTextureBuf = this.#colourTextureBuf;
        colourBufferWrite(colourTextureBuf, ColourBufferIndex.LastColour, params.lastColour, 1.0);
        if (last) {
            colourBufferWrite(colourTextureBuf, ColourBufferIndex.Colour, params.lastColour, 1.0);
        } else {
            const colourFade = (params.colourFade === undefined) ? 1.0 : params.colourFade;
            colourBufferWrite(colourTextureBuf, ColourBufferIndex.Colour, params.colour, colourFade);
        }
        if (params.bgColour == "transparent") {
            colourBufferWrite(colourTextureBuf, ColourBufferIndex.Background, 0, 0.0);
        } else {
            colourBufferWrite(colourTextureBuf, ColourBufferIndex.Background, params.bgColour, 1.0);
        }
        colourBufferWrite(colourTextureBuf, ColourBufferIndex.Overlay, params.overlayColour, Math.min(params.overlayPercent, 1.0));

        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, 4, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, colourTextureBuf);
    }

    #setShutterScissor(params: RenderParams, last: boolean): void {
        const gl = this.#gl;
        const { drawingBufferWidth, drawingBufferHeight } = gl;
        const { shutter, shutterDir } = params;
        const shutterWidth = Math.round(this.shutterWidth * window.devicePixelRatio);

        let edge: number;

        switch (shutterDir) {
        case '↓':
            edge = drawingBufferHeight - Math.round((drawingBufferHeight - shutterWidth) * shutter!);
            if (last) {
                gl.scissor(0, 0, drawingBufferWidth, edge - shutterWidth);
            } else {
                gl.scissor(0, edge, drawingBufferWidth, drawingBufferHeight - edge);
            }
            break;
        case '↑':
            edge = Math.round((drawingBufferHeight - shutterWidth) * shutter!);
            if (last) {
                gl.scissor(0, edge + shutterWidth, drawingBufferWidth, drawingBufferHeight - edge - shutterWidth);
            } else {
                gl.scissor(0, 0, drawingBufferWidth, edge);
            }
            break;
        case '←':
            edge = drawingBufferWidth - Math.round((drawingBufferWidth - shutterWidth) * shutter!);
            if (last) {
                gl.scissor(0, 0, edge - shutterWidth, drawingBufferHeight);
            } else {
                gl.scissor(edge, 0, drawingBufferWidth - edge, drawingBufferHeight);
            }
            break;
        case '→':
            edge = Math.round((drawingBufferWidth - shutterWidth) * shutter!);
            if (last) {
                gl.scissor(edge + shutterWidth, 0, drawingBufferWidth - edge - shutterWidth, drawingBufferHeight);
            } else {
                gl.scissor(0, 0, edge, drawingBufferHeight);
            }
            break;
        }

    }

    #assignRenderParams(loc: RenderParamsBlock, params: RenderParams): void {
        const gl = this.#gl;

        gl.uniform1i(loc.colour, 0);
        gl.uniform1f(loc.invert, params.invert ? 1.0 : 0.0);
    }

    #drawBackdrop(params: RenderParams): void {
        const gl = this.#gl;

        gl.useProgram(this.#backdropShader);

        this.#assignRenderParams(this.#backdropRenderParams, params);

        const loc = this.#backdropLocBlock!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.#backdropPosBuf);
        gl.enableVertexAttribArray(loc.aVertexPosition);
        gl.vertexAttribPointer(loc.aVertexPosition, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    #drawImage(params: RenderParams, last: boolean): void {
        const bitmap = last ? params.lastBitmap : params.bitmap;
        const bitmapAlign = last ? params.lastBitmapAlign : params.bitmapAlign;
        const bitmapCenter = last ? params.lastBitmapCenter : params.bitmapCenter;
        if (!bitmap) { return; }

        const gl = this.#gl;

        gl.useProgram(this.#imageShader);

        this.#assignRenderParams(this.#imageRenderParams, params);

        const loc = this.#imageLocBlock!;

        const { naturalWidth, naturalHeight } = bitmap;
        const { width, height } = this.#canvas;
        let [x, y, drawWidth, drawHeight] = calculateImageDrawCoords(
            width, height, naturalWidth, naturalHeight, bitmapAlign, bitmapCenter);
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

        gl.uniform1i(loc.uImage, 1);
        gl.uniform2f(loc.uBlur, params.xBlur * 1280 / naturalWidth, params.yBlur * 1280 / naturalHeight);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    draw(params: RenderParams): void {
        this.#compileShaders();

        const gl = this.#gl;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        gl.clear(gl.COLOR_BUFFER_BIT);

        if (params.shutter !== undefined) {
            gl.enable(gl.SCISSOR_TEST);
            this.#setShutterScissor(params, false);
        }

        gl.activeTexture(gl.TEXTURE0);
        this.#setColourTexture(params, false);

        this.#drawBackdrop(params);

        if (params.bitmap) {
            gl.activeTexture(gl.TEXTURE1);
            this.#setImgTexture(params.bitmap);
            this.#drawImage(params, false);
        }

        if (params.shutter !== undefined) {
            this.#setShutterScissor(params, true);

            gl.activeTexture(gl.TEXTURE0);
            this.#setColourTexture(params, true);

            this.#drawBackdrop(params);

            if (params.bitmap) {
                gl.activeTexture(gl.TEXTURE1);
                this.#setImgTexture(params.lastBitmap!);
                this.#drawImage(params, true);
            }

            gl.disable(gl.SCISSOR_TEST);
        }

        gl.flush();
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
