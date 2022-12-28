#version 300 es
precision mediump float;

flat in vec4 v_hue;

out vec4 f_fragColor;

vec3 linear_to_srgb(vec3 linear) {
    bvec3 cutoff = greaterThan(linear, vec3(0.0031308));
    vec3 lower = vec3(12.92) * linear;
    vec3 higher = vec3(1.055) * pow(linear, vec3(1.0 / 2.4)) - vec3(0.055);
    return mix(lower, higher, cutoff);
}

void main(void) {
    f_fragColor = vec4(linear_to_srgb(v_hue.rgb), 1.0);
}
