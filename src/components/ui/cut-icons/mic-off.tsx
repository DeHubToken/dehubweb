import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutMicoff", ({ weight, maskId }) => <>
<defs ><mask id={maskId}><rect width="32" height="32" fill="white"/><path d="M3 3L29 29" stroke="black" strokeWidth={weight * 3.0}/></mask></defs><g mask={`url(#${maskId})`}><path d="M12 4H16Q20 4 20 8V15Q20 19 16 19Q12 19 12 15Z" fill="currentColor" fillRule="evenodd"/><path d="M6 12H7Q8.4 12 8.4 13.4V15Q8.4 23.6 16 23.6Q23.6 23.6 23.6 15V13.4Q23.6 12 25 12H26V15Q26 26 16 26Q6 26 6 15Z" fill="currentColor" fillRule="evenodd"/><path d="M14.8000 26.3920L14.8000 30.0000L15.8080 30.0000Q17.2000 30.0000 17.2000 28.6080L17.2000 25.0000L16.1920 25.0000Q14.8000 25.0000 14.8000 26.3920Z" fill="currentColor" fillRule="evenodd"/></g><path d="M4.1358 5.8328L27.1515 28.8485L27.8642 28.1358Q28.8485 27.1515 27.8642 26.1672L4.8485 3.1515L4.1358 3.8642Q3.1515 4.8485 4.1358 5.8328Z" fill="currentColor" fillRule="evenodd"/>
</>);
