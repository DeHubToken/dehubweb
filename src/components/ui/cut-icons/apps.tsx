import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutApps", ({ weight, maskId }) => <>
<path d="M4 4H10Q14 4 14 8V14H4Z M20 4H24Q28 4 28 8V12H20Z M4 20H10Q14 20 14 24V28H4Z M20 18H24Q28 18 28 22V28H20Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/>
</>);
