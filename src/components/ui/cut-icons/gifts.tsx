import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutGifts", ({ weight, maskId }) => <>
<path d="M4 12H28V18H4Z M6 18H26V28H11Q6 28 6 23Z M16 12Q6 12 6 7Q6 3 10 4Q14 5 16 12Q18 5 22 4Q26 3 26 7Q26 12 16 12" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M14.8000 14.3920L14.8000 28.0000L15.8080 28.0000Q17.2000 28.0000 17.2000 26.6080L17.2000 13.0000L16.1920 13.0000Q14.8000 13.0000 14.8000 14.3920Z" fill="currentColor" fillRule="evenodd"/>
</>);
