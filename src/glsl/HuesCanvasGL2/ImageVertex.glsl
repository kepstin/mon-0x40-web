mediump vec3 renderParamColour();

uniform vec2 u_blur;

in vec2 a_vertexPosition;
in vec2 a_textureCoord;

flat out vec3 v_hue;
flat out vec2 v_blur;
out vec2 v_textureCoord[5];

void blur() {
    v_textureCoord[0] = a_textureCoord + u_blur * vec2(-0.8, -0.8);
    v_textureCoord[1] = a_textureCoord + u_blur * vec2(-0.4,  0.4);
    v_textureCoord[2] = a_textureCoord + u_blur * vec2( 0.0,  0.00);
    v_textureCoord[3] = a_textureCoord + u_blur * vec2( 0.4, -0.4);
    v_textureCoord[4] = a_textureCoord + u_blur * vec2( 0.8,  0.8);
    v_blur = u_blur * 1.0;
}

void main(void) {
    gl_Position = vec4(a_vertexPosition, 0, 1);
    v_hue = renderParamColour();
    blur();
}
