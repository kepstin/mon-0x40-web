// Alpha blend a over b. Inputs are straight, output is straight.
mediump vec4 alphaOverStraight(mediump vec4 a, mediump vec4 b) {
    mediump float out_alpha = a.a + b.a * (1.0 - a.a);
    return vec4(
        (a.rgb * a.a + b.rgb * b.a * (1.0 - a.a)) / out_alpha,
        out_alpha
    );
}

// Alpha blend a over b. Inputs are premultiplied, output is premultiplied.
mediump vec4 alphaOver(mediump vec4 a, mediump vec4 b) {
    return a + b * (1.0 - a.a);
}

mediump vec4 alphaUnPremultiply(mediump vec4 c) {
    return vec4(
        clamp(c.rgb / c.a, 0.0, 1.0),
        c.a
    );
}

mediump vec4 alphaPremultiply(mediump vec4 c) {
    return vec4(c.rgb * c.a, c.a);
}
