#version 300 es

uniform vec3 u_lastHue;
uniform vec4 u_hue;

in vec2 a_vertexPosition;
in vec2 a_textureCoord;

flat out vec3 v_hue;
out vec2 v_textureCoord;

void main(void) {
    gl_Position = vec4(a_vertexPosition, 0, 1);
    v_hue = mix(u_lastHue, u_hue.rgb, u_hue.a);
    v_textureCoord = a_textureCoord;
}
