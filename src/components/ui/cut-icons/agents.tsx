import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutAgents", ({ weight }) => <>
<path d="M5 9H20Q27 9 27 16V26H12Q5 26 5 19Z M16 9V4H21 M5 15H2V21H5 M27 15H30V21H27" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M10 14H12Q14 14 14 16V18H12Q10 18 10 16Z M19 14H21Q23 14 23 16V18H21Q19 18 19 16Z M11 21H19Q21 21 21 23H13Q11 23 11 21Z" fill="currentColor" fillRule="evenodd"/>
</>);
