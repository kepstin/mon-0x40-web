#version 300 es

in vec2 a_vertexPosition;

void main(void) {
    gl_Position = vec4(a_vertexPosition, 0, 1);
}
