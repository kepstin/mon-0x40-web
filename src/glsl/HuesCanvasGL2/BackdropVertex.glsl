mediump vec4 alphaOver(mediump vec4 a, mediump vec4 b);
mediump vec3 renderParamColour();
mediump vec4 renderParamBackground();
mediump vec4 renderParamOverlay();
mediump vec4 huesHardLight(mediump vec4 source, mediump vec3 colour);

in vec2 a_vertexPosition;

flat out vec4 v_hue;

mediump vec4 blend(mediump vec4 source) {
    mediump vec3 colour = renderParamColour();
    mediump vec4 blend = huesHardLight(source, colour);
    return alphaOver(blend, vec4(colour, 1.0));
}

mediump vec4 overlay(mediump vec4 source) {
    return alphaOver(renderParamOverlay(), source);
}

void main(void) {
    gl_Position = vec4(a_vertexPosition, 0, 1);

    mediump vec4 source = renderParamBackground();
    mediump vec4 blend = blend(source);
    mediump vec4 overlaySample = overlay(blend);
    v_hue = overlaySample;
}
