#version 300 es
precision mediump float;

uniform vec3 u_hue;
uniform sampler2D u_image;

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

vec4 blend(vec4 tsample, vec3 color) {
    tsample = vec4(tsample.rgb + vec3(1.0) * (1.0 - tsample.a), 1.0);
    return hard_light(tsample, color, 0.7);
}

void main(void) {
    vec4 tsample = texture(u_image, v_textureCoord);
    f_fragColor = blend(tsample, u_hue);
}
