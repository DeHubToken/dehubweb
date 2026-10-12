import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutMessages", ({ weight, maskId }) => <>
<path d="M5 6H21Q27 6 27 12V26L20 21H11Q5 21 5 15Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M11.3920 11.2000L22.0000 11.2000L22.0000 10.1920Q22.0000 8.8000 20.6080 8.8000L10.0000 8.8000L10.0000 9.8080Q10.0000 11.2000 11.3920 11.2000Z" fill="currentColor" fillRule="evenodd"/><path d="M11.3920 15.2000L19.3000 15.2000L19.3000 14.1920Q19.3000 12.8000 17.9080 12.8000L10.0000 12.8000L10.0000 13.8080Q10.0000 15.2000 11.3920 15.2000Z" fill="currentColor" fillRule="evenodd"/><path d="M11.3920 19.2000L22.0000 19.2000L22.0000 18.1920Q22.0000 16.8000 20.6080 16.8000L10.0000 16.8000L10.0000 17.8080Q10.0000 19.2000 11.3920 19.2000Z" fill="currentColor" fillRule="evenodd"/>
</>);
