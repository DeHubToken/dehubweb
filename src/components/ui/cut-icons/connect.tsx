import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutConnect", ({ weight }) => <>
<path d="M8 12H24V17Q24 24 16 24Q8 24 8 17Z M16 24V29" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M10 3H12Q14 3 14 5V12H12Q10 12 10 10Z M20 3H22Q24 3 24 5V12H22Q20 12 20 10Z" fill="currentColor" fillRule="evenodd"/>
</>);
