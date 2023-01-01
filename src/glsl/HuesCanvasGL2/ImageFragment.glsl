mediump vec4 alphaOver(mediump vec4 a, mediump vec4 b);
mediump vec3 linearToSrgb(mediump vec3 linear);
mediump vec4 renderParamBackground();
mediump vec4 renderParamOverlay();
mediump vec4 huesHardLight(mediump vec4 source, mediump vec3 colour);

uniform sampler2D u_image;

flat in vec3 v_hue;
flat in vec2 v_blur;
in vec2 v_textureCoord[5];

out vec4 f_fragColor;

vec4 blur() {
    vec4 accum = vec4(0.0);
    vec2 blur = v_blur * vec2(textureSize(u_image, 0));

    vec2 grad_x = dFdx(v_textureCoord[2]);
    grad_x += grad_x * blur.x;
    vec2 grad_y = dFdy(v_textureCoord[2]);
    grad_y += grad_y * blur.y;

    accum += textureGrad(u_image, v_textureCoord[0], grad_x, grad_y) * 0.0614;
    accum += textureGrad(u_image, v_textureCoord[1], grad_x, grad_y) * 0.2448;
    accum += textureGrad(u_image, v_textureCoord[2], grad_x, grad_y) * 0.3877;
    accum += textureGrad(u_image, v_textureCoord[3], grad_x, grad_y) * 0.2448;
    accum += textureGrad(u_image, v_textureCoord[4], grad_x, grad_y) * 0.0614;

    return accum;
}

vec4 blend(vec4 source) {
    vec3 colour = v_hue;
    source = alphaOver(source, renderParamBackground());
    vec4 blend = huesHardLight(source, colour);
    return alphaOver(blend, vec4(colour, 1.0));
}

mediump vec4 overlay(mediump vec4 source) {
    return alphaOver(renderParamOverlay(), source);
}

void main(void) {
    vec4 blur = blur();
    vec4 blend = blend(blur);
    vec4 overlaySample = overlay(blend);

    // WebGL framebuffer writes need to be sRGB
    f_fragColor = vec4(linearToSrgb(overlaySample.rgb), 1.0);
}
