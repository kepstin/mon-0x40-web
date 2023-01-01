mediump vec4 alphaOverStraight(mediump vec4 a, mediump vec4 b);
mediump vec4 alphaPremultiply(mediump vec4 c);

uniform sampler2D u_colour;
uniform mediump float u_invert;

const ivec2 COLOUR_BUFFER_LAST_COLOUR = ivec2(0, 0);
const ivec2 COLOUR_BUFFER_COLOUR = ivec2(1, 0);
const ivec2 COLOUR_BUFFER_BACKGROUND = ivec2(2, 0);
const ivec2 COLOUR_BUFFER_OVERLAY = ivec2(3, 0);

mediump vec3 renderParamColour() {
    mediump vec4 lastColour = texelFetch(u_colour, COLOUR_BUFFER_LAST_COLOUR, 0);
    mediump vec4 colour = texelFetch(u_colour, COLOUR_BUFFER_COLOUR, 0);
    return alphaOverStraight(colour, lastColour).rgb;
}

mediump vec4 renderParamBackground() {
    return alphaPremultiply(texelFetch(u_colour, COLOUR_BUFFER_BACKGROUND, 0));
}

mediump float renderParamInvert() {
    return u_invert;
}

mediump vec4 renderParamOverlay() {
    mediump vec4 overlay = texelFetch(u_colour, COLOUR_BUFFER_OVERLAY, 0);
    overlay = vec4(mix(overlay.rgb, vec3(1.0) - overlay.rgb, renderParamInvert()), overlay.a);
    return alphaPremultiply(overlay);
}
