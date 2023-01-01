mediump vec3 srgbToLinear(mediump vec3 srgb) {
    bvec3 cutoff = greaterThan(srgb, vec3(0.04045));
    mediump vec3 lower = srgb * vec3(1.0 / 12.92);
    mediump vec3 higher = pow((srgb + vec3(0.055)) * vec3(1.0 / 1.055), vec3(2.4));
    return mix(lower, higher, cutoff);
}

mediump vec3 linearToSrgb(mediump vec3 linear) {
    bvec3 cutoff = greaterThan(linear, vec3(0.0031308));
    mediump vec3 lower = vec3(12.92) * linear;
    mediump vec3 higher = vec3(1.055) * pow(linear, vec3(1.0 / 2.4)) - vec3(0.055);
    return mix(lower, higher, cutoff);
}
