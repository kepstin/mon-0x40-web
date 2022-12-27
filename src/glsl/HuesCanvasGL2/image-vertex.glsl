#version 300 es

uniform vec3 u_lastHue;
uniform vec4 u_hue;
uniform vec2 u_blur;

in vec2 a_vertexPosition;
in vec2 a_textureCoord;

flat out vec3 v_hue;
flat out vec2 v_blur;
out vec2 v_textureCoord[5];

vec3 srgb_to_linear(vec3 srgb) {
    bvec3 cutoff = greaterThan(srgb, vec3(0.04045));
    vec3 lower = srgb * vec3(1.0 / 12.92);
    vec3 higher = pow((srgb + vec3(0.055)) * vec3(1.0 / 1.055), vec3(2.4));
    return mix(lower, higher, cutoff);
}

void hue() {
    v_hue = mix(srgb_to_linear(u_lastHue.rgb), srgb_to_linear(u_hue.rgb), u_hue.a);
}

void blur() {
    v_textureCoord[0] = a_textureCoord + u_blur * vec2(-0.50, -0.50);
    v_textureCoord[1] = a_textureCoord + u_blur * vec2(-0.25,  0.25);
    v_textureCoord[2] = a_textureCoord + u_blur * vec2( 0.00,  0.00);
    v_textureCoord[3] = a_textureCoord + u_blur * vec2( 0.25, -0.25);
    v_textureCoord[4] = a_textureCoord + u_blur * vec2( 0.50,  0.50);
    v_blur = u_blur * 0.5;
}

void main(void) {
    gl_Position = vec4(a_vertexPosition, 0, 1);
    hue();
    blur();
}
