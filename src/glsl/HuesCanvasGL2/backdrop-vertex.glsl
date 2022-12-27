#version 300 es

uniform vec3 u_lastHue;
uniform vec4 u_hue;
uniform vec4 u_backdrop;
uniform vec4 u_overlay;
uniform float u_invert;

in vec2 a_vertexPosition;

flat out vec4 v_hue;

vec3 srgb_to_linear(vec3 srgb) {
    bvec3 cutoff = greaterThan(srgb, vec3(0.04045));
    vec3 lower = srgb * vec3(1.0 / 12.92);
    vec3 higher = pow((srgb + vec3(0.055)) * vec3(1.0 / 1.055), vec3(2.4));
    return mix(lower, higher, cutoff);
}

vec3 linear_to_srgb(vec3 linear) {
    bvec3 cutoff = greaterThan(linear, vec3(0.0031308));
    vec3 lower = vec3(12.92) * linear;
    vec3 higher = vec3(1.055) * pow(linear, vec3(1.0 / 2.4)) - vec3(0.055);
    return mix(lower, higher, cutoff);
}

vec3 hue() {
    return mix(srgb_to_linear(u_lastHue.rgb), srgb_to_linear(u_hue.rgb), u_hue.a);
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

vec4 blend(vec4 source) {
    // For consistency with flash, do blend effects with gamma encoding
    source.rgb = linear_to_srgb(u_backdrop.rgb);
    vec3 colour = linear_to_srgb(hue());
    vec4 blend = hard_light(source, colour, 0.7);
    blend.rgb = srgb_to_linear(blend.rgb);

    return vec4(mix(hue(), blend.rgb, blend.a), 1.0);
}

vec4 overlay(vec4 source) {
    return mix(source, vec4(u_overlay.rgb, 1.0), u_overlay.a);
}

vec4 invert(vec4 source) {
    return mix(source, vec4(vec3(1.0) - source.rgb, source.a), u_invert);
}

void main(void) {
    gl_Position = vec4(a_vertexPosition, 0, 1);
    vec4 blend = blend(u_backdrop);
    vec4 overlaySample = overlay(blend);
    vec4 invertSample = invert(overlaySample);
    v_hue = invertSample;
}
