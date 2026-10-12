import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutLeaderboard", ({ weight, maskId }) => <>
<path d="M9 4H23V12Q23 20 16 20Q9 20 9 12Z M9 7H4V10Q4 16 10 16 M23 7H28V10Q28 16 22 16" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M14.8000 21.3920L14.8000 27.0000L15.8080 27.0000Q17.2000 27.0000 17.2000 25.6080L17.2000 20.0000L16.1920 20.0000Q14.8000 20.0000 14.8000 21.3920Z" fill="currentColor" fillRule="evenodd"/><path d="M11.3920 29.2000L22.0000 29.2000L22.0000 28.1920Q22.0000 26.8000 20.6080 26.8000L10.0000 26.8000L10.0000 27.8080Q10.0000 29.2000 11.3920 29.2000Z" fill="currentColor" fillRule="evenodd"/>
</>);
