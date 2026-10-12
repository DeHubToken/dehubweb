import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutArcade", ({ weight, maskId }) => <>
<path d="M9 8H22Q26 8 27 13L29 24Q29.5 27 26 27L21 22H11L6 27Q2.5 27 3 24L5 13Q6 8 9 8Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M9.2760 16.1000L14.0000 16.1000L14.0000 15.1760Q14.0000 13.9000 12.7240 13.9000L8.0000 13.9000L8.0000 14.8240Q8.0000 16.1000 9.2760 16.1000Z" fill="currentColor" fillRule="evenodd"/><path d="M9.9000 13.2760L9.9000 18.0000L10.8240 18.0000Q12.1000 18.0000 12.1000 16.7240L12.1000 12.0000L11.1760 12.0000Q9.9000 12.0000 9.9000 13.2760Z" fill="currentColor" fillRule="evenodd"/><path d="M21 12H22Q23.5 12 23.5 13.5V15H22Q20.5 15 20.5 13.5V12Z M24 17H25Q26.5 17 26.5 18.5V20H25Q23.5 20 23.5 18.5V17Z" fill="currentColor" fillRule="evenodd"/>
</>);
