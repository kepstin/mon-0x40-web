#version 300 es
precision mediump float;

flat in vec4 v_hue;

out vec4 f_fragColor;

void main(void) {
    f_fragColor = v_hue;
}
