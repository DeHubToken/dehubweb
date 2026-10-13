import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutTrending", ({ weight }) => <>
<path d="M17 3Q23 10 22 14L27 10Q30 16 27 23Q24 29 16 29Q7 29 5 22Q3 16 10 9L9 16Q16 12 17 3Z M17 17Q22 21 20 25Q18 28 14 26Q10 23 17 17Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
