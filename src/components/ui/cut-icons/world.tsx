import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutWorld", ({ weight }) => <>
<path d="M28 16A12 12 0 1 1 4 16A12 12 0 1 1 28 16Z M16 4Q6 16 16 28Q26 16 16 4Z M5 12H27 M5 20H27" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
