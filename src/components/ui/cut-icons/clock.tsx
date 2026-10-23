import React from "react";
import { createCutIcon } from "./create-cut-icon";

export default createCutIcon("CutClock", ({ weight, maskId }) => <>
<path d="M28 16A12 12 0 1 1 4 16A12 12 0 1 1 28 16Z" fill="none" stroke="currentColor" strokeWidth={weight * 1.2} strokeLinejoin="round"/><path d="M14.9000 9.2760L14.9000 16.6798L21.5081 19.9839L21.9213 19.1574Q22.4919 18.0161 21.3506 17.4455L17.1000 15.3202L17.1000 8.0000L16.1760 8.0000Q14.9000 8.0000 14.9000 9.2760Z" fill="currentColor" fillRule="evenodd"/>
</>);
