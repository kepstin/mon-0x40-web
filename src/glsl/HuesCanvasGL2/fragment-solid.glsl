#version 300 es
precision mediump float;

uniform vec3 u_hue;

out vec4 f_fragColor;

void main(void) {
    f_fragColor = vec4(u_hue, 1.0);
}
