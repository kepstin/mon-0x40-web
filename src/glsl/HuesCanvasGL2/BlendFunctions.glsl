mediump vec3 blendMultiply(mediump vec3 a, mediump vec3 b) {
    return a * b;
}

mediump vec3 blendScreen(mediump vec3 a, mediump vec3 b) {
    return vec3(1.0) - (vec3(1.0) - a) * (vec3(1.0) - b);
}

mediump vec3 blendOverlay(mediump vec3 a, mediump vec3 b) {
    bvec3 thresh = greaterThanEqual(a, vec3(0.5));
    mediump vec3 under = 2.0 * a * b;
    mediump vec3 over = vec3(1.0) - 2.0 * (vec3(1.0) - a) * (vec3(1.0) - b);
    return mix(under, over, thresh);
}
