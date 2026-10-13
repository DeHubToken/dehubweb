import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutGrowing", ({ weight }) => <>
<path d="M9 4H13Q18 4 18 9Q18 14 13 14H9Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M3 28V19H13Q22 19 22 27V28H21Q19.6 28 19.6 26.6Q19.4 21.4 13 21.4H5.4V26.6Q5.4 28 4 28Z" fill="currentColor" fillRule="evenodd"/><path d="M24.2760 11.1000L31.0000 11.1000L31.0000 10.1760Q31.0000 8.9000 29.7240 8.9000L23.0000 8.9000L23.0000 9.8240Q23.0000 11.1000 24.2760 11.1000Z" fill="currentColor" fillRule="evenodd"/><path d="M25.9000 7.2760L25.9000 14.0000L26.8240 14.0000Q28.1000 14.0000 28.1000 12.7240L28.1000 6.0000L27.1760 6.0000Q25.9000 6.0000 25.9000 7.2760Z" fill="currentColor" fillRule="evenodd"/>
</>);
