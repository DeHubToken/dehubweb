import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutCaptions", ({ weight, maskId }) => <>
<path d="M4 6H21Q28 6 28 13V26H11Q4 26 4 19Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M14 11H11Q7.8 11 7.8 14.2V18Q7.8 21 11 21H14V18.8H11Q10 18.8 10 18V14.2Q10 13.2 11 13.2H14Z M24 11H21Q17.8 11 17.8 14.2V18Q17.8 21 21 21H24V18.8H21Q20 18.8 20 18V14.2Q20 13.2 21 13.2H24Z" fill="currentColor" fillRule="evenodd"/>
</>);
