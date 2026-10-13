import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutGlossary", ({ weight }) => <>
<path d="M7 5H20Q25 5 25 10V24H13Q7 24 7 18V9Q7 5 3 5Q1 5 1 9V11H7 M13 24V26Q13 29 17 29H25Q29 29 29 25V24Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M12 10H18Q20 10 20 12H14Q12 12 12 10Z M12 16H18Q20 16 20 18H14Q12 18 12 16Z" fill="currentColor" fillRule="evenodd"/>
</>);
