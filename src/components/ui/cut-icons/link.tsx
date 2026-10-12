import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutLink", ({ weight, maskId }) => <>
<path d="M12 10L16 6Q22 0 27 5Q32 10 26 16L22 20 M10 12L6 16Q0 22 5 27Q10 32 16 26L20 22" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M12.8328 20.8642L21.8485 11.8485L21.1358 11.1358Q20.1515 10.1515 19.1672 11.1358L10.1515 20.1515L10.8642 20.8642Q11.8485 21.8485 12.8328 20.8642Z" fill="currentColor" fillRule="evenodd"/>
</>);
