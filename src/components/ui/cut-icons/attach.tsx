import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutAttach", ({ weight, maskId }) => <>
<path d="M10 17L19 8Q23 4 27 8Q30 11 26 15L14 27Q9 32 4 27Q0 23 5 18L17 6 M10 17L9 18Q7 20 9 22Q11 24 13 22L24 11" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
