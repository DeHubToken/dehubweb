import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutGovernance", ({ weight, maskId }) => <>
<path d="M5 17H27V27H10Q5 27 5 22Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M11.3920 22.2000L22.0000 22.2000L22.0000 21.1920Q22.0000 19.8000 20.6080 19.8000L10.0000 19.8000L10.0000 20.8080Q10.0000 22.2000 11.3920 22.2000Z" fill="currentColor" fillRule="evenodd"/><path d="M12 3L23 8L18 18L7 13Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M12.1018 11.3746L14.0000 13.2728L18.6364 8.6364L18.1018 8.1018Q17.3636 7.3636 16.6254 8.1018L14.0000 10.7272L12.6364 9.3636L12.1018 9.8982Q11.3636 10.6364 12.1018 11.3746Z" fill="currentColor" fillRule="evenodd"/>
</>);
