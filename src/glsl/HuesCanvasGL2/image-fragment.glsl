#version 300 es
precision mediump float;

uniform sampler2D u_image;
uniform vec4 u_backdrop;
uniform vec4 u_overlay;
uniform float u_invert;

flat in vec3 v_hue;
flat in vec2 v_blur;
in vec2 v_textureCoord[5];

out vec4 f_fragColor;

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

vec4 blur() {
    vec4 accum = vec4(0.0);
    vec2 blur = v_blur * vec2(textureSize(u_image, 0));

    vec2 grad_x = dFdx(v_textureCoord[2]);
    grad_x += grad_x * blur.x;
    vec2 grad_y = dFdy(v_textureCoord[2]);
    grad_y += grad_y * blur.y;

    accum += textureGrad(u_image, v_textureCoord[0], grad_x, grad_y) * 0.0614;
    accum += textureGrad(u_image, v_textureCoord[1], grad_x, grad_y) * 0.2448;
    accum += textureGrad(u_image, v_textureCoord[2], grad_x, grad_y) * 0.3877;
    accum += textureGrad(u_image, v_textureCoord[3], grad_x, grad_y) * 0.2448;
    accum += textureGrad(u_image, v_textureCoord[4], grad_x, grad_y) * 0.0614;

    return accum;
}

vec3 overlay(vec3 a, vec3 b) {
    bvec3 thresh = greaterThanEqual(a, vec3(0.5));
    vec3 under = 2.0 * a * b;
    vec3 over = vec3(1.0) - 2.0 * (vec3(1.0) - a) * (vec3(1.0) - b);
    vec3 result = mix(under, over, thresh);
    return clamp(result, 0.0, 1.0);
}

vec4 hard_light(vec4 backdrop, vec3 c_source, float opacity) {
    // Convert to straight alpha
    vec3 c_backdrop = clamp(backdrop.rgb / backdrop.a, 0.0, 1.0);

    // For consistency with flash, do blend effects with gamma encoding.
    c_backdrop = linear_to_srgb(c_backdrop);
    c_source = linear_to_srgb(c_source);

    vec3 c_hard_light = overlay(c_source, c_backdrop);
    vec3 c_result = mix(c_backdrop, c_hard_light, opacity);

    // Convert back to linear light
    c_result = srgb_to_linear(c_result);

    // And convert back to premultiplied alpha
    return vec4(c_result * backdrop.a, backdrop.a);
}

vec4 blend(vec4 source) {
    // Note: source is premultiplied alpha, u_backdrop is straight alpha
    float talpha = source.a + u_backdrop.a * (1.0 - source.a);
    source = vec4((source.rgb + u_backdrop.rgb * u_backdrop.a * (1.0 - source.a)), talpha);
    vec4 blend = hard_light(source, v_hue, 0.7);

    return vec4(blend.rgb + v_hue * (1.0 - blend.a), 1.0);
}

vec4 overlay(vec4 source) {
    return mix(source, vec4(u_overlay.rgb, 1.0), u_overlay.a);
}

vec4 invert(vec4 source) {
    return mix(source, vec4(vec3(1.0) - source.rgb, source.a), u_invert);
}

void main(void) {
    vec4 blur = blur();
    vec4 blend = blend(blur);
    vec4 overlaySample = overlay(blend);
    vec4 invertSample = invert(overlaySample);

    // WebGL framebuffer writes need to be sRGB
    f_fragColor = vec4(linear_to_srgb(invertSample.rgb), 1.0);
}
