import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutEdit", ({ weight, maskId }) => <>
<path d="M5 22L21 6Q23 4 25 6L27 8Q29 10 27 12L11 28H5Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M18.1358 10.8328L23.1515 15.8485L23.8642 15.1358Q24.8485 14.1515 23.8642 13.1672L18.8485 8.1515L18.1358 8.8642Q17.1515 9.8485 18.1358 10.8328Z" fill="currentColor" fillRule="evenodd"/><path d="M6.3920 29.2000L27.0000 29.2000L27.0000 28.1920Q27.0000 26.8000 25.6080 26.8000L5.0000 26.8000L5.0000 27.8080Q5.0000 29.2000 6.3920 29.2000Z" fill="currentColor" fillRule="evenodd"/>
</>);
