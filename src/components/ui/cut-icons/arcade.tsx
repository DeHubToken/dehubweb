import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutArcade", ({ weight, maskId }) => <>
<path d="M9 8H23Q26 8 26.8 12L29 26H26Q24 26 22.7 24.4L20 21H12L9.3 24.4Q8 26 6 26H3L5.2 12Q6 8 9 8Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="miter"/><path d="M8 14H13.8V15.1Q13.8 16.2 12.7 16.2H8Z M9.8 12H12V17Q12 18.2 10.8 18.2H9.8Z" fill="currentColor"/><path d="M21.4 11.8H22.5Q23.6 11.8 23.6 12.9V14H22.5Q21.4 14 21.4 12.9Z M19.3 15.5H20.4Q21.5 15.5 21.5 16.6V17.7H20.4Q19.3 17.7 19.3 16.6Z M23.4 15.5H24.5Q25.6 15.5 25.6 16.6V17.7H24.5Q23.4 17.7 23.4 16.6Z" fill="currentColor"/>
</>);
