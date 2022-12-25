#version 300 es
precision mediump float;

uniform sampler2D u_image;
uniform vec2 u_blur;
uniform vec4 u_backdrop;
uniform vec4 u_overlay;
uniform float u_invert;

flat in vec3 v_hue;
in vec2 v_textureCoord;

out vec4 f_fragColor;

vec3 multiply(vec3 backdrop, vec3 source) {
    return backdrop * source;
}

vec3 screen(vec3 backdrop, vec3 source) {
    return backdrop + source - (backdrop * source);
}

vec3 hard_light(vec3 backdrop, vec3 source) {
    backdrop *= 2.0;
    vec3 thresh = step(1.0, backdrop);
    vec3 mix = mix(
        screen(backdrop - vec3(1.0), source),
        multiply(backdrop, source),
        thresh
    );
    return clamp(mix, 0.0, 1.0);
}

vec4 hard_light(vec4 backdrop, vec3 c_source, float opacity) {
    vec3 c_backdrop = clamp(backdrop.rgb / backdrop.a, 0.0, 1.0);
    vec3 c_hard_light = hard_light(c_backdrop, c_source);
    vec3 c_result = mix(c_backdrop, c_hard_light, opacity);
    return vec4(c_result * backdrop.a, backdrop.a);
}

vec4 blend(vec4 tsample) {
    float talpha = tsample.a + u_backdrop.a * (1.0 - tsample.a);
    tsample = vec4((tsample.rgb + u_backdrop.rgb * u_backdrop.a * (1.0 - tsample.a)) / talpha, talpha);
    vec4 hl = hard_light(tsample, v_hue, 0.7);
    return vec4(hl.rgb + v_hue * (1.0 - hl.a), 1.0);
}

vec4 overlay(vec4 source) {
    return mix(source, vec4(u_overlay.rgb, 1.0), u_overlay.a);
}

vec4 invert(vec4 source) {
    return mix(source, vec4(vec3(1.0) - source.rgb, source.a), u_invert);
}

void main(void) {
    vec4 tsample = textureGrad(u_image, v_textureCoord, dFdx(v_textureCoord) * u_blur * 2.0, dFdy(v_textureCoord) * u_blur * 2.0);
    vec4 blend = blend(tsample);
    vec4 overlaySample = overlay(blend);
    vec4 invertSample = invert(overlaySample);
    f_fragColor = invertSample;
}
