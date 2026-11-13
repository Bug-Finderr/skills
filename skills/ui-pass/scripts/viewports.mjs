// Shared by ui-check, judge and motion so shots, judged pieces and recordings use the same viewports.
export const HEIGHT = { 360: 740, 390: 844, 768: 1024, 1440: 900 };
// Full-page shots drop a context's touch emulation; a browser launched with these flags keeps coarse-pointer styles.
export const TOUCH_ARGS = ["--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1"];
