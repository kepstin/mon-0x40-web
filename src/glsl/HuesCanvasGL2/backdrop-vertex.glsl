#version 300 es

uniform vec3 u_lastHue;
uniform vec4 u_hue;
uniform vec4 u_backdrop;
uniform vec4 u_overlay;
uniform float u_invert;

in vec2 a_vertexPosition;

flat out vec4 v_hue;

vec3 hue() {
    return mix(u_lastHue.rgb, u_hue.rgb, u_hue.a);
}

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

vec4 blend() {
    vec3 colour = hue();
    vec4 blend = hard_light(u_backdrop, colour, 0.7);
    return vec4(mix(colour, blend.rgb, blend.a), 1.0);
}

vec4 overlay(vec4 source) {
    return mix(source, vec4(u_overlay.rgb, 1.0), u_overlay.a);
}

vec4 invert(vec4 source) {
    return mix(source, vec4(vec3(1.0) - source.rgb, source.a), u_invert);
}

void main(void) {
    gl_Position = vec4(a_vertexPosition, 0, 1);
    vec4 blend = blend();
    vec4 overlaySample = overlay(blend);
    vec4 invertSample = invert(overlaySample);
    v_hue = invertSample;
}
