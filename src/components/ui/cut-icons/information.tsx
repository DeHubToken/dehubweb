import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutInformation", ({ weight, maskId }) => <>
<path d="M4 4H17Q28 4 28 15V28H15Q4 28 4 17Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M14.8000 15.3920L14.8000 24.0000L15.8080 24.0000Q17.2000 24.0000 17.2000 22.6080L17.2000 14.0000L16.1920 14.0000Q14.8000 14.0000 14.8000 15.3920Z" fill="currentColor" fillRule="evenodd"/><path d="M14.8 8H16Q17.2 8 17.2 9.2V10.4H16Q14.8 10.4 14.8 9.2Z" fill="currentColor" fillRule="evenodd"/>
</>);
