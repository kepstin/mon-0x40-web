#version 300 es

in vec2 a_vertexPosition;
in vec2 a_textureCoord;

out vec2 v_textureCoord;

void main(void) {
    gl_Position = vec4(a_vertexPosition, 0, 1);
    v_textureCoord = a_textureCoord;
}
