import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutApps", ({ weight, maskId }) => <>
<path d="M4 4H14V10Q14 14 10 14H4Z M18 4H28V14H22Q18 14 18 10Z M4 18H10Q14 18 14 22V28H4Z M22 18H28V28H18V22Q18 18 22 18Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="miter"/>
</>);
