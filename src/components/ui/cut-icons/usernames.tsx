import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutUsernames", ({ weight }) => <>
<path d="M22 12V20Q28 20 28 14Q28 4 18 4H14Q4 4 4 14V19Q4 28 14 28H21 M22 12Q22 9 17 9H15Q10 9 10 15V17Q10 22 15 22Q22 22 22 16Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
