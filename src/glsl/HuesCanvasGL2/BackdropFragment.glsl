mediump vec3 linearToSrgb(mediump vec3 linear);

flat in vec4 v_hue;

out vec4 f_fragColor;

void main(void) {
    f_fragColor = vec4(linearToSrgb(v_hue.rgb), 1.0);
}
