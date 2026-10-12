import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutPictureinpicture", ({ weight }) => <>
<path d="M12 26H10Q4 26 4 20V6H21Q28 6 28 13" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M17 17H23Q28 17 28 22V27H21Q17 27 17 23Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
