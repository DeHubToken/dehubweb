import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutSignout", ({ weight, maskId }) => <>
<path d="M4 4H12Q17 4 17 9V28H4Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M13.3920 17.2000L28.0000 17.2000L28.0000 16.1920Q28.0000 14.8000 26.6080 14.8000L12.0000 14.8000L12.0000 15.8080Q12.0000 17.2000 13.3920 17.2000Z" fill="currentColor" fillRule="evenodd"/><path d="M23.1358 12.8328L26.3029 16.0000L22.1515 20.1515L22.8642 20.8642Q23.8485 21.8485 24.8328 20.8642L29.6971 16.0000L23.8485 10.1515L23.1358 10.8642Q22.1515 11.8485 23.1358 12.8328Z" fill="currentColor" fillRule="evenodd"/>
</>);
