import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutChat", ({ weight }) => <>
<path d="M12 4H22Q28 4 28 10V19L23 16H20 M4 10H14Q20 10 20 16V28L14 24H10Q4 24 4 18Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M8 14H14Q16 14 16 16H10Q8 16 8 14Z M8 19H12Q14 19 14 21H10Q8 21 8 19Z" fill="currentColor" fillRule="evenodd"/>
</>);
