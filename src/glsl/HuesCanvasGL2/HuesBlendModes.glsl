
mediump vec4 alphaUnPremultiply(mediump vec4 c);
mediump vec4 alphaPremultiply(mediump vec4 c);
mediump vec3 srgbToLinear(mediump vec3 srgb);
mediump vec3 linearToSrgb(mediump vec3 linear);
mediump float renderParamInvert();
mediump vec3 blendOverlay(mediump vec3 a, mediump vec3 b);

mediump vec4 huesHardLight(mediump vec4 source, mediump vec3 colour) {
    source = alphaUnPremultiply(source);

    mediump vec3 c_source = source.rgb;

    c_source = mix(c_source, vec3(1.0) - c_source, renderParamInvert());

    // For consistency with flash, do blend effects with gamma encoding.
    c_source = linearToSrgb(c_source);
    colour = linearToSrgb(colour);

    mediump vec3 c_hard_light = blendOverlay(colour, c_source);
    mediump vec3 c_result = mix(c_source, c_hard_light, 0.7);

    // Convert back to linear light
    c_result = srgbToLinear(c_result);

    return alphaPremultiply(vec4(c_result, source.a));
}
